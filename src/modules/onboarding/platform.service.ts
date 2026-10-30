import { randomBytes, randomUUID } from "node:crypto";
import { CollegeApplicationStatus, CollegeOnboardingState, MembershipRole } from "@/generated/prisma/enums";
import { env } from "@/lib/env";
import type { Prisma } from "@/generated/prisma/client";
import { requirePermission, type Principal } from "@/modules/authorization/permissions";
import { hashSessionToken } from "@/modules/authentication/session";
import { withPlatformTransaction } from "@/modules/tenancy/platform-context";
import { collegeCode, collegeSlug, normalizeCollegeName, rejectionReasonSchema } from "./validation";

type PlatformPrincipal = Extract<Principal, { kind: "platform_admin" }>;

export async function getPlatformOverview(principal: PlatformPrincipal) {
  requirePermission(principal, "platform:applications:manage");
  return withPlatformTransaction(principal, async (transaction) => {
    const applications = await transaction.collegeApplication.groupBy({ by: ["status"], _count: { _all: true } });
    const colleges = await transaction.college.count({ where: { isActive: true } });
    const pendingInvitations = await transaction.collegeAdminInvitation.count({ where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } });
    const counts = Object.fromEntries(applications.map((row) => [row.status, row._count._all]));
    return {
      totalApplications: Object.values(counts).reduce((total, count) => total + count, 0),
      pendingApplications: counts.PENDING ?? 0,
      approvedApplications: counts.APPROVED ?? 0,
      rejectedApplications: counts.REJECTED ?? 0,
      activeColleges: colleges,
      pendingInvitations
    };
  });
}

export async function listCollegeApplications(
  principal: PlatformPrincipal,
  options: { status?: CollegeApplicationStatus; query?: string } = {}
) {
  requirePermission(principal, "platform:applications:manage");
  const query = options.query?.trim().slice(0, 100);
  return withPlatformTransaction(principal, (transaction) => transaction.collegeApplication.findMany({
    where: {
      ...(options.status ? { status: options.status } : {}),
      ...(query ? { OR: [
        { collegeName: { contains: query, mode: "insensitive" } },
        { administratorName: { contains: query, mode: "insensitive" } },
        { administratorEmail: { contains: query, mode: "insensitive" } },
        { applicationRef: { contains: query, mode: "insensitive" } }
      ] } : {})
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, applicationRef: true, collegeName: true, shortName: true,
      administratorName: true, administratorEmail: true, status: true,
      onboardingState: true, createdAt: true, reviewedAt: true
    }
  }));
}

