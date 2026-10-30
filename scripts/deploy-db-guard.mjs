import "dotenv/config";
import { Client } from "pg";

const mode = process.argv[2];
const appRole = "campusconnect_app";
const expectedColumns = {
  User: [
    "INSERT:createdAt", "INSERT:displayName", "INSERT:email", "INSERT:id", "INSERT:isPlatformAdmin", "INSERT:passwordHash", "INSERT:updatedAt",
    "SELECT:displayName", "SELECT:email", "SELECT:id", "SELECT:isActive", "SELECT:isPlatformAdmin", "SELECT:passwordHash"
  ],
  Session: [
    "INSERT:activeCollegeId", "INSERT:expiresAt", "INSERT:id", "INSERT:tokenHash", "INSERT:userId",
    "SELECT:activeCollegeId", "SELECT:createdAt", "SELECT:expiresAt", "SELECT:id", "SELECT:lastSeenAt", "SELECT:tokenHash", "SELECT:userId",
    "UPDATE:activeCollegeId"
  ]
};

if (!["preflight", "fence", "verify", "enable"].includes(mode)) {
  throw new Error("Usage: node scripts/deploy-db-guard.mjs <preflight|fence|verify|enable>");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL migration connection is required.");

const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
try {
  await client.connect();
  const identity = await client.query(`
    SELECT current_user AS username, current_database() AS database,
           r.rolsuper AS superuser, r.rolcreaterole AS can_manage_roles,
           pg_has_role(current_user, 'pg_read_all_stats', 'MEMBER') AS can_read_activity,
           pg_has_role(current_user, 'pg_signal_backend', 'MEMBER') AS can_signal_backends
    FROM pg_roles r WHERE r.rolname = current_user`);
  const actor = identity.rows[0];
  if (!actor || actor.username === appRole) throw new Error("DATABASE_URL must use a privileged migration role, not the application role.");

  if (mode === "preflight" || mode === "fence") {
    if (!actor.superuser && !actor.can_manage_roles) throw new Error("Migration role cannot disable application-role logins.");
    if (!actor.superuser && (!actor.can_read_activity || !actor.can_signal_backends)) {
      throw new Error("Migration role cannot inspect and terminate every application-role connection.");
    }
  }

  if (mode === "fence") {
    await client.query(`ALTER ROLE ${appRole} NOLOGIN`);
    const terminated = await client.query(`
      SELECT pid, pg_terminate_backend(pid) AS terminated
      FROM pg_stat_activity
      WHERE usename = $1 AND pid <> pg_backend_pid()`, [appRole]);
    if (terminated.rows.some((row) => !row.terminated)) throw new Error("Could not terminate every application-role database connection.");
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const remaining = await client.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE usename = $1 AND pid <> pg_backend_pid()", [appRole]);
      if (remaining.rows[0].count === 0) {
        process.stdout.write("Application-role logins disabled; no application-role database sessions remain.\n");
        break;
      }
      if (attempt === 19) throw new Error("Application-role sessions remain after termination; migrations are blocked.");
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  if (mode === "verify") await verifyPrivileges(client);

  if (mode === "enable") {
    await client.query(`ALTER ROLE ${appRole} LOGIN`);
    const login = await client.query("SELECT rolcanlogin FROM pg_roles WHERE rolname = $1", [appRole]);
    if (login.rows[0]?.rolcanlogin !== true) throw new Error("Could not re-enable the application role after verification.");
    process.stdout.write("Application-role logins enabled.\n");
  }

  if (mode === "preflight") process.stdout.write(`Migration connection verified for database ${actor.database}.\n`);
} finally {
  await client.end();
}

async function verifyPrivileges(database) {
  const tables = await database.query(`
    SELECT c.relname AS name, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
           has_table_privilege($1, c.oid, 'SELECT') AS table_select,
           has_table_privilege($1, c.oid, 'INSERT') AS table_insert,
           has_table_privilege($1, c.oid, 'UPDATE') AS table_update,
           has_table_privilege($1, c.oid, 'DELETE') AS table_delete,
           pg_has_role($1, c.relowner, 'MEMBER') AS app_is_owner
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN ('User', 'Session')`, [appRole]);
  const byName = new Map(tables.rows.map((row) => [row.name, row]));
  const user = byName.get("User");
  const session = byName.get("Session");
  if (!user || !session) throw new Error("User or Session table is missing.");
  const runtimeRole = await database.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1", [appRole]);
  if (runtimeRole.rows[0]?.rolsuper || runtimeRole.rows[0]?.rolbypassrls) {
    throw new Error("Application role must not be SUPERUSER or BYPASSRLS.");
  }
  if (user.table_select || user.table_insert || user.table_update || user.table_delete || user.app_is_owner) {
    throw new Error("User has unexpected table-level privileges or application-role ownership.");
  }
  if (session.table_select || session.table_insert || session.table_update || !session.table_delete || session.app_is_owner) {
    throw new Error("Session has unexpected table-level privileges or application-role ownership.");
  }
  if (session.rls !== true || session.forced !== true || user.rls !== true || user.forced !== true) {
    throw new Error("User and Session RLS must be enabled and forced.");
  }

  const columns = await database.query(`
    SELECT table_name, privilege_type, column_name
    FROM information_schema.column_privileges
    WHERE table_schema = 'public' AND table_name IN ('User', 'Session') AND grantee = $1`, [appRole]);
  for (const tableName of ["User", "Session"]) {
    const actual = columns.rows.filter((row) => row.table_name === tableName)
      .map((row) => `${row.privilege_type}:${row.column_name}`).sort();
    const expected = [...expectedColumns[tableName]].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${tableName} column privileges differ from the reviewed allowlist.`);
  }

  const policy = await database.query(`
    SELECT cmd, qual, with_check FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'Session' AND policyname = 'session_token_scope'`);
  if (policy.rowCount !== 1 || policy.rows[0].cmd !== "ALL" ||
      !policy.rows[0].qual?.includes("app.current_session_hash") ||
      !policy.rows[0].with_check?.includes("app.current_session_hash")) {
    throw new Error("Session token-hash RLS policy is missing or unexpected.");
  }
  const userPolicies = await database.query(`
    SELECT policyname, cmd, qual, with_check FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'User'`);
  const userReadPolicy = userPolicies.rows.find((row) => row.policyname === "user_auth_context_read");
  const userInsertPolicy = userPolicies.rows.find((row) => row.policyname === "user_invited_account_create");
  if (userReadPolicy?.cmd !== "SELECT" ||
      !userReadPolicy.qual?.includes("app.auth_email") ||
      !userReadPolicy.qual?.includes("app.current_user_id") ||
      !userReadPolicy.qual?.includes("app.current_session_hash") ||
      userInsertPolicy?.cmd !== "INSERT" ||
      !userInsertPolicy.with_check?.includes("app.auth_email") ||
      !userInsertPolicy.with_check?.includes("isPlatformAdmin")) {
    throw new Error("User RLS authentication and invited-account policies are missing or unexpected.");
  }
  const passwordHash = await database.query("SELECT has_column_privilege($1, 'public.\"User\"', 'passwordHash', 'SELECT') AS allowed", [appRole]);
  if (!passwordHash.rows[0].allowed) throw new Error("Authentication service is missing required column-scoped password-hash access.");
  process.stdout.write("User/Session scoped grants, ownership, forced RLS and token/auth policies verified.\n");
}
