import { randomUUID } from "node:crypto";
import { CollegeOnboardingState, MembershipRole, MembershipStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { AuthenticationError } from "@/lib/errors";
import { recordAuditEvent } from "@/modules/audit/audit.service";
import { createUserSessionInTransaction } from "@/modules/authentication/session-store";
import { hashPassword, hashSessionToken, verifyPassword, verifySessionToken } from "@/modules/authentication/session";
import { invitationAcceptanceSchema } from "./validation";

export async function getInvitation(token: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const tokenHash = hashSessionToken(token);
  return db.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('app.invitation_token_hash', ${tokenHash}, true)`;
    const invite = await transaction.collegeAdminInvitation.findUnique({
      where: { tokenHash },
      select: { email: true, emailNormalized: true, collegeId: true, tokenHash: true, expiresAt: true, acceptedAt: true, revokedAt: true }
    });
    if (!invite || !verifySessionToken(token, invite.tokenHash) || invite.acceptedAt || invite.revokedAt || invite.expiresAt <= new Date()) return null;
    await transaction.$executeRaw`SELECT set_config('app.current_tenant_id', ${invite.collegeId}, true)`;
    const college = await transaction.college.findUnique({ where: { id: invite.collegeId }, select: { name: true } });
    if (!college) return null;
    return { email: invite.email, collegeName: college.name, expiresAt: invite.expiresAt };
  });
}

export async function acceptCollegeAdminInvitation(token: string, rawInput: unknown) {
  const input = invitationAcceptanceSchema.parse(rawInput);
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw new AuthenticationError("This invitation is invalid or expired.");
  const tokenHash = hashSessionToken(token);
  const now = new Date();
  return db.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('app.invitation_token_hash', ${tokenHash}, true)`;
    const rows = await transaction.$queryRaw<Array<{
      id: string; applicationId: string; collegeId: string; email: string; emailNormalized: string; tokenHash: string;
      expiresAt: Date; acceptedAt: Date | null; revokedAt: Date | null;
    }>>`SELECT id, "applicationId", "collegeId", email, "emailNormalized", "tokenHash", "expiresAt", "acceptedAt", "revokedAt"
       FROM "CollegeAdminInvitation" WHERE "tokenHash" = ${tokenHash} FOR UPDATE`;
    const invitation = rows[0];
    if (!invitation || !verifySessionToken(token, invitation.tokenHash) || invitation.emailNormalized !== input.email || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= now) {
      throw new AuthenticationError("This invitation is invalid or expired.");
    }

    await transaction.$executeRaw`SELECT set_config('app.auth_email', ${input.email}, true)`;
    const existing = await transaction.user.findUnique({
      where: { email: input.email },
      select: { id: true, passwordHash: true, isActive: true, isPlatformAdmin: true }
    });
    let userId: string;
    if (existing) {
      if (!existing.isActive || existing.isPlatformAdmin || !existing.passwordHash || !(await verifyPassword(input.password, existing.passwordHash))) {
        throw new AuthenticationError("This email already has an account. Sign in using its existing password.");
      }
      userId = existing.id;
    } else {
      userId = randomUUID();
      const passwordHash = await hashPassword(input.password);
      const created = await transaction.$executeRaw`INSERT INTO "User" (id, email, "passwordHash", "displayName", "isPlatformAdmin", "createdAt", "updatedAt")
        VALUES (${userId}::uuid, ${input.email}, ${passwordHash}, ${input.displayName}, false, ${now}, ${now})`;
      if (created !== 1) throw new Error("The administrator account could not be created.");
    }

    await transaction.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
    await transaction.$executeRaw`SELECT set_config('app.current_tenant_id', ${invitation.collegeId}, true)`;
    const current = await transaction.collegeAdminInvitation.findUnique({
      where: { id: invitation.id }, select: { acceptedAt: true, revokedAt: true }
    });
    if (!current || current.acceptedAt || current.revokedAt) throw new AuthenticationError("This invitation is invalid or expired.");

    const college = await transaction.college.findUnique({ where: { id: invitation.collegeId }, select: { id: true } });
    if (!college) throw new AuthenticationError("This invitation is invalid or expired.");
    const membership = await transaction.membership.create({
      data: { id: randomUUID(), collegeId: invitation.collegeId, userId, role: MembershipRole.COLLEGE_ADMIN, status: MembershipStatus.ACTIVE },
      select: { id: true }
    });
    await transaction.college.update({
      where: { id: invitation.collegeId },
      data: { isActive: true, onboardingState: CollegeOnboardingState.ADMIN_ACTIVATED }
    });
    await transaction.collegeAdminInvitation.update({
      where: { id: invitation.id }, data: { acceptedAt: now, acceptedByUserId: userId }
    });
    await transaction.$executeRaw`SELECT set_config('app.invitation_application_id', ${invitation.applicationId}, true)`;
    await transaction.collegeApplication.update({
      where: { id: invitation.applicationId },
      data: { onboardingState: CollegeOnboardingState.ADMIN_ACTIVATED }
    });
    await transaction.$executeRaw`SELECT set_config('app.current_tenant_id', ${invitation.collegeId}, true)`;
    await recordAuditEvent(transaction, {
      kind: "membership", userId, collegeId: invitation.collegeId, membershipId: membership.id,
      role: MembershipRole.COLLEGE_ADMIN, status: "ACTIVE", assignedDepartments: []
    }, { action: "college_admin.invitation_accepted", entityType: "CollegeAdminInvitation", entityId: invitation.id });
    const session = await createUserSessionInTransaction(transaction, userId, invitation.collegeId);
    return session;
  });
}
