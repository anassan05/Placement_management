import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import type { Principal } from "@/modules/authorization/permissions";

const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
const runtimeUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(adminUrl && runtimeUrl);

function pdf(name: string, text: string): File {
  return new File([`%PDF-${text}`], name, { type: "application/pdf" });
}

describe.skipIf(!enabled)("student document PostgreSQL security", () => {
  const admin = new Pool({ connectionString: adminUrl, max: 4 });
  const suffix = randomUUID();
  const collegeA = randomUUID();
  const collegeB = randomUUID();
  const departmentA = randomUUID();
  const departmentB = randomUUID();
  const adminUser = randomUUID();
  const coordinatorUser = randomUUID();
  const studentUser = randomUUID();
  const otherStudentUser = randomUUID();
  const studentMembership = randomUUID();
  const otherStudentMembership = randomUUID();
  let db: typeof import("@/lib/db").db;
  let tenancy: typeof import("@/modules/tenancy/tenant-context");
  let documents: typeof import("./document.service");
  let storage: typeof import("./document-storage");
  let adminPrincipal: Extract<Principal, { kind: "membership" }>;
  let coordinatorPrincipal: Extract<Principal, { kind: "membership" }>;
  let studentPrincipal: Extract<Principal, { kind: "membership" }>;
  let otherStudentPrincipal: Extract<Principal, { kind: "membership" }>;
  const storageKeys: string[] = [];

  beforeAll(async () => {
    if (!adminUrl || !runtimeUrl) return;
    process.env.DATABASE_URL = adminUrl;
    process.env.APP_DATABASE_URL = runtimeUrl;
    db = (await import("@/lib/db")).db;
    tenancy = await import("@/modules/tenancy/tenant-context");
    documents = await import("./document.service");
    storage = await import("./document-storage");
    const { hashPassword } = await import("@/modules/authentication/session");
    const passwordHash = await hashPassword(`Document-${suffix}-password`);
    const adminMembership = randomUUID();
    const coordinatorMembership = randomUUID();
    await admin.query(`INSERT INTO "College" (id,name,slug,code,"isActive","createdAt","updatedAt")
      VALUES ($1,$2,$3,$4,true,now(),now()),($5,$6,$7,$8,true,now(),now())`, [
      collegeA, `Document College A ${suffix}`, `document-a-${suffix}`, `DCA${suffix.slice(0, 5)}`,
      collegeB, `Document College B ${suffix}`, `document-b-${suffix}`, `DCB${suffix.slice(0, 5)}`
    ]);
    await admin.query(`INSERT INTO "Department" (id,"collegeId",name,"shortCode","createdAt","updatedAt")
      VALUES ($1,$2,'Computer Science','CSE',now(),now()),($3,$4,'Electronics','ECE',now(),now())`,
      [departmentA, collegeA, departmentB, collegeB]);
    await admin.query(`INSERT INTO "User" (id,email,"passwordHash","displayName","isPlatformAdmin","isActive","createdAt","updatedAt")
      VALUES ($1,$2,$3,'Document Admin',false,true,now(),now()),($4,$5,$3,'Document Coordinator',false,true,now(),now()),
      ($6,$7,$3,'Document Student',false,true,now(),now()),($8,$9,$3,'Other Student',false,true,now(),now())`, [
      adminUser, `document-admin-${suffix}@example.invalid`, passwordHash,
      coordinatorUser, `document-coordinator-${suffix}@example.invalid`,
      studentUser, `document-student-${suffix}@example.invalid`,
      otherStudentUser, `document-other-${suffix}@example.invalid`
    ]);
    await admin.query(`INSERT INTO "Membership" (id,"collegeId","userId",role,status,"createdAt","updatedAt")
      VALUES ($1,$2,$3,'COLLEGE_ADMIN','ACTIVE',now(),now()),($4,$2,$5,'COORDINATOR','ACTIVE',now(),now()),
      ($6,$2,$7,'STUDENT','ACTIVE',now(),now()),($8,$9,$10,'STUDENT','ACTIVE',now(),now())`, [
      adminMembership, collegeA, adminUser, coordinatorMembership, coordinatorUser,
      studentMembership, studentUser, otherStudentMembership, collegeB, otherStudentUser
    ]);
    await admin.query(`INSERT INTO "MembershipDepartment" ("membershipId","collegeId","departmentId","createdAt") VALUES ($1,$2,$3,now())`,
      [coordinatorMembership, collegeA, departmentA]);
    const studentId = randomUUID();
    const otherStudentId = randomUUID();
    await admin.query(`INSERT INTO "StudentProfile" (id,"collegeId","membershipId","registerNumber","fullName","departmentCode","batchYear","updatedAt")
      VALUES ($1,$2,$3,'DOC-A','Document Student','CSE',2026,now()),($4,$5,$6,'DOC-B','Other Student','ECE',2026,now())`,
      [studentId, collegeA, studentMembership, otherStudentId, collegeB, otherStudentMembership]);
    const sessions = await import("@/modules/authentication/session-store");
    adminPrincipal = await tenancy.resolveMembershipPrincipal((await sessions.createUserSession(adminUser, collegeA)).token);
    coordinatorPrincipal = await tenancy.resolveMembershipPrincipal((await sessions.createUserSession(coordinatorUser, collegeA)).token);
    studentPrincipal = await tenancy.resolveMembershipPrincipal((await sessions.createUserSession(studentUser, collegeA)).token);
    otherStudentPrincipal = await tenancy.resolveMembershipPrincipal((await sessions.createUserSession(otherStudentUser, collegeB)).token);
  }, 30_000);

  afterAll(async () => {
    if (!adminUrl || !runtimeUrl) return;
    await Promise.allSettled(storageKeys.map((key) => storage.deletePrivateDocument(key)));
    try {
      await admin.query(`DELETE FROM "AuditLog" WHERE "collegeId" IN ($1,$2)`, [collegeA, collegeB]);
      await admin.query(`DELETE FROM "StudentDocument" WHERE "collegeId" IN ($1,$2)`, [collegeA, collegeB]);
      await admin.query(`DELETE FROM "Session" WHERE "activeCollegeId" IN ($1,$2)`, [collegeA, collegeB]);
      await admin.query(`DELETE FROM "StudentProfile" WHERE "collegeId" IN ($1,$2)`, [collegeA, collegeB]);
      await admin.query(`DELETE FROM "MembershipDepartment" WHERE "collegeId" IN ($1,$2)`, [collegeA, collegeB]);
      await admin.query(`DELETE FROM "Membership" WHERE "collegeId" IN ($1,$2)`, [collegeA, collegeB]);
      await admin.query(`DELETE FROM "User" WHERE id IN ($1,$2,$3,$4)`, [adminUser, coordinatorUser, studentUser, otherStudentUser]);
      await admin.query(`DELETE FROM "Department" WHERE "collegeId" IN ($1,$2)`, [collegeA, collegeB]);
      await admin.query(`DELETE FROM "College" WHERE id IN ($1,$2)`, [collegeA, collegeB]);
    } finally {
      await Promise.allSettled([admin.end(), db?.$disconnect()]);
    }
  });

  it("enforces ownership, department, tenant and RLS boundaries", async () => {
    const studentId = (await admin.query(`SELECT id FROM "StudentProfile" WHERE "collegeId"=$1`, [collegeA])).rows[0].id as string;
    const otherStudentId = (await admin.query(`SELECT id FROM "StudentProfile" WHERE "collegeId"=$1`, [collegeB])).rows[0].id as string;
    const uploaded = await documents.uploadStudentDocument(studentPrincipal, studentId, "RESUME", pdf("../resume.pdf", "owner"));
    storageKeys.push(uploaded.storageKey);
    expect(uploaded.storageKey).toMatch(/^documents\/[0-9a-f-]{36}\.pdf$/);
    await expect(documents.listStudentDocuments(otherStudentPrincipal, studentId)).rejects.toThrow();
    await expect(documents.getStudentDocument(otherStudentPrincipal, otherStudentId, uploaded.id)).rejects.toThrow();
    await expect(documents.uploadStudentDocument(coordinatorPrincipal, otherStudentId, "RESUME", pdf("cross.pdf", "cross"))).rejects.toThrow();
    await expect(documents.deleteStudentDocument(coordinatorPrincipal, studentId, uploaded.id)).resolves.toBeUndefined();
    await expect(storage.readPrivateDocument(uploaded.storageKey)).rejects.toThrow();
    const visibleToTenant = await tenancy.withTenantTransaction(adminPrincipal, (tx) => tx.studentDocument.count());
    expect(visibleToTenant).toBe(0);
    const visibleToOtherTenant = await tenancy.withTenantTransaction(otherStudentPrincipal, (tx) => tx.studentDocument.count());
    expect(visibleToOtherTenant).toBe(0);
  });

  it("supports replacement with consistent metadata and audits", async () => {
    const studentId = (await admin.query(`SELECT id FROM "StudentProfile" WHERE "collegeId"=$1`, [collegeA])).rows[0].id as string;
    const first = await documents.uploadStudentDocument(adminPrincipal, studentId, "RESUME", pdf("first.pdf", "first"));
    storageKeys.push(first.storageKey);
    const firstRow = await admin.query(`SELECT id,"storageKey","sha256","sizeBytes" FROM "StudentDocument" WHERE "collegeId"=$1`, [collegeA]);
    expect(firstRow.rows[0].sha256).toBe(createHash("sha256").update(Buffer.from("%PDF-first")).digest("hex"));
    const second = await documents.uploadStudentDocument(adminPrincipal, studentId, "RESUME", pdf("second.pdf", "second"));
    storageKeys.push(second.storageKey);
    expect(second.storageKey).not.toBe(first.storageKey);
    await expect(storage.readPrivateDocument(first.storageKey)).rejects.toThrow();
    const row = await admin.query(`SELECT id,"originalName","storageKey","sizeBytes" FROM "StudentDocument" WHERE "collegeId"=$1`, [collegeA]);
    expect(row.rows[0]).toMatchObject({ originalName: "second.pdf", storageKey: second.storageKey, sizeBytes: 11 });
    const audits = await admin.query(`SELECT action FROM "AuditLog" WHERE "collegeId"=$1 AND "entityType"='StudentDocument' ORDER BY "createdAt"`, [collegeA]);
    expect(audits.rows.map((row) => row.action)).toEqual(expect.arrayContaining(["student_document.uploaded", "student_document.replaced"]));
    await expect(documents.getStudentDocument(coordinatorPrincipal, studentId, row.rows[0].id)).resolves.toMatchObject({ originalName: "second.pdf" });
  });

  it("rejects malformed, mismatched and unauthorized files before persistence", async () => {
    const studentId = (await admin.query(`SELECT id FROM "StudentProfile" WHERE "collegeId"=$1`, [collegeA])).rows[0].id as string;
    await expect(documents.uploadStudentDocument(studentPrincipal, studentId, "RESUME", new File(["not pdf"], "resume.pdf", { type: "application/pdf" }))).rejects.toThrow("signature");
    await expect(documents.uploadStudentDocument(studentPrincipal, studentId, "RESUME", new File(["%PDF-ok"], "resume.exe", { type: "application/pdf" }))).rejects.toThrow();
    await expect(documents.uploadStudentDocument(otherStudentPrincipal, studentId, "RESUME", pdf("owned-by-other.pdf", "other"))).rejects.toThrow();
    expect((await admin.query(`SELECT count(*)::int AS count FROM "StudentDocument" WHERE "collegeId"=$1`, [collegeA])).rows[0].count).toBe(1);
  });

  it("keeps RLS active for direct restricted-role access", async () => {
    const runtime = new Pool({ connectionString: runtimeUrl, max: 1 });
    try {
      await runtime.query(`SELECT set_config('app.current_tenant_id',$1,false)`, [collegeA]);
      expect((await runtime.query(`SELECT count(*)::int AS count FROM "StudentDocument"`)).rows[0].count).toBe(1);
      await runtime.query(`SELECT set_config('app.current_tenant_id',$1,false)`, [collegeB]);
      expect((await runtime.query(`SELECT count(*)::int AS count FROM "StudentDocument"`)).rows[0].count).toBe(0);
      await expect(runtime.query(`INSERT INTO "StudentDocument" (id,"studentId","collegeId",category,"originalName","storageKey","mimeType",extension,"sizeBytes",sha256,"uploadedById","updatedAt")
        VALUES ($1,$2,$3,'RESUME','bad.pdf','documents/00000000-0000-0000-0000-000000000001.pdf','application/pdf','pdf',8,'bad',$4,now())`,
        [randomUUID(), randomUUID(), collegeA, adminUser])).rejects.toMatchObject({ code: "42501" });
    } finally {
      await runtime.end();
    }
  });
});
