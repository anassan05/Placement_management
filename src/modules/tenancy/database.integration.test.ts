import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createHash } from "node:crypto";
import type { Principal } from "../authorization/permissions";
import { requireDepartmentAccess } from "../authorization/permissions";
import type { PrismaClient } from "../../generated/prisma/client";
import { hashSessionToken, createSessionToken, hashPassword } from "../authentication/session";

const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
const runtimeUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(adminUrl && runtimeUrl);
const tenantTables = [
  "College", "CollegeDomain", "Membership", "MembershipDepartment", "Department", "StaffInvitation", "StaffInvitationDepartment", "StudentProfile",
  "AcademicRecord", "Company", "PlacementDrive", "DriveRule", "Registration", "AuditLog"
] as const;

describe.skipIf(!enabled)("PostgreSQL tenant isolation and security (real database)", () => {
  const admin = new Pool({ connectionString: adminUrl, max: 4 });
  const runtime = new Pool({ connectionString: runtimeUrl, max: 4 });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const collegeA = uuid("10000000", 1);
  const collegeB = uuid("20000000", 2);
  const studentUserA = uuid("30000000", 3);
  const studentUserB = uuid("40000000", 4);
  const adminUserA = uuid("41000000", 15);
  const adminUserB = uuid("42000000", 16);
  const suspendedUser = uuid("43000000", 17);
  const coordinatorUserA = uuid("44000000", 39);
  const coordinatorUserB = uuid("45000000", 40);
  const membershipA = uuid("50000000", 5);
  const membershipB = uuid("60000000", 6);
  const adminMembershipA = uuid("61000000", 18);
  const adminMembershipB = uuid("62000000", 19);
  const suspendedMembership = uuid("63000000", 20);
  const coordinatorMembershipA = uuid("64000000", 41);
  const coordinatorMembershipB = uuid("65000000", 42);
  const departmentA = uuid("67000000", 49);
  const departmentB = uuid("68000000", 50);
  const departmentAUnassigned = uuid("69000000", 51);
  const phase2bEmails = [`phase2b-coord-${suffix}@example.invalid`, `phase2b-officer-${suffix}@example.invalid`];
  const adminMembershipAInB = uuid("66000000", 48);
  const studentA = uuid("70000000", 7);
  const studentB = uuid("80000000", 8);
  const companyA = uuid("90000000", 9);
  const companyB = uuid("91000000", 21);
  const driveA = uuid("a0000000", 10);
  const driveB = uuid("a1000000", 22);
  const ruleA = uuid("a4000000", 35);
  const ruleB = uuid("a5000000", 36);
  const academicA = uuid("a2000000", 23);
  const academicB = uuid("a3000000", 24);
  const registrationA = uuid("b0000000", 11);
  const registrationB = uuid("b1000000", 25);
  const auditA = uuid("b2000000", 37);
  const auditB = uuid("b3000000", 38);
  const domainA = `${suffix}-a.example.edu`;
  const domainB = `${suffix}-b.example.edu`;
  let tenantApi: typeof import("./tenant-context");
  let sessionStore: typeof import("../authentication/session-store");
  let db: PrismaClient;
  let principalA: Extract<Principal, { kind: "membership" }>;
  let principalB: Extract<Principal, { kind: "membership" }>;
  let adminSessionA: string;
  let adminSessionB: string;
  let coordinatorSessionA: string;
  let coordinatorPrincipalA: Extract<Principal, { kind: "membership" }>;
  let coordinatorPrincipalB: Extract<Principal, { kind: "membership" }>;

  beforeAll(async () => {
    // Configure Prisma's singleton before its first import. The runtime URL must
    // be the non-owner application role; fixtures are inserted only via admin.
    process.env.DATABASE_URL = adminUrl;
    process.env.APP_DATABASE_URL = runtimeUrl;
    const dbModule = await import("../../lib/db");
    db = dbModule.db;
    tenantApi = await import("./tenant-context");
    sessionStore = await import("../authentication/session-store");

    try {
      await removeStaleSyntheticFixtures();
      await seedSyntheticFixtures();
      adminSessionA = (await sessionStore.createUserSession(adminUserA, collegeA)).token;
      adminSessionB = (await sessionStore.createUserSession(adminUserB, collegeB)).token;
      coordinatorSessionA = (await sessionStore.createUserSession(coordinatorUserA, collegeA)).token;
      principalA = await tenantApi.resolveMembershipPrincipal(adminSessionA);
      principalB = await tenantApi.resolveMembershipPrincipal(adminSessionB);
      coordinatorPrincipalA = await tenantApi.resolveMembershipPrincipal(coordinatorSessionA);
      const coordinatorSessionB = (await sessionStore.createUserSession(coordinatorUserB, collegeB)).token;
      coordinatorPrincipalB = await tenantApi.resolveMembershipPrincipal(coordinatorSessionB);
    } catch (error) {
      await cleanupSyntheticFixtures();
      throw error;
    }
  }, 30_000);

  afterAll(async () => {
    try {
      await cleanupSyntheticFixtures();
      const residue = await admin.query(`SELECT
        (SELECT count(*)::int FROM "College" WHERE id = ANY($1::uuid[])) AS colleges,
        (SELECT count(*)::int FROM "User" WHERE id = ANY($2::uuid[])) AS users`, [
        [collegeA, collegeB],
        [studentUserA, studentUserB, adminUserA, adminUserB, suspendedUser, coordinatorUserA, coordinatorUserB]
      ]);
      expect(residue.rows[0]).toEqual({ colleges: 0, users: 0 });
    } finally {
      await Promise.allSettled([admin.end(), runtime.end(), db?.$disconnect()]);
    }
  });

  it("confirms RLS, forced RLS, policy command coverage, role attributes, ownership, and grants", async () => {
    const state = await admin.query(`
      SELECT c.relname AS table_name, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced,
             r.rolname AS owner
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner
      WHERE n.nspname='public' AND c.relkind='r' AND c.relname = ANY($1::text[])
      ORDER BY c.relname`, [tenantTables]);
    expect(state.rows).toHaveLength(tenantTables.length);
    for (const row of state.rows) {
      expect(row.enabled, `${row.table_name} RLS enabled`).toBe(true);
      expect(row.forced, `${row.table_name} RLS forced`).toBe(true);
      expect(row.owner).not.toBe("campusconnect_app");
    }

    const policies = await admin.query(`SELECT tablename, policyname, cmd, qual, with_check
      FROM pg_policies WHERE schemaname='public' AND tablename = ANY($1::text[])`, [tenantTables]);
    expect(policies.rowCount).toBe(22);
    for (const table of tenantTables) {
      const tablePolicies = policies.rows.filter((policy) => policy.tablename === table);
      expect(tablePolicies.length, `${table} has policies`).toBeGreaterThan(0);
      const commands = table === "StaffInvitation" ? ["SELECT", "INSERT", "UPDATE"] : table === "StaffInvitationDepartment" ? ["SELECT", "INSERT"] : ["SELECT", "INSERT", "UPDATE", "DELETE"];
      for (const command of commands) {
        expect(tablePolicies.some((policy) => policy.cmd === "ALL" || policy.cmd === command), `${table} covers ${command}`).toBe(true);
      }
      for (const policy of tablePolicies.filter((item) => item.cmd === "ALL" || item.cmd === "INSERT" || item.cmd === "UPDATE")) {
        expect(policy.with_check, `${table}.${policy.policyname} has WITH CHECK`).toBeTruthy();
      }
    }

    const role = await admin.query(`SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname='campusconnect_app'`);
    expect(role.rows).toEqual([{ rolname: "campusconnect_app", rolsuper: false, rolbypassrls: false }]);
    const current = await runtime.query("SELECT current_user AS role, current_database() AS database");
    expect(current.rows[0].role).toBe("campusconnect_app");

    const exceptions = await admin.query(`SELECT c.relname AS table_name,
      has_table_privilege('campusconnect_app', c.oid, 'SELECT') AS can_select,
      has_table_privilege('campusconnect_app', c.oid, 'INSERT') AS can_insert,
      has_table_privilege('campusconnect_app', c.oid, 'UPDATE') AS can_update,
      has_table_privilege('campusconnect_app', c.oid, 'DELETE') AS can_delete,
      (SELECT relrowsecurity FROM pg_class WHERE oid=c.oid) AS rls_enabled,
      (SELECT relforcerowsecurity FROM pg_class WHERE oid=c.oid) AS rls_forced
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('User','Session','_prisma_migrations') ORDER BY c.relname`);
    expect(exceptions.rows.find((row) => row.table_name === "_prisma_migrations")?.can_select).toBe(false);
    expect(exceptions.rows.find((row) => row.table_name === "User")?.rls_enabled).toBe(true);
    expect(exceptions.rows.find((row) => row.table_name === "User")?.rls_forced).toBe(true);
    expect(exceptions.rows.find((row) => row.table_name === "Session")?.rls_enabled).toBe(true);
    expect(exceptions.rows.find((row) => row.table_name === "Session")?.rls_forced).toBe(true);
    expect(exceptions.rows.find((row) => row.table_name === "Session")?.can_select).toBe(false);
    expect(exceptions.rows.find((row) => row.table_name === "Session")?.can_insert).toBe(false);
    expect(exceptions.rows.find((row) => row.table_name === "Session")?.can_update).toBe(false);
    expect(exceptions.rows.find((row) => row.table_name === "Session")?.can_delete).toBe(true);
    expect(exceptions.rows.find((row) => row.table_name === "User")?.can_select).toBe(false);
    expect((await runtime.query('SELECT "passwordHash" FROM "User"')).rowCount).toBe(0);

    const userColumns = await admin.query(`SELECT privilege_type, column_name FROM information_schema.column_privileges
      WHERE table_schema='public' AND table_name='User' AND grantee='campusconnect_app' ORDER BY privilege_type,column_name`);
    expect(userColumns.rows).toEqual([
      { privilege_type: "INSERT", column_name: "createdAt" },
      { privilege_type: "INSERT", column_name: "displayName" },
      { privilege_type: "INSERT", column_name: "email" },
      { privilege_type: "INSERT", column_name: "id" },
      { privilege_type: "INSERT", column_name: "isPlatformAdmin" },
      { privilege_type: "INSERT", column_name: "passwordHash" },
      { privilege_type: "INSERT", column_name: "updatedAt" },
      { privilege_type: "SELECT", column_name: "displayName" },
      { privilege_type: "SELECT", column_name: "email" },
      { privilege_type: "SELECT", column_name: "id" },
      { privilege_type: "SELECT", column_name: "isActive" },
      { privilege_type: "SELECT", column_name: "isPlatformAdmin" },
      { privilege_type: "SELECT", column_name: "passwordHash" }
    ]);
    const limitedColumns = await admin.query(`SELECT table_name, privilege_type, column_name FROM information_schema.column_privileges
      WHERE table_schema='public' AND grantee='campusconnect_app' AND table_name IN ('StaffInvitation','Department')
      AND ((table_name='StaffInvitation' AND privilege_type='UPDATE') OR (table_name='Department' AND privilege_type='DELETE'))`);
    expect(limitedColumns.rows.some((row) => row.table_name === "StaffInvitation" && row.column_name === "role")).toBe(false);
    expect(limitedColumns.rows.some((row) => row.table_name === "StaffInvitation" && row.column_name === "tokenHash")).toBe(false);
    expect(limitedColumns.rows.some((row) => row.table_name === "Department" && row.privilege_type === "DELETE")).toBe(false);
    const identity = await admin.query('SELECT email FROM "User" WHERE id=$1', [adminUserA]);
    const scoped = await runtime.connect();
    try {
      await scoped.query("BEGIN");
      await scoped.query("SELECT set_config('app.auth_email',$1,true)", [identity.rows[0].email]);
      expect((await scoped.query('SELECT id,"passwordHash" FROM "User"')).rows.map((row) => row.id)).toEqual([adminUserA]);
      await scoped.query("SELECT set_config('app.auth_email',$1,true)", [`someone-else-${suffix}@example.invalid`]);
      expect((await scoped.query('SELECT id,"passwordHash" FROM "User"')).rowCount).toBe(0);
      await scoped.query("COMMIT");
    } finally {
      await scoped.query("ROLLBACK").catch(() => undefined);
      scoped.release();
    }
  });

  it("isolates reads and denies cross-tenant insert, update, and delete", async () => {
    const client = await runtime.connect();
    try {
      await client.query("BEGIN");
      await setTenant(client, collegeA);
      expect((await client.query('SELECT id FROM "StudentProfile" ORDER BY id')).rows.map((row) => row.id)).toEqual([studentA]);
      expect((await client.query('SELECT id FROM "Membership" WHERE "collegeId"=$1 OR "collegeId"=$2 ORDER BY id', [collegeA, collegeB])).rows.map((row) => row.id).sort()).toEqual([membershipA, adminMembershipA, suspendedMembership, coordinatorMembershipA].sort());
      expect((await client.query('SELECT "membershipId" FROM "MembershipDepartment" WHERE "collegeId"=$1 OR "collegeId"=$2 ORDER BY "membershipId"', [collegeA, collegeB])).rows.map((row) => row.membershipId).sort()).toEqual([adminMembershipA, coordinatorMembershipA].sort());
      expect((await client.query('SELECT id FROM "Department" WHERE "collegeId"=$1 OR "collegeId"=$2 ORDER BY id', [collegeA, collegeB])).rows.map((row) => row.id).sort()).toEqual([departmentA, departmentAUnassigned].sort());
      expect((await client.query('SELECT id FROM "StudentProfile" WHERE "collegeId"=$1', [collegeB])).rowCount).toBe(0);
      expect((await client.query('SELECT id FROM "Company" WHERE "collegeId"=$1 OR "collegeId"=$2', [collegeA, collegeB])).rows.map((row) => row.id)).toEqual([companyA]);
      expect((await client.query('SELECT id FROM "PlacementDrive" WHERE "collegeId"=$1 OR "collegeId"=$2', [collegeA, collegeB])).rows.map((row) => row.id)).toEqual([driveA]);
      expect((await client.query('SELECT id FROM "DriveRule"')).rows.map((row) => row.id)).toEqual([ruleA]);
      expect((await client.query('SELECT id FROM "Registration" WHERE "collegeId"=$1 OR "collegeId"=$2', [collegeA, collegeB])).rows.map((row) => row.id)).toEqual([registrationA]);
      expect((await client.query('SELECT id FROM "AcademicRecord"')).rows.map((row) => row.id)).toEqual([academicA]);
      expect((await client.query('SELECT id FROM "AuditLog" WHERE "collegeId"=$1 OR "collegeId"=$2', [collegeA, collegeB])).rows.map((row) => row.id)).toEqual([auditA]);
      await client.query("COMMIT");

      await client.query("BEGIN");
      await setTenant(client, collegeA);
      await expect(client.query('INSERT INTO "Company" (id,"collegeId",name,"updatedAt") VALUES ($1,$2,$3,now())', [uuid("c1000000", 26), collegeB, `injected-${suffix}`])).rejects.toMatchObject({ code: "42501" });
      await client.query("ROLLBACK");

      await client.query("BEGIN");
      await setTenant(client, collegeA);
      const update = await client.query('UPDATE "Company" SET name=$1 WHERE id=$2', [`tampered-${suffix}`, companyB]);
      const deletion = await client.query('DELETE FROM "Company" WHERE id=$1', [companyB]);
      expect(update.rowCount).toBe(0);
      expect(deletion.rowCount).toBe(0);
      await client.query("COMMIT");

      await client.query("BEGIN");
      await setTenant(client, collegeA);
      await expect(client.query('UPDATE "Company" SET "collegeId"=$1 WHERE id=$2', [collegeB, companyA])).rejects.toMatchObject({ code: "42501" });
      await client.query("ROLLBACK");
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }

    const adminCheck = await admin.query('SELECT name FROM "Company" WHERE id=$1', [companyB]);
    expect(adminCheck.rows[0].name).toBe("Company B");
  });

  it("denies tenant-owned rows without context and permits only documented public domain metadata", async () => {
    const client = await runtime.connect();
    try {
      for (const table of tenantTables.filter((name) => !["College", "CollegeDomain"].includes(name))) {
        const result = await client.query(`SELECT count(*)::int AS count FROM "${table}"`);
        expect(result.rows[0].count, `${table} without tenant context`).toBe(0);
      }
      expect((await client.query('SELECT count(*)::int AS count FROM "College" WHERE id = ANY($1::uuid[])', [[collegeA, collegeB]])).rows[0].count).toBe(2);
      expect((await client.query('SELECT count(*)::int AS count FROM "CollegeDomain" WHERE "collegeId" = ANY($1::uuid[])', [[collegeA, collegeB]])).rows[0].count).toBe(2);
      expect((await client.query('SELECT id FROM "AcademicRecord"')).rowCount).toBe(0);
      expect((await client.query('SELECT id FROM "Session"')).rowCount).toBe(0);
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_session_hash', $1, true)", ["not-a-real-token-hash"]);
      expect((await client.query('SELECT id FROM "Session"')).rowCount).toBe(0);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("limits Session reads to the presented token hash", async () => {
    const first = await sessionStore.createUserSession(adminUserA, collegeA);
    const second = await sessionStore.createUserSession(adminUserB, collegeB);
    try {
      const client = await runtime.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.current_session_hash', $1, true)", [hashSessionToken(first.token)]);
        expect((await client.query('SELECT "userId" FROM "Session"')).rows.map((row) => row.userId)).toEqual([adminUserA]);
        await client.query("COMMIT");
      } finally {
        client.release();
      }
    } finally {
      await sessionStore.revokeUserSession(first.token);
      await sessionStore.revokeUserSession(second.token);
    }
  });

  it("enforces college-scoped uniqueness while allowing the same register number in another college", async () => {
    await expect(admin.query(`INSERT INTO "College" (id,name,slug,code,"updatedAt") VALUES ($1,'Dup slug',$2,$3,now())`,
      [uuid("c1000000", 43), `rls-a-${suffix}`, `new-code-${suffix}`])).rejects.toMatchObject({ code: "23505" });
    await expect(admin.query(`INSERT INTO "CollegeDomain" (id,"collegeId",hostname) VALUES ($1,$2,$3)`,
      [uuid("c2000000", 44), collegeB, domainA])).rejects.toMatchObject({ code: "23505" });
    await expect(admin.query(`INSERT INTO "StudentProfile" (id,"collegeId","membershipId","registerNumber","fullName","departmentCode","batchYear","updatedAt") VALUES ($1,$2,$3,'RLS-REG-SHARED','Duplicate','CSE',2027,now())`,
      [uuid("c3000000", 45), collegeA, coordinatorMembershipA])).rejects.toMatchObject({ code: "23505" });
    await expect(admin.query(`INSERT INTO "Membership" (id,"collegeId","userId",role,status,"updatedAt") VALUES ($1,$2,$3,'COLLEGE_ADMIN','ACTIVE',now())`,
      [uuid("c4000000", 46), collegeA, adminUserA])).rejects.toMatchObject({ code: "23505" });
    await expect(admin.query(`INSERT INTO "Registration" (id,"collegeId","driveId","studentId",method) VALUES ($1,$2,$3,$4,'IN_APP')`,
      [uuid("c5000000", 47), collegeA, driveA, studentA])).rejects.toMatchObject({ code: "23505" });
  });

  it("prevents context leakage across sequential pooled transactions", async () => {
    const client = await runtime.connect();
    try {
      await client.query("BEGIN");
      await setTenant(client, collegeA);
      expect((await client.query('SELECT id FROM "StudentProfile"')).rows.map((row) => row.id)).toEqual([studentA]);
      await client.query("COMMIT");

      await client.query("BEGIN");
      expect((await client.query('SELECT id FROM "StudentProfile"')).rowCount).toBe(0);
      await client.query("COMMIT");
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }

    expect(await db.studentProfile.count()).toBe(0);
  });

  it("keeps concurrent helper transactions bound to each authenticated membership", async () => {
    expect(Object.isFrozen(principalA)).toBe(true);
    expect(Object.isFrozen(principalA.assignedDepartments)).toBe(true);
    const [rowsA, rowsB] = await Promise.all([
      tenantApi.withTenantTransaction(principalA, async (tx) => {
        await delay(80);
        return tx.studentProfile.findMany({ where: { collegeId: collegeB }, select: { id: true } });
      }),
      tenantApi.withTenantTransaction(principalB, async (tx) => {
        await delay(30);
        return tx.studentProfile.findMany({ where: { collegeId: collegeA }, select: { id: true } });
      })
    ]);
    expect(rowsA).toEqual([]);
    expect(rowsB).toEqual([]);

    const ownCounts = await Promise.all([
      tenantApi.withTenantTransaction(principalA, (tx) => tx.studentProfile.count()),
      tenantApi.withTenantTransaction(principalB, (tx) => tx.studentProfile.count())
    ]);
    expect(ownCounts).toEqual([1, 1]);

    const forgedBodyTenantQuery = await tenantApi.withTenantTransaction(principalA, (tx) =>
      tx.studentProfile.findMany({ where: { collegeId: collegeB } })
    );
    expect(forgedBodyTenantQuery).toEqual([]);
    const forgedPrincipal = { ...principalA, collegeId: collegeB, membershipId: adminMembershipB };
    await expect(tenantApi.withTenantTransaction(forgedPrincipal, async () => "bypassed"))
      .rejects.toThrow("active college membership");
    await expect(tenantApi.withTenantTransaction({ ...principalA }, async () => "bypassed"))
      .rejects.toThrow("active college membership");
  });

  it("loads Coordinator department scopes from persisted assignments", () => {
    expect(coordinatorPrincipalA.role).toBe("COORDINATOR");
    expect(coordinatorPrincipalA.assignedDepartments).toEqual(["CSE"]);
    expect(() => requireDepartmentAccess(coordinatorPrincipalA, "CSE")).not.toThrow();
    expect(() => requireDepartmentAccess(coordinatorPrincipalA, "ECE")).toThrow();
    expect(coordinatorPrincipalB.role).toBe("COORDINATOR");
    expect(coordinatorPrincipalB.assignedDepartments).toEqual(["ECE"]);
    expect(() => requireDepartmentAccess(coordinatorPrincipalB, "ECE")).not.toThrow();
    expect(() => requireDepartmentAccess(coordinatorPrincipalB, "CSE")).toThrow();
  });

  it("creates, accepts, scopes, revokes, and deactivates staff through the real runtime role", async () => {
    const staff = await import("../staff/staff.service");
    const coordEmail = phase2bEmails[0];
    const invitation = await staff.createStaffInvitation(principalA, {
      fullName: "Synthetic Phase 2B Coordinator", email: coordEmail, role: "COORDINATOR", departmentIds: [departmentA], message: "Synthetic test invitation"
    });
    const token = new URL(invitation.invitationUrl).pathname.split("/").at(-1)!;
    expect(await staff.getStaffInvitation(token)).toMatchObject({ email: coordEmail, role: "COORDINATOR", collegeId: collegeA });

    const runtimeClient = await runtime.connect();
    try {
      await runtimeClient.query("BEGIN");
      await setTenant(runtimeClient, collegeB);
      expect((await runtimeClient.query('SELECT id FROM "StaffInvitation"')).rowCount).toBe(0);
      await runtimeClient.query("COMMIT");
      await runtimeClient.query("BEGIN");
      await setTenant(runtimeClient, collegeA);
      await expect(runtimeClient.query('UPDATE "StaffInvitation" SET role=$1 WHERE "tokenHash"=$2', ["PLACEMENT_OFFICER", hashSessionToken(token)])).rejects.toMatchObject({ code: "42501" });
      await runtimeClient.query("ROLLBACK");
    } finally { await runtimeClient.query("ROLLBACK").catch(() => undefined); runtimeClient.release(); }

    const accepted = await staff.acceptStaffInvitation(token, { displayName: "Synthetic Coordinator", password: `Phase2b-${suffix}-Password`, confirmPassword: `Phase2b-${suffix}-Password` });
    const coordinator = await tenantApi.resolveMembershipPrincipal(accepted.token);
    expect(coordinator).toMatchObject({ collegeId: collegeA, role: "COORDINATOR", assignedDepartments: ["CSE"] });
    expect((await staff.listDepartments(coordinator)).map((d) => d.id)).toEqual([departmentA]);
    expect(() => requireDepartmentAccess(coordinator, "ECE")).toThrow();
    await expect(staff.createStaffInvitation(coordinator, { fullName: "No", email: "no@example.invalid", role: "PLACEMENT_OFFICER", departmentIds: [] })).rejects.toThrow();
    await expect(staff.setCoordinatorDepartment(principalA, coordinator.membershipId, departmentAUnassigned, true)).resolves.toBeUndefined();
    expect((await staff.listDepartments(coordinator)).map((d) => d.id).sort()).toEqual([departmentA, departmentAUnassigned].sort());
    await staff.setCoordinatorDepartment(principalA, coordinator.membershipId, departmentAUnassigned, false);
    await expect(staff.setCoordinatorDepartment(principalA, coordinator.membershipId, departmentB, true)).rejects.toThrow();
    await staff.setCoordinatorDepartment(principalA, coordinator.membershipId, departmentAUnassigned, true);
    await staff.setDepartmentActive(principalA, departmentAUnassigned, false);
    const retained = await tenantApi.withTenantTransaction(principalA, (tx) => tx.membershipDepartment.count({ where: { membershipId: coordinator.membershipId, departmentId: departmentAUnassigned } }));
    expect(retained).toBe(1);
    await expect(staff.setCoordinatorDepartment(principalA, coordinator.membershipId, departmentAUnassigned, true)).rejects.toThrow();
    await staff.setDepartmentActive(principalA, departmentAUnassigned, true);
    await staff.setCoordinatorDepartment(principalA, coordinator.membershipId, departmentAUnassigned, false);
    await expect(staff.acceptStaffInvitation(token, { displayName: "Replay", password: `Phase2b-${suffix}-Password`, confirmPassword: `Phase2b-${suffix}-Password` })).rejects.toThrow();
    const login = await (await import("../authentication/login.service")).authenticateCollegeAdmin(coordEmail, `Phase2b-${suffix}-Password`);
    expect((await tenantApi.resolveMembershipPrincipal(login.token)).role).toBe("COORDINATOR");
    await sessionStore.revokeUserSession(login.token);
    await staff.setStaffMembershipActive(principalA, coordinator.membershipId, false);
    await expect(tenantApi.resolveMembershipPrincipal(accepted.token)).rejects.toThrow("active college membership");
    await staff.setStaffMembershipActive(principalA, coordinator.membershipId, true);
    await sessionStore.revokeUserSession(accepted.token);

    const officer = await staff.createStaffInvitation(principalA, { fullName: "Synthetic Officer", email: phase2bEmails[1], role: "PLACEMENT_OFFICER", departmentIds: [] });
    const officerToken = new URL(officer.invitationUrl).pathname.split("/").at(-1)!;
    const officerId = await admin.query('SELECT id FROM "StaffInvitation" WHERE "tokenHash"=$1', [hashSessionToken(officerToken)]);
    await staff.revokeStaffInvitation(principalA, officerId.rows[0].id);
    await expect(staff.acceptStaffInvitation(officerToken, { displayName: "Synthetic Officer", password: `Phase2b-${suffix}-Password`, confirmPassword: `Phase2b-${suffix}-Password` })).rejects.toThrow();

    const concurrent = await staff.createStaffInvitation(principalA, { fullName: "Concurrent Staff", email: `phase2b-concurrent-${suffix}@example.invalid`, role: "PLACEMENT_OFFICER", departmentIds: [] });
    const concurrentToken = new URL(concurrent.invitationUrl).pathname.split("/").at(-1)!;
    const results = await Promise.allSettled([
      staff.acceptStaffInvitation(concurrentToken, { displayName: "Concurrent Staff", password: `Phase2b-${suffix}-Password`, confirmPassword: `Phase2b-${suffix}-Password` }),
      staff.acceptStaffInvitation(concurrentToken, { displayName: "Concurrent Staff", password: `Phase2b-${suffix}-Password`, confirmPassword: `Phase2b-${suffix}-Password` })
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const concurrentSession = results.find((result): result is PromiseFulfilledResult<{ token: string; expiresAt: Date }> => result.status === "fulfilled")!.value;
    await sessionStore.revokeUserSession(concurrentSession.token);
  });

  it("switches a session only among the same user's verified active memberships", async () => {
    const session = await sessionStore.createUserSession(adminUserA, collegeA);
    expect((await tenantApi.resolveMembershipPrincipal(session.token)).collegeId).toBe(collegeA);
    await sessionStore.setSessionActiveCollege(session.token, collegeB);
    const switched = await tenantApi.resolveMembershipPrincipal(session.token);
    expect(switched).toMatchObject({ userId: adminUserA, collegeId: collegeB, membershipId: adminMembershipAInB, role: "PLACEMENT_OFFICER" });
    expect(await tenantApi.withTenantTransaction(switched, (tx) => tx.studentProfile.count())).toBe(1);
    await sessionStore.setSessionActiveCollege(session.token, collegeA);
    expect((await tenantApi.resolveMembershipPrincipal(session.token)).collegeId).toBe(collegeA);
  });

  it("rejects cross-college foreign-key relationships at the database", async () => {
    await expect(admin.query(`INSERT INTO "PlacementDrive" (id,"collegeId","companyId",title,"jobRole","updatedAt") VALUES ($1,$2,$3,'bad','engineer',now())`,
      [uuid("c2000000", 27), collegeB, companyA])).rejects.toMatchObject({ code: "23503" });
    await expect(admin.query(`INSERT INTO "Registration" (id,"collegeId","driveId","studentId",method) VALUES ($1,$2,$3,$4,'IN_APP')`,
      [uuid("c7000000", 28), collegeB, driveA, studentB])).rejects.toMatchObject({ code: "23503" });
    await expect(admin.query(`INSERT INTO "Registration" (id,"collegeId","driveId","studentId",method) VALUES ($1,$2,$3,$4,'IN_APP')`,
      [uuid("c8000000", 29), collegeA, driveA, studentB])).rejects.toMatchObject({ code: "23503" });
    await expect(admin.query(`INSERT INTO "Registration" (id,"collegeId","driveId","studentId",method) VALUES ($1,$2,$3,$4,'IN_APP')`,
      [uuid("c9000000", 34), collegeA, driveB, studentA])).rejects.toMatchObject({ code: "23503" });
    await expect(admin.query(`INSERT INTO "StudentProfile" (id,"collegeId","membershipId","registerNumber","fullName","departmentCode","batchYear","updatedAt") VALUES ($1,$2,$3,'CROSS','Cross','CSE',2027,now())`,
      [uuid("c5000000", 30), collegeA, adminMembershipB])).rejects.toMatchObject({ code: "23503" });
  });

  it("resolves active sessions only, stores hashes, revokes sessions, and rejects suspended memberships", async () => {
    const valid = await sessionStore.createUserSession(studentUserA, collegeA);
    const stored = await admin.query('SELECT "tokenHash" FROM "Session" WHERE "tokenHash"=$1', [hashSessionToken(valid.token)]);
    expect(stored.rowCount).toBe(1);
    expect(stored.rows[0].tokenHash).not.toBe(valid.token);
    expect(await sessionStore.resolveSessionUser(valid.token)).toBe(studentUserA);
    expect(await tenantApi.resolveMembershipPrincipal(valid.token)).toMatchObject({ collegeId: collegeA, userId: studentUserA });
    await expect(sessionStore.createUserSession(studentUserA, collegeB)).rejects.toThrow("active college membership");
    await expect(sessionStore.setSessionActiveCollege(valid.token, collegeB)).rejects.toThrow("active college membership");
    expect((await sessionStore.resolveSessionContext(valid.token))?.activeCollegeId).toBe(collegeA);

    const expiredToken = createSessionToken();
    await admin.query('INSERT INTO "Session" (id,"userId","activeCollegeId","tokenHash","expiresAt") VALUES ($1,$2,$3,$4,now()-interval \'1 minute\')',
      [uuid("c6000000", 31), studentUserA, collegeA, hashSessionToken(expiredToken)]);
    expect(await sessionStore.resolveSessionUser(expiredToken)).toBeNull();

    expect(await sessionStore.revokeUserSession(valid.token)).toBe(true);
    expect(await sessionStore.resolveSessionUser(valid.token)).toBeNull();
    expect(await sessionStore.revokeUserSession(valid.token)).toBe(false);

    const suspendedUserSession = await sessionStore.createUserSession(suspendedUser);
    await admin.query('UPDATE "Session" SET "activeCollegeId"=$1 WHERE "tokenHash"=$2', [collegeA, hashSessionToken(suspendedUserSession.token)]);
    expect(await sessionStore.resolveSessionUser(suspendedUserSession.token)).toBe(suspendedUser);
    await expect(tenantApi.resolveMembershipPrincipal(suspendedUserSession.token)).rejects.toThrow("active college membership");
    await admin.query('UPDATE "User" SET "isActive"=false WHERE id=$1', [suspendedUser]);
    expect(await sessionStore.resolveSessionUser(suspendedUserSession.token)).toBeNull();
  });

  async function seedSyntheticFixtures(): Promise<void> {
    const syntheticPassword = createSessionToken();
    const storedPasswordHash = await hashPassword(syntheticPassword);
    await admin.query(`INSERT INTO "College" (id,name,slug,code,"updatedAt") VALUES
      ($1,'RLS Synthetic A',$2,$2,now()),($3,'RLS Synthetic B',$4,$4,now())`,
      [collegeA, `rls-a-${suffix}`, collegeB, `rls-b-${suffix}`]);
    await admin.query(`INSERT INTO "CollegeDomain" (id,"collegeId",hostname,"verifiedAt") VALUES
      ($1,$2,$3,now()),($4,$5,$6,now())`,
      [uuid("d0000000", 32), collegeA, domainA, uuid("d1000000", 33), collegeB, domainB]);
    await admin.query(`INSERT INTO "User" (id,email,"displayName","passwordHash","updatedAt") VALUES
      ($1,$2,'RLS student A',$3,now()),($4,$5,'RLS student B',NULL,now()),
      ($6,$7,'RLS admin A',NULL,now()),($8,$9,'RLS admin B',NULL,now()),($10,$11,'RLS suspended',NULL,now())`,
      [studentUserA, `student-a-${suffix}@example.invalid`, storedPasswordHash,
       studentUserB, `student-b-${suffix}@example.invalid`, adminUserA, `admin-a-${suffix}@example.invalid`,
       adminUserB, `admin-b-${suffix}@example.invalid`,
       suspendedUser, `suspended-${suffix}@example.invalid`]);
    await admin.query(`INSERT INTO "User" (id,email,"displayName","updatedAt") VALUES
      ($1,$2,'RLS coordinator A',now()),($3,$4,'RLS coordinator B',now())`,
      [coordinatorUserA, `coord-a-${suffix}@example.invalid`, coordinatorUserB, `coord-b-${suffix}@example.invalid`]);
    const storedHash = await admin.query('SELECT "passwordHash" FROM "User" WHERE id=$1', [studentUserA]);
    expect(storedHash.rows[0].passwordHash).not.toBe(syntheticPassword);
    expect(storedHash.rows[0].passwordHash).toMatch(/^scrypt\$32768\$/);
    await admin.query(`INSERT INTO "Membership" (id,"collegeId","userId",role,status,"updatedAt") VALUES
      ($1,$2,$3,'STUDENT','ACTIVE',now()),($4,$5,$6,'STUDENT','ACTIVE',now()),
      ($7,$8,$9,'COLLEGE_ADMIN','ACTIVE',now()),($10,$11,$12,'COLLEGE_ADMIN','ACTIVE',now()),
      ($13,$14,$15,'PLACEMENT_OFFICER','SUSPENDED',now()),
      ($16,$17,$18,'COORDINATOR','ACTIVE',now()),($19,$20,$21,'COORDINATOR','ACTIVE',now()),
      ($22,$23,$24,'PLACEMENT_OFFICER','ACTIVE',now())`,
      [membershipA, collegeA, studentUserA, membershipB, collegeB, studentUserB,
       adminMembershipA, collegeA, adminUserA, adminMembershipB, collegeB, adminUserB,
       suspendedMembership, collegeA, suspendedUser, coordinatorMembershipA, collegeA, coordinatorUserA,
       coordinatorMembershipB, collegeB, coordinatorUserB, adminMembershipAInB, collegeB, adminUserA]);
    await admin.query(`INSERT INTO "Department" (id,"collegeId",name,"shortCode","updatedAt") VALUES
      ($1,$2,'Computer Science','CSE',now()),($3,$4,'Electronics','ECE',now()),($5,$6,'Electronics Local','ECE',now())`, [departmentA, collegeA, departmentB, collegeB, departmentAUnassigned, collegeA]);
    await admin.query(`INSERT INTO "MembershipDepartment" ("membershipId","collegeId","departmentId") VALUES
      ($1,$2,$9),($3,$4,$10),($5,$6,$9),($7,$8,$10)`,
      [adminMembershipA, collegeA, adminMembershipB, collegeB, coordinatorMembershipA, collegeA, coordinatorMembershipB, collegeB, departmentA, departmentB]);
    await admin.query(`INSERT INTO "StudentProfile" (id,"collegeId","membershipId","registerNumber","fullName","departmentCode","batchYear","updatedAt") VALUES
      ($1,$2,$3,'RLS-REG-SHARED','RLS Student A','CSE',2027,now()),($4,$5,$6,'RLS-REG-SHARED','RLS Student B','ECE',2027,now())`,
      [studentA, collegeA, membershipA, studentB, collegeB, membershipB]);
    await admin.query(`INSERT INTO "AcademicRecord" (id,"studentId",cgpa,"tenthPercentage","twelfthPercentage") VALUES
      ($1,$2,8.75,92.50,88.25),($3,$4,7.50,85.00,83.00)`, [academicA, studentA, academicB, studentB]);
    await admin.query(`INSERT INTO "Company" (id,"collegeId",name,"updatedAt") VALUES
      ($1,$2,'Company A',now()),($3,$4,'Company B',now())`, [companyA, collegeA, companyB, collegeB]);
    await admin.query(`INSERT INTO "PlacementDrive" (id,"collegeId","companyId",title,"jobRole","updatedAt") VALUES
      ($1,$2,$3,'Drive A','Engineer',now()),($4,$5,$6,'Drive B','Engineer',now())`,
      [driveA, collegeA, companyA, driveB, collegeB, companyB]);
    await admin.query(`INSERT INTO "DriveRule" (id,"driveId","ruleType",operator,value) VALUES
      ($1,$2,'minimum_cgpa','gte',$3::jsonb),($4,$5,'minimum_cgpa','gte',$6::jsonb)`,
      [ruleA, driveA, JSON.stringify({ value: 7 }), ruleB, driveB, JSON.stringify({ value: 7 })]);
    await admin.query(`INSERT INTO "Registration" (id,"collegeId","driveId","studentId",method) VALUES
      ($1,$2,$3,$4,'IN_APP'),($5,$6,$7,$8,'IN_APP')`,
      [registrationA, collegeA, driveA, studentA, registrationB, collegeB, driveB, studentB]);
    await admin.query(`INSERT INTO "AuditLog" (id,"collegeId","actorUserId",action,"entityType","entityId") VALUES
      ($1,$2,$3,'fixture.created','College',$4),($5,$6,$7,'fixture.created','College',$8)`,
      [auditA, collegeA, adminUserA, collegeA, auditB, collegeB, adminUserB, collegeB]);
  }

  async function cleanupSyntheticFixtures(): Promise<void> {
    await admin.query('DELETE FROM "StaffInvitation" WHERE "collegeId" = ANY($1::uuid[])', [[collegeA, collegeB]]);
    await admin.query('DELETE FROM "User" WHERE email = ANY($1::text[])', [phase2bEmails]);
    await admin.query('DELETE FROM "User" WHERE email LIKE $1', [`phase2b-concurrent-${suffix}@example.invalid`]);
    await admin.query('DELETE FROM "College" WHERE id = ANY($1::uuid[])', [[collegeA, collegeB]]);
    await admin.query('DELETE FROM "User" WHERE id = ANY($1::uuid[])', [[studentUserA, studentUserB, adminUserA, adminUserB, suspendedUser, coordinatorUserA, coordinatorUserB]]);
  }

  async function removeStaleSyntheticFixtures(): Promise<void> {
    // Recover only unmistakable marker rows left by an interrupted prior run.
    await admin.query(`DELETE FROM "College" WHERE slug LIKE 'rls-a-%' OR slug LIKE 'rls-b-%'`);
    await admin.query(`DELETE FROM "User" WHERE "displayName" LIKE 'RLS %' AND email LIKE '%@example.invalid'`);
  }

  async function setTenant(client: import("pg").PoolClient, tenantId: string): Promise<void> {
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
  }

  function uuid(prefix: string, sequence: number): string {
    const tail = createHash("sha256").update(`${suffix}-${sequence}`).digest("hex").slice(0, 12);
    return `${prefix}-0000-4000-8000-${tail}`;
  }
});

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
