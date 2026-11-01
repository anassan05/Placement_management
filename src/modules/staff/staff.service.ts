import { randomBytes, randomUUID } from "node:crypto";
import { MembershipRole, MembershipStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { AuthenticationError, AuthorizationError } from "@/lib/errors";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { onboardingRateLimits } from "@/lib/postgres-rate-limit";
import { hashPassword, hashSessionToken, verifyPassword, verifySessionToken } from "@/modules/authentication/session";
import { createUserSessionInTransaction } from "@/modules/authentication/session-store";
import { recordAuditEvent } from "@/modules/audit/audit.service";
import { requirePermission, type Principal } from "@/modules/authorization/permissions";
import { withTenantTransaction } from "@/modules/tenancy/tenant-context";
import { departmentSchema, staffAcceptanceSchema, staffInvitationSchema, staffRoleSchema } from "./validation";

type CollegeAdmin = Extract<Principal, { kind: "membership" }>;
const staffRoles = [MembershipRole.PLACEMENT_OFFICER, MembershipRole.COORDINATOR] as const;
const inviteTtlMs = 7 * 24 * 60 * 60 * 1000;

function admin(principal: Principal, permission: "staff:manage" | "departments:manage" = "staff:manage"): asserts principal is CollegeAdmin {
  requirePermission(principal, permission);
  if (principal.kind !== "membership" || principal.role !== MembershipRole.COLLEGE_ADMIN) throw new AuthorizationError("College administrator access is required.");
}

export async function listDepartments(principal: Principal) {
  if (principal.kind !== "membership") throw new AuthorizationError("College membership is required.");
  return withTenantTransaction(principal, (tx) => tx.department.findMany({
    where: principal.role === MembershipRole.COORDINATOR ? { isActive: true, assignments: { some: { membershipId: principal.membershipId } } } : {},
    orderBy: { name: "asc" },
    select: { id: true, name: true, shortCode: true, description: true, isActive: true, _count: { select: { assignments: true } } }
  }));
}

export async function createDepartment(principal: Principal, raw: unknown) {
  admin(principal, "departments:manage");
  const input = departmentSchema.parse(raw);
  return withTenantTransaction(principal, async (tx) => {
    const department = await tx.department.create({ data: { id: randomUUID(), collegeId: principal.collegeId, ...input, updatedAt: new Date() }, select: { id: true, name: true } });
    await recordAuditEvent(tx, principal, { action: "department.created", entityType: "Department", entityId: department.id });
    return department;
  });
}

export async function updateDepartment(principal: Principal, id: string, raw: unknown) {
  admin(principal, "departments:manage");
  const input = departmentSchema.parse(raw);
  return withTenantTransaction(principal, async (tx) => {
    const existing = await tx.department.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new AuthorizationError("Department not found.");
    const result = await tx.department.update({ where: { id }, data: { ...input }, select: { id: true } });
    await recordAuditEvent(tx, principal, { action: "department.updated", entityType: "Department", entityId: id });
    return result;
  });
}

export async function setDepartmentActive(principal: Principal, id: string, active: boolean) {
  admin(principal, "departments:manage");
  await withTenantTransaction(principal, async (tx) => {
    const previous = await tx.department.findUnique({ where: { id }, select: { isActive: true } });
    if (!previous) throw new AuthorizationError("Department not found.");
    if (previous.isActive === active) return;
    await tx.department.update({ where: { id }, data: { isActive: active } });
    await recordAuditEvent(tx, principal, { action: active ? "department.activated" : "department.deactivated", entityType: "Department", entityId: id });
  });
}

export async function listStaff(principal: Principal) {
  admin(principal);
  return withTenantTransaction(principal, async (tx) => {
    const [memberships, invitations] = await Promise.all([
      tx.membership.findMany({ where: { role: { in: [...staffRoles] } }, orderBy: { createdAt: "desc" }, select: {
        id: true, userId: true, role: true, status: true, createdAt: true,
        user: { select: { displayName: true, email: true } },
        departmentAssignments: { select: { department: { select: { id: true, name: true, shortCode: true } } } }
      } }),
      tx.staffInvitation.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: {
        id: true, fullName: true, email: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true, createdAt: true, acceptedByUserId: true
      } })
    ]);
    return { memberships, invitations };
  });
}

