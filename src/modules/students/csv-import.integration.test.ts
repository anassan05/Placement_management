import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import type { Principal } from "@/modules/authorization/permissions";

const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
const runtimeUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(adminUrl && runtimeUrl);

describe.skipIf(!enabled)("student CSV import PostgreSQL security", () => {
  const admin = new Pool({ connectionString: adminUrl, max: 4 });
  const suffix = randomUUID();
  const collegeA = randomUUID();
  const collegeB = randomUUID();
  const departmentA = randomUUID();
  const departmentB = randomUUID();
  const adminUser = randomUUID();
  const coordinatorUser = randomUUID();
  let db: typeof import("@/lib/db").db;
  let tenancy: typeof import("@/modules/tenancy/tenant-context");
  let importer: typeof import("./csv-import.service");
  let adminPrincipal: Extract<Principal, { kind: "membership" }>;
  let coordinatorPrincipal: Extract<Principal, { kind: "membership" }>;

  beforeAll(async () => {
    if (!adminUrl || !runtimeUrl) return;
    process.env.DATABASE_URL = adminUrl;
    process.env.APP_DATABASE_URL = runtimeUrl;
    db = (await import("@/lib/db")).db;
    tenancy = await import("@/modules/tenancy/tenant-context");
    importer = await import("./csv-import.service");
    const sessions = await import("@/modules/authentication/session-store");
    await admin.query(`INSERT INTO "College" (id,name,slug,code,"isActive","createdAt","updatedAt")
      VALUES ($1,$2,$3,$4,true,now(),now()),($5,$6,$7,$8,true,now(),now())`, [
      collegeA, `CSV College A ${suffix}`, `csv-a-${suffix}`, `CSA${suffix.slice(0, 5)}`,
      collegeB, `CSV College B ${suffix}`, `csv-b-${suffix}`, `CSB${suffix.slice(0, 5)}`
    ]);
    await admin.query(`INSERT INTO "Department" (id,"collegeId",name,"shortCode","createdAt","updatedAt")
      VALUES ($1,$2,'Computer Science','CSE',now(),now()),($3,$4,'Electronics','ECE',now(),now())`, [departmentA, collegeA, departmentB, collegeB]);
    await admin.query(`INSERT INTO "User" (id,email,"displayName","isPlatformAdmin","isActive","createdAt","updatedAt")
      VALUES ($1,$2,'CSV Admin',false,true,now(),now()),($3,$4,'CSV Coordinator',false,true,now(),now())`, [
      adminUser, `csv-admin-${suffix}@example.invalid`, coordinatorUser, `csv-coordinator-${suffix}@example.invalid`
    ]);
    const adminMembership = randomUUID();
    const coordinatorMembership = randomUUID();
    await admin.query(`INSERT INTO "Membership" (id,"collegeId","userId",role,status,"createdAt","updatedAt")
      VALUES ($1,$2,$3,'COLLEGE_ADMIN','ACTIVE',now(),now()),($4,$5,$6,'COORDINATOR','ACTIVE',now(),now())`, [
      adminMembership, collegeA, adminUser, coordinatorMembership, collegeA, coordinatorUser
    ]);
    await admin.query(`INSERT INTO "MembershipDepartment" ("membershipId","collegeId","departmentId","createdAt") VALUES ($1,$2,$3,now())`, [coordinatorMembership, collegeA, departmentA]);
    adminPrincipal = await tenancy.resolveMembershipPrincipal((await sessions.createUserSession(adminUser, collegeA)).token);
    coordinatorPrincipal = await tenancy.resolveMembershipPrincipal((await sessions.createUserSession(coordinatorUser, collegeA)).token);
  }, 30_000);

  afterAll(async () => {
    if (!adminUrl || !runtimeUrl) return;
    try {
      await admin.query(`DELETE FROM "AuditLog" WHERE "collegeId" IN ($1,$2)`, [collegeA, collegeB]);
      await admin.query(`DELETE FROM "Session" WHERE "activeCollegeId" IN ($1,$2)`, [collegeA, collegeB]);
      await admin.query(`DELETE FROM "StudentInvitation" WHERE "collegeId" IN ($1,$2)`, [collegeA, collegeB]);
      await admin.query(`DELETE FROM "StudentProfile" WHERE "collegeId" IN ($1,$2)`, [collegeA, collegeB]);
      await admin.query(`DELETE FROM "MembershipDepartment" WHERE "collegeId" IN ($1,$2)`, [collegeA, collegeB]);
      await admin.query(`DELETE FROM "Membership" WHERE "collegeId" IN ($1,$2)`, [collegeA, collegeB]);
      await admin.query(`DELETE FROM "User" WHERE id IN ($1,$2) OR email LIKE $3`, [adminUser, coordinatorUser, `csv-student-${suffix}%`]);
      await admin.query(`DELETE FROM "Department" WHERE "collegeId" IN ($1,$2)`, [collegeA, collegeB]);
      await admin.query(`DELETE FROM "College" WHERE id IN ($1,$2)`, [collegeA, collegeB]);
    } finally {
      await Promise.allSettled([admin.end(), db?.$disconnect()]);
    }
  });

  it("previews valid, invalid, duplicate, and cross-college rows, then imports valid records", async () => {
    const csv = [
      "fullName,email,registerNumber,department,batchYear,cgpa,historyOfArrears",
      `Valid Student,csv-student-${suffix}-1@example.invalid,CSV-001,CSE,2026,8.4,false`,
      `Bad Student,csv-student-${suffix}-2@example.invalid,CSV-002,ECE,2026,not-a-number,false`,
      `Duplicate Student,csv-student-${suffix}-1@example.invalid,CSV-003,CSE,2026,7.2,true`
    ].join("\n");
    const preview = await importer.previewStudentImport(adminPrincipal, csv);
    expect(preview.validRows).toHaveLength(1);
    expect(preview.errors.map((error) => error.field)).toEqual(expect.arrayContaining(["cgpa", "email"]));
    const summary = await importer.importStudentCsv(adminPrincipal, csv);
    expect(summary).toMatchObject({ created: 1, rejected: 2, failed: 0 });
    const invitation = await admin.query(`SELECT "cgpa","historyOfArrears" FROM "StudentInvitation" WHERE "collegeId"=$1`, [collegeA]);
    expect(invitation.rows[0]).toMatchObject({ cgpa: "8.40", historyOfArrears: false });
  });

  it("enforces role and coordinator department restrictions", async () => {
    const csv = `fullName,email,registerNumber,department,batchYear\nWrong Department,csv-student-${suffix}-3@example.invalid,CSV-003,ECE,2026`;
    await expect(importer.previewStudentImport(coordinatorPrincipal, csv)).rejects.toThrow("Only College Administrators");
    const studentPrincipal = { kind: "membership", userId: randomUUID(), collegeId: collegeA, membershipId: randomUUID(), role: "STUDENT", status: "ACTIVE", assignedDepartments: [] } as unknown as Principal;
    await expect(importer.previewStudentImport(studentPrincipal, csv)).rejects.toThrow("permission");
    const crossCollege = `fullName,email,registerNumber,department,batchYear\nCross College,csv-student-${suffix}-4@example.invalid,CSV-004,ECE,2026`;
    const crossPreview = await importer.previewStudentImport(adminPrincipal, crossCollege);
    expect(crossPreview.validRows).toHaveLength(0);
    expect(crossPreview.errors[0].message).toContain("not active in this college");
  });

  it("allows only one concurrent import for the same records and rolls back the loser", async () => {
    const csv = `fullName,email,registerNumber,department,batchYear\nConcurrent,csv-student-${suffix}-5@example.invalid,CSV-005,CSE,2026`;
    const results = await Promise.all([importer.importStudentCsv(adminPrincipal, csv), importer.importStudentCsv(adminPrincipal, csv)]);
    expect(results.filter((result) => result.created === 1)).toHaveLength(1);
    expect(results.some((result) => result.failed === 1 || result.duplicate > 0 || result.rejected > 0)).toBe(true);
    const count = await admin.query(`SELECT count(*)::int AS count FROM "StudentInvitation" WHERE "collegeId"=$1 AND "registerNumber"='CSV-005'`, [collegeA]);
    expect(count.rows[0].count).toBe(1);
  });
});
