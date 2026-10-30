import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
const runtimeUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(adminUrl && runtimeUrl);

describe.skipIf(!enabled)("college onboarding PostgreSQL acceptance flow", () => {
  const admin = new Pool({ connectionString: adminUrl, max: 2 });
  const suffix = randomUUID();
  const platformUserId = randomUUID();
  const applicationEmail = `phase2a-${suffix}@example.invalid`;
  const adminEmail = `college-admin-${suffix}@example.invalid`;
  const rejectedContactEmail = `rejected-${suffix}@example.invalid`;
  let db: typeof import("@/lib/db").db;
  let token: string;
  let applicationId: string;
  let rejectedApplicationId: string;
  let collegeId: string;
  let invitationId: string;
  let sessionStore: typeof import("@/modules/authentication/session-store");
  let principalResolver: typeof import("@/modules/tenancy/platform-context");
  let platformService: typeof import("./platform.service");
  let applicationService: typeof import("./application.service");
  let invitationService: typeof import("./invitation.service");
  let loginService: typeof import("@/modules/authentication/login.service");

  beforeAll(async () => {
    if (!adminUrl || !runtimeUrl) return;
    process.env.DATABASE_URL = adminUrl;
    process.env.APP_DATABASE_URL = runtimeUrl;
    db = (await import("@/lib/db")).db;
    sessionStore = await import("@/modules/authentication/session-store");
    principalResolver = await import("@/modules/tenancy/platform-context");
    platformService = await import("./platform.service");
    applicationService = await import("./application.service");
    invitationService = await import("./invitation.service");
    loginService = await import("@/modules/authentication/login.service");
    const { hashPassword } = await import("@/modules/authentication/session");
    const passwordHash = await hashPassword("Phase2A-Test-Password-01");
    await admin.query(`INSERT INTO "User" (id,email,"passwordHash","displayName","isPlatformAdmin","isActive","createdAt","updatedAt")
      VALUES ($1,$2,$3,$4,true,true,now(),now())`, [platformUserId, `platform-${suffix}@example.invalid`, passwordHash, "Synthetic Platform Admin"]);
  }, 30_000);

  afterAll(async () => {
    if (!adminUrl || !runtimeUrl) return;
    try {
      const fixtures = await admin.query(`SELECT id, "collegeId" FROM "CollegeApplication" WHERE "contactEmail"=ANY($1::text[])`, [[applicationEmail, rejectedContactEmail]]);
      const applicationIds = fixtures.rows.map((row) => row.id as string);
      const collegeIds = [...new Set([...fixtures.rows.map((row) => row.collegeId as string | null).filter(Boolean), collegeId].filter(Boolean))] as string[];
      await admin.query(`DELETE FROM "AuditLog" WHERE "collegeId"=ANY($1::uuid[])`, [collegeIds]);
      await admin.query(`DELETE FROM "Session" WHERE "userId"=$1 OR "activeCollegeId"=ANY($2::uuid[])`, [platformUserId, collegeIds]);
      await admin.query(`DELETE FROM "CollegeAdminInvitation" WHERE "applicationId"=ANY($1::uuid[]) OR id=$2`, [applicationIds, invitationId ?? "00000000-0000-0000-0000-000000000000"]);
      await admin.query(`DELETE FROM "PlatformAuditLog" WHERE "actorUserId"=$1`, [platformUserId]);
      await admin.query(`DELETE FROM "CollegeApplication" WHERE id=ANY($1::uuid[])`, [applicationIds]);
      await admin.query(`DELETE FROM "Membership" WHERE "collegeId"=ANY($1::uuid[])`, [collegeIds]);
      await admin.query(`DELETE FROM "College" WHERE id=ANY($1::uuid[])`, [collegeIds]);
      await admin.query(`DELETE FROM "User" WHERE email=$1`, [adminEmail]);
      await admin.query(`DELETE FROM "User" WHERE id=$1`, [platformUserId]);
      const keys = [
        createHash("sha256").update(`college-application:${applicationEmail}`).digest("hex"),
        createHash("sha256").update(`college-application:${rejectedContactEmail}`).digest("hex"),
        createHash("sha256").update(`login:${createHash("sha256").update(adminEmail).digest("hex")}`).digest("hex")
      ];
      await admin.query(`DELETE FROM "RateLimitBucket" WHERE "keyHash" = ANY($1::text[])`, [keys]);
      const residue = await admin.query(`SELECT
        (SELECT count(*)::int FROM "CollegeApplication" WHERE "contactEmail"=ANY($1::text[])) AS applications,
        (SELECT count(*)::int FROM "User" WHERE id=$2 OR email=$3) AS users,
        (SELECT count(*)::int FROM "College" WHERE id=ANY($4::uuid[])) AS colleges`, [[applicationEmail, rejectedContactEmail], platformUserId, adminEmail, collegeIds]);
      expect(residue.rows[0]).toEqual({ applications: 0, users: 0, colleges: 0 });
    } finally {
      await Promise.allSettled([admin.end(), db?.$disconnect()]);
    }
  });

  it("submits, approves once, activates safely, and authenticates a tenant admin", async () => {
    const platformSession = await sessionStore.createUserSession(platformUserId, null);
    const platformPrincipal = await principalResolver.resolvePlatformPrincipal(platformSession.token);
    const applicationInput = {
      collegeName: `Synthetic College ${suffix.slice(0, 8)}`,
      shortName: `Syn ${suffix.slice(0, 6)}`,
      websiteUrl: null,
      contactEmail: applicationEmail,
      contactPhone: "+1 555 0100",
      state: "Synthetic State",
      district: "Synthetic District",
      address: "100 Test Road, Synthetic District",
      administratorName: "Synthetic College Admin",
      administratorEmail: adminEmail,
      message: "Integration fixture only",
      companyWebsite: ""
    };
    const reference = await applicationService.submitCollegeApplication(applicationInput);
    await expect(applicationService.submitCollegeApplication(applicationInput)).rejects.toThrow("A similar application is already being reviewed.");
    await expect(applicationService.submitCollegeApplication(applicationInput)).rejects.toThrow("A similar application is already being reviewed.");
    await expect(applicationService.submitCollegeApplication(applicationInput)).rejects.toThrow("Too many requests.");
    const app = await admin.query(`SELECT id, status FROM "CollegeApplication" WHERE "applicationRef"=$1`, [reference]);
    applicationId = app.rows[0].id;
    expect(app.rows[0].status).toBe("PENDING");
    expect((await admin.query(`SELECT count(*)::int AS n FROM "College" WHERE "normalizedName"=$1`, [`synthetic college ${suffix.slice(0, 8)}`])).rows[0].n).toBe(0);
    expect(await db.collegeApplication.count()).toBe(0);

    for (const role of ["COLLEGE_ADMIN", "STUDENT"] as const) {
      const unauthorized = { kind: "membership", userId: randomUUID(), collegeId: randomUUID(), membershipId: randomUUID(), role, status: "ACTIVE", assignedDepartments: [] } as unknown as Parameters<typeof platformService.approveCollegeApplication>[0];
      await expect(platformService.approveCollegeApplication(unauthorized, applicationId)).rejects.toThrow();
    }
    const approvalAttempts = await Promise.allSettled([
      platformService.approveCollegeApplication(platformPrincipal, applicationId),
      platformService.approveCollegeApplication(platformPrincipal, applicationId)
    ]);
    expect(approvalAttempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(approvalAttempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    const approved = approvalAttempts.find((attempt): attempt is PromiseFulfilledResult<Awaited<ReturnType<typeof platformService.approveCollegeApplication>>> => attempt.status === "fulfilled")!.value;
    collegeId = approved.college.id;
    token = new URL(approved.invitationUrl).pathname.split("/").at(-1)!;
    const invite = await admin.query(`SELECT id, "tokenHash", "expiresAt" FROM "CollegeAdminInvitation" WHERE "applicationId"=$1`, [applicationId]);
    invitationId = invite.rows[0].id;
    expect(invite.rows[0].tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(await invitationService.getInvitation("not-a-valid-token")).toBeNull();
    expect((await admin.query(`SELECT "isActive" FROM "College" WHERE id=$1`, [collegeId])).rows[0].isActive).toBe(false);
    expect((await admin.query(`SELECT count(*)::int AS n FROM "User" WHERE email=$1`, [adminEmail])).rows[0].n).toBe(0);

    expect(await invitationService.getInvitation(token)).toMatchObject({ email: adminEmail });
    await expect(invitationService.acceptCollegeAdminInvitation(token, {
      email: `wrong-${adminEmail}`, displayName: "Wrong Email", password: "Phase2A-College-Password-01"
    })).rejects.toThrow();
    await admin.query(`UPDATE "CollegeAdminInvitation" SET "expiresAt"=now()-interval '1 minute' WHERE id=$1`, [invitationId]);
    expect(await invitationService.getInvitation(token)).toBeNull();
    await expect(invitationService.acceptCollegeAdminInvitation(token, {
      email: adminEmail, displayName: "Expired", password: "Phase2A-College-Password-01"
    })).rejects.toThrow();
    await admin.query(`UPDATE "CollegeAdminInvitation" SET "expiresAt"=now()+interval '7 days' WHERE id=$1`, [invitationId]);
    await admin.query(`UPDATE "CollegeAdminInvitation" SET "revokedAt"=now() WHERE id=$1`, [invitationId]);
    expect(await invitationService.getInvitation(token)).toBeNull();
    await expect(invitationService.acceptCollegeAdminInvitation(token, {
      email: adminEmail, displayName: "Revoked", password: "Phase2A-College-Password-01"
    })).rejects.toThrow();
    await admin.query(`UPDATE "CollegeAdminInvitation" SET "revokedAt"=NULL WHERE id=$1`, [invitationId]);

    const acceptAttempts = await Promise.allSettled([
      invitationService.acceptCollegeAdminInvitation(token, { email: adminEmail, displayName: "Synthetic College Admin", password: "Phase2A-College-Password-01" }),
      invitationService.acceptCollegeAdminInvitation(token, { email: adminEmail, displayName: "Synthetic College Admin", password: "Phase2A-College-Password-01" })
    ]);
    const successfulAccepts = acceptAttempts.filter((attempt): attempt is PromiseFulfilledResult<Awaited<ReturnType<typeof invitationService.acceptCollegeAdminInvitation>>> => attempt.status === "fulfilled");
    const failedAccepts = acceptAttempts.filter((attempt): attempt is PromiseRejectedResult => attempt.status === "rejected");
    if (successfulAccepts.length !== 1) throw new Error(`Concurrent invitation result unexpected: ${failedAccepts.map(({ reason }) => reason instanceof Error ? reason.message : String(reason)).join(" | ")}`);
    expect(successfulAccepts).toHaveLength(1);
    expect(failedAccepts).toHaveLength(1);
    const accepted = successfulAccepts[0].value;
    expect(accepted.token).toBeTruthy();
    const after = await admin.query(`SELECT c."isActive", c."onboardingState", a.status, a."onboardingState" AS app_state,
      i."acceptedAt", m.role, m.status AS membership_status, u."passwordHash"
      FROM "College" c JOIN "CollegeApplication" a ON a."collegeId"=c.id
      JOIN "CollegeAdminInvitation" i ON i."applicationId"=a.id
      JOIN "Membership" m ON m."collegeId"=c.id
      JOIN "User" u ON u.id=m."userId" WHERE c.id=$1`, [collegeId]);
    expect(after.rows).toHaveLength(1);
    expect(after.rows[0]).toMatchObject({ isActive: true, onboardingState: "ADMIN_ACTIVATED", status: "APPROVED", role: "COLLEGE_ADMIN", membership_status: "ACTIVE" });
    expect(after.rows[0].app_state).toBe("ADMIN_ACTIVATED");
    expect(after.rows[0].acceptedAt).toBeTruthy();
    expect(after.rows[0].passwordHash).toMatch(/^scrypt\$/);
    expect(after.rows[0].passwordHash).not.toBe("Phase2A-College-Password-01");

    await expect(invitationService.acceptCollegeAdminInvitation(token, {
      email: adminEmail, displayName: "Replay", password: "Phase2A-College-Password-01"
    })).rejects.toThrow();
    const login = await loginService.authenticateCollegeAdmin(adminEmail, "Phase2A-College-Password-01");
    expect(await sessionStore.resolveSessionContext(login.token)).toMatchObject({ activeCollegeId: collegeId });
    await expect(loginService.authenticateCollegeAdmin(adminEmail, "incorrect-password-123")).rejects.toThrow();
    await sessionStore.revokeUserSession(login.token);
    await sessionStore.revokeUserSession(platformSession.token);

    const rejectedRef = await applicationService.submitCollegeApplication({
      ...applicationInput,
      collegeName: `Rejected Synthetic College ${suffix.slice(0, 8)}`,
      contactEmail: rejectedContactEmail,
      administratorEmail: `rejected-admin-${suffix}@example.invalid`
    });
    const rejected = await admin.query(`SELECT id FROM "CollegeApplication" WHERE "applicationRef"=$1`, [rejectedRef]);
    rejectedApplicationId = rejected.rows[0].id;
    await platformService.rejectCollegeApplication(platformPrincipal, rejectedApplicationId, "Synthetic rejection fixture.");
    const rejectedState = await admin.query(`SELECT status, "rejectionReason", "reviewedByUserId", "collegeId" FROM "CollegeApplication" WHERE id=$1`, [rejectedApplicationId]);
    expect(rejectedState.rows[0]).toMatchObject({ status: "REJECTED", rejectionReason: "Synthetic rejection fixture.", reviewedByUserId: platformUserId, collegeId: null });
    await sessionStore.revokeUserSession(accepted.token);
  }, 30_000);
});
