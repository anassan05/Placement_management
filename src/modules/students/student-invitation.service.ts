import { randomBytes, randomUUID } from "node:crypto";
import { MembershipRole, MembershipStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { AuthenticationError, AuthorizationError } from "@/lib/errors";
import { onboardingRateLimits } from "@/lib/postgres-rate-limit";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { hashPassword, hashSessionToken, verifyPassword, verifySessionToken } from "@/modules/authentication/session";
import { createUserSessionInTransaction } from "@/modules/authentication/session-store";
import { recordAuditEvent } from "@/modules/audit/audit.service";
import { requirePermission, type Principal } from "@/modules/authorization/permissions";
import { withTenantTransaction } from "@/modules/tenancy/tenant-context";
import { studentAcceptanceSchema, studentInvitationSchema } from "./validation";

const inviteTtlMs = 7 * 24 * 60 * 60 * 1000;
export type StudentInvitationInput = ReturnType<typeof studentInvitationSchema.parse>;

function canManageStudents(principal: Principal): asserts principal is Extract<Principal, { kind: "membership" }> {
  if (principal.kind !== "membership") throw new AuthorizationError("College membership is required.");
  requirePermission(principal, "students:write");
}

export async function createStudentInvitation(principal: Principal, raw: unknown): Promise<{ invitationUrl: string }> {
  canManageStudents(principal);
  const input = studentInvitationSchema.parse(raw);
  const result = await createStudentInvitations(principal, [input]);
  return { invitationUrl: result.invitationUrls[0] };
}

export async function createStudentInvitations(
  principal: Principal,
  rawInputs: readonly unknown[],
  importId = randomUUID()
): Promise<{ invitationUrls: string[]; created: number }> {
  canManageStudents(principal);
  const inputs = rawInputs.map((raw) => studentInvitationSchema.parse(raw));
  await enforceRateLimit(onboardingRateLimits, `student-invite:${principal.collegeId}:${principal.userId}`, Math.max(30, inputs.length), 3600);
  const tokens = inputs.map(() => randomBytes(32).toString("base64url"));
  const now = new Date();
  await withTenantTransaction(principal, async (tx) => {
    const departments = await tx.department.findMany({ where: { id: { in: inputs.map((input) => input.departmentId) }, isActive: true }, select: { id: true, shortCode: true } });
    const byId = new Map(departments.map((department) => [department.id, department]));
    for (const input of inputs) {
      const department = byId.get(input.departmentId);
      if (!department || (principal.role === MembershipRole.COORDINATOR && !principal.assignedDepartments.includes(department.shortCode))) {
        throw new AuthorizationError("Select active departments you can manage.");
      }
      await tx.$executeRaw`SELECT set_config('app.auth_email', ${input.email}, true)`;
      const user = await tx.user.findUnique({ where: { email: input.email }, select: { id: true } });
      if (user) {
        const membership = await tx.membership.findUnique({ where: { collegeId_userId: { collegeId: principal.collegeId, userId: user.id } }, select: { id: true } });
        if (membership) throw new Error("A college account already exists for this address.");
      }
      const pending = await tx.studentInvitation.findFirst({ where: { emailNormalized: input.email, acceptedAt: null, revokedAt: null } });
      if (pending && pending.expiresAt > now) throw new Error("An invitation for this address is already pending.");
      if (pending) await tx.studentInvitation.update({ where: { id: pending.id }, data: { revokedAt: now } });
      const existingStudent = await tx.studentProfile.findUnique({ where: { collegeId_registerNumber: { collegeId: principal.collegeId, registerNumber: input.registerNumber } }, select: { id: true } });
      if (existingStudent) throw new Error("This register number is already enrolled.");
    }
    await recordAuditEvent(tx, principal, { action: "student_import.created", entityType: "StudentImport", entityId: importId });
    for (const [index, input] of inputs.entries()) {
      const invitation = await tx.studentInvitation.create({ data: {
        id: randomUUID(), collegeId: principal.collegeId, departmentId: input.departmentId, fullName: input.fullName,
        email: input.email, emailNormalized: input.email, registerNumber: input.registerNumber, batchYear: input.batchYear,
        cgpa: input.cgpa, tenthPercentage: input.tenthPercentage, twelfthPercentage: input.twelfthPercentage,
        standingArrears: input.standingArrears, historyOfArrears: input.historyOfArrears,
        tokenHash: hashSessionToken(tokens[index]), issuedByUserId: principal.userId, expiresAt: new Date(now.getTime() + inviteTtlMs)
      }, select: { id: true } });
      await recordAuditEvent(tx, principal, { action: "student_invitation.created", entityType: "StudentInvitation", entityId: invitation.id });
    }
    await recordAuditEvent(tx, principal, { action: "student_import.completed", entityType: "StudentImport", entityId: importId });
  });
  return { invitationUrls: tokens.map((token) => new URL(`/accept-student-invitation/${token}`, env.APP_URL).toString()), created: inputs.length };
}

export async function getStudentInvitation(token: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const tokenHash = hashSessionToken(token);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.student_invitation_token_hash', ${tokenHash}, true)`;
    const invite = await tx.studentInvitation.findUnique({ where: { tokenHash }, select: {
      id: true, collegeId: true, departmentId: true, fullName: true, email: true, registerNumber: true, batchYear: true,
      tokenHash: true, expiresAt: true, acceptedAt: true, revokedAt: true
    } });
    if (!invite || !verifySessionToken(token, invite.tokenHash) || invite.acceptedAt || invite.revokedAt || invite.expiresAt <= new Date()) return null;
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${invite.collegeId}, true)`;
    const college = await tx.college.findUnique({ where: { id: invite.collegeId }, select: { name: true, isActive: true } });
    const department = await tx.department.findUnique({ where: { id: invite.departmentId }, select: { name: true, shortCode: true, isActive: true } });
    if (!college?.isActive || !department?.isActive) return null;
    return { id: invite.id, fullName: invite.fullName, email: invite.email, registerNumber: invite.registerNumber, batchYear: invite.batchYear, departmentName: department.name, collegeName: college.name };
  });
}

export async function acceptStudentInvitation(token: string, raw: unknown) {
  const input = studentAcceptanceSchema.parse(raw);
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw new AuthenticationError("This invitation is invalid or expired.");
  try { await enforceRateLimit(onboardingRateLimits, `student-accept:${hashSessionToken(token)}`, 10, 3600); }
  catch (error) { if (error instanceof RateLimitError) throw new AuthenticationError("This invitation cannot be accepted right now."); throw error; }
  const tokenHash = hashSessionToken(token);
  const now = new Date();
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.student_invitation_token_hash', ${tokenHash}, true)`;
    const rows = await tx.$queryRaw<Array<{ id: string; collegeId: string; departmentId: string; fullName: string; emailNormalized: string; registerNumber: string; batchYear: number; cgpa: number | null; tenthPercentage: number | null; twelfthPercentage: number | null; standingArrears: number | null; historyOfArrears: boolean | null; tokenHash: string; expiresAt: Date; acceptedAt: Date | null; revokedAt: Date | null }>>`
      SELECT id, "collegeId", "departmentId", "fullName", "emailNormalized", "registerNumber", "batchYear", "cgpa", "tenthPercentage", "twelfthPercentage", "standingArrears", "historyOfArrears", "tokenHash", "expiresAt", "acceptedAt", "revokedAt"
      FROM "StudentInvitation" WHERE "tokenHash" = ${tokenHash} FOR UPDATE`;
    const invite = rows[0];
    if (!invite || !verifySessionToken(token, invite.tokenHash) || invite.acceptedAt || invite.revokedAt || invite.expiresAt <= now) throw new AuthenticationError("This invitation is invalid or expired.");
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${invite.collegeId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.auth_email', ${invite.emailNormalized}, true)`;
    const existing = await tx.user.findUnique({ where: { email: invite.emailNormalized }, select: { id: true, passwordHash: true, isActive: true, isPlatformAdmin: true } });
    let userId: string;
    if (existing) {
      if (!existing.isActive || existing.isPlatformAdmin || !existing.passwordHash || !(await verifyPassword(input.password, existing.passwordHash))) throw new AuthenticationError("This email already has an account. Sign in using its existing password.");
      userId = existing.id;
    } else {
      userId = randomUUID();
      const passwordHash = await hashPassword(input.password);
      await tx.$executeRaw`INSERT INTO "User" (id,email,"passwordHash","displayName","isPlatformAdmin","createdAt","updatedAt")
        VALUES (${userId}::uuid,${invite.emailNormalized},${passwordHash},${invite.fullName},false,${now},${now})`;
    }
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
    const department = await tx.department.findUnique({ where: { id: invite.departmentId }, select: { isActive: true, shortCode: true } });
    if (!department?.isActive) throw new AuthenticationError("This invitation is invalid or expired.");
    const membership = await tx.membership.create({ data: { id: randomUUID(), collegeId: invite.collegeId, userId, role: MembershipRole.STUDENT, status: MembershipStatus.ACTIVE }, select: { id: true } });
    const profile = await tx.studentProfile.create({ data: {
      id: randomUUID(), collegeId: invite.collegeId, membershipId: membership.id, registerNumber: invite.registerNumber,
      fullName: invite.fullName, departmentCode: department.shortCode, batchYear: invite.batchYear
    }, select: { id: true } });
    if (invite.cgpa !== null || invite.tenthPercentage !== null || invite.twelfthPercentage !== null || invite.standingArrears !== null || invite.historyOfArrears !== null) {
      await tx.academicRecord.create({ data: {
        id: randomUUID(), studentId: profile.id, cgpa: invite.cgpa, tenthPercentage: invite.tenthPercentage,
        twelfthPercentage: invite.twelfthPercentage, standingArrears: invite.standingArrears, historyOfArrears: invite.historyOfArrears
      } });
    }
    await tx.studentInvitation.update({ where: { id: invite.id }, data: { acceptedAt: now, acceptedByUserId: userId } });
    const principal = { kind: "membership" as const, userId, collegeId: invite.collegeId, membershipId: membership.id, role: MembershipRole.STUDENT, status: "ACTIVE" as const, assignedDepartments: [] };
    await recordAuditEvent(tx, principal, { action: "student_invitation.accepted", entityType: "StudentInvitation", entityId: invite.id });
    await recordAuditEvent(tx, principal, { action: "student_membership.created", entityType: "Membership", entityId: membership.id });
    return createUserSessionInTransaction(tx, userId, invite.collegeId);
  });
}