export async function getCollegeApplication(principal: PlatformPrincipal, id: string) {
  requirePermission(principal, "platform:applications:manage");
  return withPlatformTransaction(principal, async (transaction) => {
    const application = await transaction.collegeApplication.findUnique({ where: { id } });
    if (!application) return null;
    const decisions = await transaction.platformAuditLog.findMany({
      where: { entityType: "CollegeApplication", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { action: true, summary: true, createdAt: true, actorUserId: true }
    });
    return { application, decisions };
  });
}

export async function approveCollegeApplication(principal: PlatformPrincipal, id: string) {
  requirePermission(principal, "platform:applications:manage");
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const college = await withPlatformTransaction(principal, async (transaction) => {
    const locked = await transaction.$queryRaw<Array<{
      id: string; collegeName: string; shortName: string; websiteUrl: string | null;
      contactEmail: string; contactPhone: string; state: string; district: string; address: string;
      administratorEmail: string; administratorEmailNormalized: string; submissionKey: string | null;
      status: CollegeApplicationStatus;
    }>>`SELECT id, "collegeName", "shortName", "websiteUrl", "contactEmail", "contactPhone", state, district,
      address, "administratorEmail", "administratorEmailNormalized", "submissionKey", status
      FROM "CollegeApplication" WHERE id = ${id}::uuid FOR UPDATE`;
    const application = locked[0];
    if (!application || application.status !== CollegeApplicationStatus.PENDING) {
      throw new Error("This application is no longer pending review.");
    }
    const normalizedName = normalizeCollegeName(application.collegeName);
    const duplicate = await transaction.college.findUnique({ where: { normalizedName }, select: { id: true } });
    if (duplicate) throw new Error("A college with this name is already registered.");

    const collegeId = randomUUID();
    const suffix = id.replaceAll("-", "").slice(0, 6);
    const slug = `${collegeSlug(application.collegeName).slice(0, 50)}-${suffix}`;
    const code = `${collegeCode(application.shortName).slice(0, 6)}${suffix.toUpperCase()}`;
    await transaction.$executeRaw`SELECT set_config('app.current_tenant_id', ${collegeId}, true)`;
    await transaction.college.create({
      data: {
        id: collegeId,
        name: application.collegeName,
        normalizedName,
        shortName: application.shortName,
        slug,
        code,
        websiteUrl: application.websiteUrl,
        contactEmail: application.contactEmail,
        contactPhone: application.contactPhone,
        state: application.state,
        district: application.district,
        address: application.address,
        isActive: false,
        onboardingState: CollegeOnboardingState.INVITATION_PENDING,
        updatedAt: now
      }
    });

    await transaction.collegeApplication.update({
      where: { id },
      data: {
        status: CollegeApplicationStatus.APPROVED,
        onboardingState: CollegeOnboardingState.INVITATION_PENDING,
        reviewedByUserId: principal.userId,
        reviewedAt: now,
        collegeId,
        submissionKey: null
      }
    });
    await transaction.collegeAdminInvitation.create({
      data: {
        id: randomUUID(),
        applicationId: id,
        collegeId,
        email: application.administratorEmail,
        emailNormalized: application.administratorEmailNormalized,
        tokenHash: hashSessionToken(token),
        role: MembershipRole.COLLEGE_ADMIN,
        issuedByUserId: principal.userId,
        expiresAt
      }
    });
    await writePlatformAudit(transaction, principal, "college_application.approved", "CollegeApplication", id,
      `Approved ${application.collegeName}; created an inactive college and a seven-day administrator invitation.`);
    return { id: collegeId, name: application.collegeName };
  });

  return { college, invitationUrl: new URL(`/accept-invitation/${token}`, env.APP_URL).toString() };
}

export async function rejectCollegeApplication(principal: PlatformPrincipal, id: string, reason: string | null) {
  requirePermission(principal, "platform:applications:manage");
  const parsedReason = rejectionReasonSchema.parse(reason ?? "");
  const now = new Date();
  await withPlatformTransaction(principal, async (transaction) => {
    const locked = await transaction.$queryRaw<Array<{ id: string; collegeName: string; status: CollegeApplicationStatus }>>`
      SELECT id, "collegeName", status FROM "CollegeApplication" WHERE id = ${id}::uuid FOR UPDATE`;
    const application = locked[0];
    if (!application || application.status !== CollegeApplicationStatus.PENDING) {
      throw new Error("This application is no longer pending review.");
    }
    await transaction.collegeApplication.update({
      where: { id },
      data: {
        status: CollegeApplicationStatus.REJECTED,
        onboardingState: null,
        rejectionReason: parsedReason,
        reviewedByUserId: principal.userId,
        reviewedAt: now,
        submissionKey: null
      }
    });
    await writePlatformAudit(transaction, principal, "college_application.rejected", "CollegeApplication", id,
      `Rejected ${application.collegeName}${parsedReason ? `; reason: ${parsedReason}` : "."}`);
  });
}

export async function listApprovedColleges(principal: PlatformPrincipal) {
  requirePermission(principal, "platform:colleges:manage");
  return withPlatformTransaction(principal, async (transaction) => {
    const colleges = await transaction.college.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, shortName: true, code: true, isActive: true, onboardingState: true, createdAt: true }
    });
    const memberships = await transaction.membership.findMany({
      where: { role: MembershipRole.COLLEGE_ADMIN },
      select: { id: true, collegeId: true, userId: true, status: true }
    });
    const admins = [] as Array<{ membershipId: string; collegeId: string; status: string; displayName: string; email: string }>;
    for (const membership of memberships) {
      await transaction.$executeRaw`SELECT set_config('app.current_user_id', ${membership.userId}, true)`;
      const user = await transaction.user.findUnique({
        where: { id: membership.userId },
        select: { displayName: true, email: true }
      });
      if (user) admins.push({ membershipId: membership.id, collegeId: membership.collegeId, status: membership.status, ...user });
    }
    return colleges.map((college) => ({
      ...college,
      administrators: admins.filter((admin) => admin.collegeId === college.id)
    }));
  });
}

export async function listPlatformInvitations(principal: PlatformPrincipal) {
  requirePermission(principal, "platform:colleges:manage");
  return withPlatformTransaction(principal, (transaction) => transaction.collegeAdminInvitation.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, email: true, emailNormalized: true, role: true, expiresAt: true,
      acceptedAt: true, revokedAt: true, createdAt: true,
      college: { select: { id: true, name: true, isActive: true } }
    }
  }));
}

export async function revokeCollegeInvitation(principal: PlatformPrincipal, id: string): Promise<void> {
  requirePermission(principal, "platform:colleges:manage");
  await withPlatformTransaction(principal, async (transaction) => {
    const invitation = await transaction.collegeAdminInvitation.findUnique({ where: { id }, select: { id: true, acceptedAt: true, revokedAt: true } });
    if (!invitation || invitation.acceptedAt || invitation.revokedAt) throw new Error("This invitation cannot be revoked.");
    await transaction.collegeAdminInvitation.update({ where: { id }, data: { revokedAt: new Date() } });
    await writePlatformAudit(transaction, principal, "college_invitation.revoked", "CollegeAdminInvitation", id, "Revoked an administrator invitation.");
  });
}

export async function setCollegeActivation(principal: PlatformPrincipal, id: string, active: boolean): Promise<void> {
  requirePermission(principal, "platform:colleges:manage");
  await withPlatformTransaction(principal, async (transaction) => {
    const college = await transaction.college.findUnique({ where: { id }, select: { name: true, onboardingState: true, isActive: true } });
    if (!college) throw new Error("College was not found.");
    if (college.onboardingState === CollegeOnboardingState.INVITATION_PENDING) {
      throw new Error("The college remains inactive until its administrator accepts the invitation.");
    }
    await transaction.college.update({ where: { id }, data: { isActive: active } });
    await writePlatformAudit(transaction, principal, active ? "college.reactivated" : "college.suspended", "College", id,
      `${active ? "Reactivated" : "Suspended"} ${college.name}.`);
  });
}

async function writePlatformAudit(
  transaction: Prisma.TransactionClient,
  principal: PlatformPrincipal,
  action: string,
  entityType: string,
  entityId: string,
  summary: string
) {
  await transaction.platformAuditLog.create({
    data: { id: randomUUID(), actorUserId: principal.userId, action, entityType, entityId, summary }
  });
}
