import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
const runtimeUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(adminUrl && runtimeUrl);

describe.skipIf(!enabled)("student dashboard PostgreSQL security", () => {
  const admin = new Pool({ connectionString: adminUrl, max: 3 });
  const suffix = randomUUID();
  const collegeA = randomUUID();
  const collegeB = randomUUID();
  const departmentA = randomUUID();
  const adminUser = randomUUID();
  const studentUser = randomUUID();
  const otherStudentUser = randomUUID();
  const studentMembership = randomUUID();
  const otherStudentMembership = randomUUID();
  const studentId = randomUUID();
  const otherStudentId = randomUUID();
  const companyId = randomUUID();
  const driveId = randomUUID();
  let db: typeof import("@/lib/db").db;
  let tenancy: typeof import("@/modules/tenancy/tenant-context");
  let dashboard: typeof import("./dashboard.service");
  let studentPrincipal: Awaited<ReturnType<typeof import("@/modules/tenancy/tenant-context").resolveMembershipPrincipal>>;
  let otherStudentPrincipal: Awaited<ReturnType<typeof import("@/modules/tenancy/tenant-context").resolveMembershipPrincipal>>;

  beforeAll(async () => {
    if (!adminUrl || !runtimeUrl) return;
    process.env.DATABASE_URL = adminUrl;
    process.env.APP_DATABASE_URL = runtimeUrl;
    db = (await import("@/lib/db")).db;
    tenancy = await import("@/modules/tenancy/tenant-context");
    dashboard = await import("./dashboard.service");
    const { hashPassword } = await import("@/modules/authentication/session");
    const passwordHash = await hashPassword(`Dashboard-${suffix}-password`);
    await admin.query(`INSERT INTO "College" (id,name,slug,code,"isActive","createdAt","updatedAt")
      VALUES ($1,$2,$3,$4,true,now(),now()),($5,$6,$7,$8,true,now(),now())`, [
      collegeA, `Dashboard College A ${suffix}`, `dashboard-a-${suffix}`, `DBA${suffix.slice(0, 5)}`,
      collegeB, `Dashboard College B ${suffix}`, `dashboard-b-${suffix}`, `DBB${suffix.slice(0, 5)}`
    ]);
    await admin.query(`INSERT INTO "Department" (id,"collegeId",name,"shortCode","createdAt","updatedAt")
      VALUES ($1,$2,'Computer Science','CSE',now(),now())`, [departmentA, collegeA]);
    await admin.query(`INSERT INTO "User" (id,email,"passwordHash","displayName","isPlatformAdmin","isActive","createdAt","updatedAt")
      VALUES ($1,$2,$3,'Dashboard Admin',false,true,now(),now()),($4,$5,$3,'Dashboard Student',false,true,now(),now()),
      ($6,$7,$3,'Other Dashboard Student',false,true,now(),now())`, [
      adminUser, `dashboard-admin-${suffix}@example.invalid`, passwordHash,
      studentUser, `dashboard-student-${suffix}@example.invalid`,
      otherStudentUser, `dashboard-other-${suffix}@example.invalid`
    ]);
    await admin.query(`INSERT INTO "Membership" (id,"collegeId","userId",role,status,"createdAt","updatedAt")
      VALUES ($1,$2,$3,'COLLEGE_ADMIN','ACTIVE',now(),now()),($4,$2,$5,'STUDENT','ACTIVE',now(),now()),
      ($6,$7,$8,'STUDENT','ACTIVE',now(),now())`, [
      randomUUID(), collegeA, adminUser, studentMembership, studentUser,
      otherStudentMembership, collegeB, otherStudentUser
    ]);
    await admin.query(`INSERT INTO "StudentProfile" (id,"collegeId","membershipId","registerNumber","fullName","departmentCode","batchYear",phone,"dateOfBirth","updatedAt")
      VALUES ($1,$2,$3,'DASH-001','Dashboard Student','CSE',2026,'+1 555 0100','2004-01-02',now()),
      ($4,$5,$6,'DASH-002','Other Dashboard Student','ECE',2026,NULL,NULL,now())`, [
      studentId, collegeA, studentMembership, otherStudentId, collegeB, otherStudentMembership
    ]);
    await admin.query(`INSERT INTO "AcademicRecord" (id,"studentId",cgpa,"tenthPercentage","twelfthPercentage", "standingArrears","historyOfArrears")
      VALUES ($1,$2,8.5,91.2,88.4,0,false)`, [randomUUID(), studentId]);
    await admin.query(`INSERT INTO "StudentDocument" (id,"studentId","collegeId",category,"originalName","storageKey","mimeType",extension,"sizeBytes",sha256,"uploadedById","updatedAt")
      VALUES ($1,$2,$3,'RESUME','resume.pdf','documents/00000000-0000-0000-0000-000000000001.pdf','application/pdf','pdf',8,'hash',$4,now())`, [
      randomUUID(), studentId, collegeA, studentUser
    ]);
    await admin.query(`INSERT INTO "Company" (id,"collegeId",name,"createdAt","updatedAt") VALUES ($1,$2,'Example Company',now(),now())`,
      [companyId, collegeA]);
    await admin.query(`INSERT INTO "PlacementDrive" (id,"collegeId","companyId",title,"jobRole",status,"publishedAt","updatedAt")
      VALUES ($1,$2,$3,'Graduate Engineer','Engineer','PUBLISHED',now(),now())`, [driveId, collegeA, companyId]);
    await admin.query(`INSERT INTO "Registration" (id,"collegeId","driveId","studentId",status,method) VALUES ($1,$2,$3,$4,'REGISTERED','IN_APP')`,
      [randomUUID(), collegeA, driveId, studentId]);
    const sessions = await import("@/modules/authentication/session-store");
    studentPrincipal = await tenancy.resolveMembershipPrincipal((await sessions.createUserSession(studentUser, collegeA)).token);
    otherStudentPrincipal = await tenancy.resolveMembershipPrincipal((await sessions.createUserSession(otherStudentUser, collegeB)).token);
  }, 30_000);

  afterAll(async () => {
    if (!adminUrl || !runtimeUrl) return;
    try {
      await admin.query(`DELETE FROM "AuditLog" WHERE "collegeId" IN ($1,$2)`, [collegeA, collegeB]);
      await admin.query(`DELETE FROM "Registration" WHERE "collegeId" IN ($1,$2)`, [collegeA, collegeB]);
      await admin.query(`DELETE FROM "PlacementDrive" WHERE "collegeId" IN ($1,$2)`, [collegeA, collegeB]);
      await admin.query(`DELETE FROM "Company" WHERE "collegeId" IN ($1,$2)`, [collegeA, collegeB]);
      await admin.query(`DELETE FROM "StudentDocument" WHERE "collegeId" IN ($1,$2)`, [collegeA, collegeB]);
      await admin.query(`DELETE FROM "AcademicRecord" WHERE "studentId" IN ($1,$2)`, [studentId, otherStudentId]);
      await admin.query(`DELETE FROM "Session" WHERE "activeCollegeId" IN ($1,$2)`, [collegeA, collegeB]);
      await admin.query(`DELETE FROM "StudentProfile" WHERE "collegeId" IN ($1,$2)`, [collegeA, collegeB]);
      await admin.query(`DELETE FROM "Membership" WHERE "collegeId" IN ($1,$2)`, [collegeA, collegeB]);
      await admin.query(`DELETE FROM "Department" WHERE "collegeId" IN ($1,$2)`, [collegeA, collegeB]);
      await admin.query(`DELETE FROM "User" WHERE id IN ($1,$2,$3)`, [adminUser, studentUser, otherStudentUser]);
      await admin.query(`DELETE FROM "College" WHERE id IN ($1,$2)`, [collegeA, collegeB]);
    } finally {
      await Promise.allSettled([admin.end(), db?.$disconnect()]);
    }
  });

  it("aggregates only the authenticated student's persisted data", async () => {
    const result = await dashboard.getStudentDashboard(studentPrincipal);
    expect(result).toMatchObject({
      student: { id: studentId, fullName: "Dashboard Student", departmentCode: "CSE" },
      academics: { cgpa: "8.5", standingArrears: 0 },
      documents: { resume: { originalName: "resume.pdf" }, academicCertificate: null, supportingCount: 0 },
      registrations: [{ title: "Graduate Engineer", companyName: "Example Company", status: "REGISTERED" }]
    });
    expect(result?.completion.fields.phone).toBe(true);
    expect(result?.completion.fields.resume).toBe(true);
    expect(result?.completion.percentage).toBe(90);
  });

  it("cannot use another student's membership to access the first student's dashboard", async () => {
    const result = await dashboard.getStudentDashboard(otherStudentPrincipal);
    expect(result?.student.id).toBe(otherStudentId);
    expect(result?.student.id).not.toBe(studentId);
    expect(await tenancy.withTenantTransaction(otherStudentPrincipal, (tx) => tx.studentProfile.count())).toBe(1);
    expect(await tenancy.withTenantTransaction(otherStudentPrincipal, (tx) => tx.studentDocument.count())).toBe(0);
  });
});