export async function createStaffInvitation(principal: Principal, raw: unknown): Promise<{ invitationUrl: string }> {
  admin(principal);
  const input = staffInvitationSchema.parse(raw);
  await enforceRateLimit(onboardingRateLimits, `staff-invite:${principal.collegeId}:${principal.userId}`, 10, 3600);
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const id = randomUUID();
  await withTenantTransaction(principal, async (tx) => {
    if (input.departmentIds.length) {
      const departments = await tx.department.findMany({ where: { id: { in: input.departmentIds }, isActive: true }, select: { id: true } });
      if (departments.length !== new Set(input.departmentIds).size) throw new AuthorizationError("Select active departments in your college.");
    }
    await tx.$executeRaw`SELECT set_config('app.auth_email', ${input.email}, true)`;
    const user = await tx.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (user) {
      const membership = await tx.membership.findUnique({ where: { collegeId_userId: { collegeId: principal.collegeId, userId: user.id } }, select: { status: true } });
      if (membership) throw new Error("A college staff account already exists for this address.");
    }
    const pending = await tx.staffInvitation.findFirst({ where: { emailNormalized: input.email, acceptedAt: null, revokedAt: null } });
    if (pending && pending.expiresAt > now) throw new Error("An invitation for this address and role is already pending.");
    if (pending) await tx.staffInvitation.update({ where: { id: pending.id }, data: { revokedAt: now } });
    const invitation = await tx.staffInvitation.create({ data: {
      id, collegeId: principal.collegeId, fullName: input.fullName, email: input.email, emailNormalized: input.email,
      role: input.role, message: input.message, tokenHash: hashSessionToken(token), issuedByUserId: principal.userId,
      expiresAt: new Date(now.getTime() + inviteTtlMs)
    }, select: { id: true } });
    if (input.departmentIds.length) {
      await tx.staffInvitationDepartment.createMany({ data: input.departmentIds.map((departmentId) => ({ invitationId: id, collegeId: principal.collegeId, departmentId })) });
    }
    await recordAuditEvent(tx, principal, { action: "staff_invitation.created", entityType: "StaffInvitation", entityId: invitation.id });
  });
  return { invitationUrl: new URL(`/accept-staff-invitation/${token}`, env.APP_URL).toString() };
}

export async function listStaffInvitations(principal: Principal) {
  admin(principal);
  return withTenantTransaction(principal, (tx) => tx.staffInvitation.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: {
    id: true, fullName: true, email: true, role: true, message: true, expiresAt: true, acceptedAt: true, revokedAt: true, createdAt: true,
    departments: { select: { department: { select: { name: true, shortCode: true } } } }
  } }));
}

export async function revokeStaffInvitation(principal: Principal, id: string) {
  admin(principal);
  await withTenantTransaction(principal, async (tx) => {
    const invite = await tx.staffInvitation.findUnique({ where: { id }, select: { acceptedAt: true, revokedAt: true } });
    if (!invite || invite.acceptedAt || invite.revokedAt) throw new Error("Invitation is no longer pending.");
    await tx.staffInvitation.update({ where: { id }, data: { revokedAt: new Date() } });
    await recordAuditEvent(tx, principal, { action: "staff_invitation.revoked", entityType: "StaffInvitation", entityId: id });
  });
}

