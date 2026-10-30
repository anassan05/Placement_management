import { Pool } from 'pg';
import 'dotenv/config';

const urls = [
  ['development', process.env.DATABASE_URL],
  ['test', process.env.TEST_ADMIN_DATABASE_URL ?? derive(process.env.DATABASE_URL, 'campusconnect_test')]
].filter(([, url]) => Boolean(url));
const expectedForced = [
  'AcademicRecord', 'AuditLog', 'College', 'CollegeAdminInvitation', 'CollegeApplication',
  'CollegeDomain', 'Company', 'DriveRule', 'Membership', 'MembershipDepartment',
  'PlacementDrive', 'PlatformAuditLog', 'RateLimitBucket', 'Registration', 'Session',
  'StudentProfile', 'User'
];

for (const [label, connectionString] of urls) {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const roles = await pool.query(`SELECT r.rolsuper, r.rolbypassrls,
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND pg_has_role('campusconnect_app',c.relowner,'MEMBER')) AS owned_tables
      FROM pg_roles r WHERE r.rolname='campusconnect_app'`);
    const tables = await pool.query(`SELECT c.relname AS name, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity ORDER BY c.relname`);
    const policies = await pool.query(`SELECT count(*)::int AS count FROM pg_policies WHERE schemaname='public'`);
    const actualNames = tables.rows.map((row) => row.name).sort();
    const expected = [...expectedForced].sort();
    const role = roles.rows[0];
    const exceptions = tables.rows.filter((row) => !row.enabled || !row.forced);
    if (!role || role.rolsuper || role.rolbypassrls || role.owned_tables || exceptions.length || JSON.stringify(actualNames) !== JSON.stringify(expected)) {
      throw new Error(`${label}: runtime role or forced-RLS table audit failed.`);
    }
    process.stdout.write(`${label}: app superuser=${role.rolsuper}, bypassRLS=${role.rolbypassrls}, owned tables=${role.owned_tables}, public policy count=${policies.rows[0].count}\n`);
    process.stdout.write(`${label}: forced-RLS tables (${tables.rows.length}): ${actualNames.join(', ')}\n`);
  } finally {
    await pool.end();
  }
}

function derive(source, database) {
  if (!source) return undefined;
  const url = new URL(source);
  url.pathname = `/${database}`;
  return url.toString();
}
