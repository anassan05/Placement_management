import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
const runtimeUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(adminUrl && runtimeUrl);

describe.skipIf(!enabled)("student invitation PostgreSQL security", () => {
  const admin = new Pool({ connectionString: adminUrl, max: 3 });
  const suffix = randomUUID();
  const collegeA = randomUUID();
  const collegeB = randomUUID();
  const departmentA = randomUUID();
  const departmentB = randomUUID();
  const issuerA = randomUUID();
  const issuerB = randomUUID();
  let db: typeof import("@/lib/db").db;
  let sessionStore: typeof import("@/modules/authentication/session-store");
  let tenancy: typeof import("@/modules/tenancy/tenant-context");
  let students: typeof import("./student-invitation.service");
  let principalA: Awaited<ReturnType<typeof import("@/modules/tenancy/tenant-context").resolveMembershipPrincipal>>;
  let principalB: Awaited<ReturnType<typeof import("@/modules/tenancy/tenant-context").resolveMembershipPrincipal>>;
  let token = "";
  let studentUserId = "";

  beforeAll(async () => {
    if (!adminUrl || !runtimeUrl) return;
    process.env.DATABASE_URL = adminUrl;
    process.env.APP_DATABASE_URL = runtimeUrl;
    db = (await import("@/lib/db")).db;
    sessionStore = await import("@/modules/authentication/session-store");
    tenancy = await import("@/modules/tenancy/tenant-context");
    students = await import("./student-invitation.service");
    const { hashPassword } = await import("@/modules/authentication/session");
    const passwordHash = await hashPassword(`Student-invite-${suffix}-password`);
    await admin.query(`INSERT INTO "College" (id,name,slug,code,"isActive","createdAt","updatedAt")
      VALUES ($1,$2,$3,$4,true,now(),now()),($5,$6,$7,$8,true,now(),now())`, [
      collegeA, `Student Test A ${suffix}`, `student-a-${suffix}`, `STA${suffix.slice(0, 5)}`,
      collegeB, `Student Test B ${suffix}`, `student-b-${suffix}`, `STB${suffix.slice(0, 5)}`
    ]);
    await admin.query(`INSERT INTO "Department" (id,"collegeId",name,"shortCode","createdAt","updatedAt")
      VALUES ($1,$2,'Computer Science','CSE',now(),now()),($3,$4,'Electronics','ECE',now(),now())`, [departmentA, collegeA, departmentB, collegeB]);
    await admin.query(`INSERT INTO "User" (id,email,"passwordHash","displayName","isPlatformAdmin","isActive","createdAt","updatedAt")
      VALUES ($1,$2,$3,'Issuer A',false,true,now(),now()),($4,$5,$3,'Issuer B',false,true,now(),now())`, [
      issuerA, `issuer-a-${suffix}@example.invalid`, passwordHash, issuerB, `issuer-b-${suffix}@example.invalid`
    ]);
    await admin.query(`INSERT INTO "Membership" (id,"collegeId","userId",role,status,"createdAt","updatedAt")
      VALUES ($1,$2,$3,'COLLEGE_ADMIN','ACTIVE',now(),now()),($4,$5,$6,'COLLEGE_ADMIN','ACTIVE',now(),now())`, [
      randomUUID(), collegeA, issuerA, randomUUID(), collegeB, issuerB
    ]);
    const sessionA = await sessionStore.createUserSession(issuerA, collegeA);
    const sessionB = await sessionStore.createUserSession(issuerB, collegeB);
    principalA = await tenancy.resolveMembershipPrincipal(sessionA.token);
    principalB = await tenancy.resolveMembershipPrincipal(sessionB.token);
  }, 30_000);

  afterAll(async () => {
    if (!adminUrl || !runtimeUrl) return;
    try {
      await admin.query(`DELETE FROM "AuditLog" WHERE "collegeId" IN ($1,$2)`, [collegeA, collegeB]);
      await admin.query(`DELETE FROM "Session" WHERE "activeCollegeId" IN ($1,$2)`, [collegeA, collegeB]);
      await admin.query(`DELETE FROM "StudentInvitation" WHERE "collegeId" IN ($1,$2)`, [collegeA, collegeB]);
      await admin.query(`DELETE FROM "StudentProfile" WHERE "collegeId" IN ($1,$2)`, [collegeA, collegeB]);
      await admin.query(`DELETE FROM "Membership" WHERE "collegeId" IN ($1,$2)`, [collegeA, collegeB]);
      await admin.query(`DELETE FROM "User" WHERE id IN ($1,$2) OR email LIKE $3`, [issuerA, issuerB, `student-${suffix}%`]);
      await admin.query(`DELETE FROM "Department" WHERE "collegeId" IN ($1,$2)`, [collegeA, collegeB]);
      await admin.query(`DELETE FROM "College" WHERE id IN ($1,$2)`, [collegeA, collegeB]);
    } finally {
      await Promise.allSettled([admin.end(), db?.$disconnect()]);
    }
  });

  it("isolates invitations, stores only a token hash, activates once, and rejects duplicates", async () => {
    const email = `student-${suffix}@example.invalid`;
    const result = await students.createStudentInvitation(principalA, {
      fullName: "Synthetic Student",
      email,
      registerNumber: `REG-${suffix.slice(0, 8)}`,
      departmentId: departmentA,
      batchYear: 2026
    });
    token = new URL(result.invitationUrl).pathname.split("/").at(-1)!;
    const invitation = await admin.query(`SELECT "tokenHash", "acceptedAt" FROM "StudentInvitation" WHERE "collegeId"=$1`, [collegeA]);
    expect(invitation.rows[0].tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(invitation.rows[0].tokenHash).not.toBe(token);
    expect(await students.getStudentInvitation(token)).toMatchObject({ email, registerNumber: `REG-${suffix.slice(0, 8).toUpperCase()}` });
    expect(await tenancy.withTenantTransaction(principalA, (tx) => tx.studentInvitation.count())).toBe(1);
    await expect(students.createStudentInvitation(principalA, {
      fullName: "Duplicate Student", email, registerNumber: `REG-OTHER-${suffix.slice(0, 8)}`, departmentId: departmentA, batchYear: 2026
    })).rejects.toThrow("already pending");

    await students.acceptStudentInvitation(token, { password: "Student-activation-password-01", confirmPassword: "Student-activation-password-01" });
    const profile = await admin.query(`SELECT "collegeId","registerNumber","departmentCode" FROM "StudentProfile" WHERE "collegeId"=$1`, [collegeA]);
    studentUserId = (await admin.query(`SELECT id FROM "User" WHERE email=$1`, [email])).rows[0].id;
    expect(profile.rows).toEqual([{ collegeId: collegeA, registerNumber: `REG-${suffix.slice(0, 8).toUpperCase()}`, departmentCode: "CSE" }]);
    await expect(students.acceptStudentInvitation(token, { password: "Student-activation-password-01", confirmPassword: "Student-activation-password-01" })).rejects.toThrow();
    expect(await tenancy.withTenantTransaction(principalA, (tx) => tx.studentInvitation.count())).toBe(1);
    await expect(students.createStudentInvitation(principalA, {
      fullName: "Duplicate Register", email: `other-${suffix}@example.invalid`, registerNumber: `REG-${suffix.slice(0, 8).toUpperCase()}`, departmentId: departmentA, batchYear: 2026
    })).rejects.toThrow();
    expect(await tenancy.withTenantTransaction(principalA, (tx) => tx.studentInvitation.count())).toBe(1);
    expect(studentUserId).toBeTruthy();
  });

  it("does not expose another college invitation to the tenant runtime", async () => {
    const invitation = await admin.query(`SELECT count(*)::int AS count FROM "StudentInvitation" WHERE "collegeId"=$1`, [collegeB]);
    expect(invitation.rows[0].count).toBe(0);
    expect(await tenancy.withTenantTransaction(principalB, (tx) => tx.studentProfile.count())).toBe(0);
    await expect(students.createStudentInvitation(principalB, {
      fullName: "Wrong Department", email: `wrong-${suffix}@example.invalid`, registerNumber: `REG-B-${suffix.slice(0, 8)}`, departmentId: departmentA, batchYear: 2026
    })).rejects.toThrow();
  });
});