export async function resendStaffInvitation(principal: Principal, id: string): Promise<{ invitationUrl: string }> {
  admin(principal);
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const newId = randomUUID();
  await withTenantTransaction(principal, async (tx) => {
    const old = await tx.staffInvitation.findUnique({ where: { id }, select: { fullName: true, email: true, emailNormalized: true, role: true, message: true, acceptedAt: true, revokedAt: true, departments: { select: { departmentId: true } } } });
    if (!old || old.acceptedAt || old.revokedAt) throw new Error("Invitation is no longer pending.");
    await tx.staffInvitation.update({ where: { id }, data: { revokedAt: now } });
    await recordAuditEvent(tx, principal, { action: "staff_invitation.resent", entityType: "StaffInvitation", entityId: id });
    const activeDepartments = await tx.department.findMany({ where: { id: { in: old.departments.map((d) => d.departmentId) }, isActive: true }, select: { id: true } });
    if (old.role === MembershipRole.COORDINATOR && activeDepartments.length !== old.departments.length) throw new Error("Reactivate all assigned departments before resending this invitation.");
    await tx.staffInvitation.create({ data: {
      id: newId, collegeId: principal.collegeId, fullName: old.fullName, email: old.email, emailNormalized: old.emailNormalized,
      role: old.role, message: old.message, tokenHash: hashSessionToken(token), issuedByUserId: principal.userId,
      expiresAt: new Date(now.getTime() + inviteTtlMs)
    } });
    if (old.departments.length) {
      await tx.staffInvitationDepartment.createMany({ data: old.departments.map(({ departmentId }) => ({ invitationId: newId, collegeId: principal.collegeId, departmentId })) });
    }
    await recordAuditEvent(tx, principal, { action: "staff_invitation.created", entityType: "StaffInvitation", entityId: newId });
  });
  return { invitationUrl: new URL(`/accept-staff-invitation/${token}`, env.APP_URL).toString() };
}

export async function getStaffInvitation(token: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const tokenHash = hashSessionToken(token);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.staff_invitation_token_hash', ${tokenHash}, true)`;
    const invite = await tx.staffInvitation.findUnique({ where: { tokenHash }, select: {
      id: true, collegeId: true, fullName: true, email: true, role: true, message: true, tokenHash: true,
      expiresAt: true, acceptedAt: true, revokedAt: true
    } });
    if (!invite || !verifySessionToken(token, invite.tokenHash) || invite.acceptedAt || invite.revokedAt || invite.expiresAt <= new Date()) return null;
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${invite.collegeId}, true)`;
    const college = await tx.college.findUnique({ where: { id: invite.collegeId }, select: { name: true, isActive: true } });
    if (!college?.isActive) return null;
    return { id: invite.id, collegeId: invite.collegeId, fullName: invite.fullName, email: invite.email, role: invite.role, message: invite.message, collegeName: college.name };
  });
}

export async function acceptStaffInvitation(token: string, raw: unknown) {
  const input = staffAcceptanceSchema.parse(raw);
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw new AuthenticationError("This invitation is invalid or expired.");
  await enforceRateLimit(onboardingRateLimits, `staff-accept:${hashSessionToken(token)}`, 10, 3600).catch((error: unknown) => {
    if (error instanceof RateLimitError) throw new AuthenticationError("This invitation cannot be accepted right now.");
    throw error;
  });
  const tokenHash = hashSessionToken(token);
  const now = new Date();
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.staff_invitation_token_hash', ${tokenHash}, true)`;
    const rows = await tx.$queryRaw<Array<{ id: string; collegeId: string; fullName: string; email: string; emailNormalized: string; role: "PLACEMENT_OFFICER" | "COORDINATOR"; tokenHash: string; expiresAt: Date; acceptedAt: Date | null; revokedAt: Date | null }>>`
      SELECT id, "collegeId", "fullName", email, "emailNormalized", role, "tokenHash", "expiresAt", "acceptedAt", "revokedAt"
      FROM "StaffInvitation" WHERE "tokenHash"=${tokenHash} FOR UPDATE`;
    const invite = rows[0];
    if (!invite || !verifySessionToken(token, invite.tokenHash) || invite.acceptedAt || invite.revokedAt || invite.expiresAt <= now || !staffRoleSchema.safeParse(invite.role).success) throw new AuthenticationError("This invitation is invalid or expired.");
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
        VALUES (${userId}::uuid,${invite.emailNormalized},${passwordHash},${input.displayName},false,${now},${now})`;
    }
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
    const college = await tx.college.findUnique({ where: { id: invite.collegeId }, select: { isActive: true } });
    if (!college?.isActive) throw new AuthenticationError("This invitation is invalid or expired.");
    const membership = await tx.membership.create({ data: { id: randomUUID(), collegeId: invite.collegeId, userId, role: invite.role, status: MembershipStatus.ACTIVE }, select: { id: true } });
    const assigned = await tx.staffInvitationDepartment.findMany({ where: { invitationId: invite.id }, select: { departmentId: true } });
    if (invite.role === MembershipRole.COORDINATOR && assigned.length === 0) throw new AuthenticationError("The Coordinator invitation has no active department assignment.");
    if (assigned.length) {
      const active = await tx.department.findMany({ where: { id: { in: assigned.map((d) => d.departmentId) }, isActive: true }, select: { id: true } });
      if (active.length !== assigned.length) throw new AuthenticationError("An assigned department is inactive.");
      await tx.membershipDepartment.createMany({ data: assigned.map(({ departmentId }) => ({ membershipId: membership.id, collegeId: invite.collegeId, departmentId })) });
    }
    await tx.staffInvitation.update({ where: { id: invite.id }, data: { acceptedAt: now, acceptedByUserId: userId } });
    const principal = { kind: "membership" as const, userId, collegeId: invite.collegeId, membershipId: membership.id, role: invite.role, status: "ACTIVE" as const, assignedDepartments: [] };
    await recordAuditEvent(tx, principal, { action: "staff_invitation.accepted", entityType: "StaffInvitation", entityId: invite.id });
    await recordAuditEvent(tx, principal, { action: "staff_membership.created", entityType: "Membership", entityId: membership.id });
    return createUserSessionInTransaction(tx, userId, invite.collegeId);
  });
}

export async function setStaffMembershipActive(principal: Principal, membershipId: string, active: boolean) {
  admin(principal);
  await withTenantTransaction(principal, async (tx) => {
    const membership = await tx.membership.findUnique({ where: { id: membershipId }, select: { role: true, status: true } });
    if (!membership || !staffRoles.includes(membership.role as typeof staffRoles[number])) throw new AuthorizationError("Staff membership not found.");
    const status = active ? MembershipStatus.ACTIVE : MembershipStatus.SUSPENDED;
    if (membership.status === status) return;
    await tx.membership.update({ where: { id: membershipId }, data: { status } });
    await recordAuditEvent(tx, principal, { action: active ? "staff_membership.reactivated" : "staff_membership.deactivated", entityType: "Membership", entityId: membershipId });
  });
}

export async function setCoordinatorDepartment(principal: Principal, membershipId: string, departmentId: string, assign: boolean) {
  admin(principal);
  await withTenantTransaction(principal, async (tx) => {
    const membership = await tx.membership.findUnique({ where: { id: membershipId }, select: { role: true, status: true } });
    const department = await tx.department.findUnique({ where: { id: departmentId }, select: { isActive: true } });
    if (!membership || membership.role !== MembershipRole.COORDINATOR || membership.status !== MembershipStatus.ACTIVE || !department || (assign && !department.isActive)) throw new AuthorizationError("A Coordinator and active department in this college are required.");
    if (assign) {
      const existing = await tx.membershipDepartment.findUnique({ where: { membershipId_departmentId: { membershipId, departmentId } }, select: { membershipId: true } });
      if (!existing) await tx.membershipDepartment.create({ data: { membershipId, collegeId: principal.collegeId, departmentId } });
    } else await tx.membershipDepartment.deleteMany({ where: { membershipId, departmentId } });
    await recordAuditEvent(tx, principal, { action: assign ? "coordinator.department_assigned" : "coordinator.department_unassigned", entityType: "MembershipDepartment", entityId: membershipId });
  });
}
