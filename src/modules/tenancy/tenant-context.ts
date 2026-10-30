import { db } from "@/lib/db";
import { AuthenticationError, AuthorizationError } from "@/lib/errors";
import type { Principal } from "@/modules/authorization/permissions";
import { MembershipRole } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { resolveSessionContext } from "@/modules/authentication/session-store";
import { normalizeHost } from "./normalize-host";

export { isTrustedHost, normalizeHost } from "./normalize-host";

const verifiedMembershipPrincipals = new WeakSet<object>();

/** Resolves an untrusted Host header only to a verified domain and active college. */
export async function resolvePublicCollege(hostHeader: string) {
  const hostname = normalizeHost(hostHeader);
  if (!hostname || hostname.includes("/") || hostname.includes("\\")) return null;
  return db.collegeDomain.findFirst({
    where: { hostname, verifiedAt: { not: null }, college: { isActive: true } },
    select: {
      college: { select: { id: true, name: true, slug: true, code: true } }
    }
  }).then((domain) => domain?.college ?? null);
}

/** Builds tenant identity only from an unexpired server-side session's active membership. */
export async function resolveMembershipPrincipal(
  sessionToken: string
): Promise<Extract<Principal, { kind: "membership" }>> {
  const session = await resolveSessionContext(sessionToken);
  if (!session || !session.activeCollegeId) {
    throw new AuthenticationError("An active college session is required.");
  }
  const { userId, activeCollegeId } = session;
  const membership = await db.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('app.current_tenant_id', ${activeCollegeId}, true)`;
    await transaction.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
    return transaction.membership.findUnique({
      where: { collegeId_userId: { collegeId: activeCollegeId, userId } },
      include: { departmentAssignments: { select: { departmentCode: true } }, college: { select: { isActive: true } }, user: { select: { isActive: true } } }
    });
  });
  if (!membership || membership.status !== "ACTIVE" || !membership.college.isActive || !membership.user.isActive) {
    throw new AuthenticationError("An active college membership is required.");
  }
  const principal: Extract<Principal, { kind: "membership" }> = Object.freeze({
    kind: "membership",
    userId,
    collegeId: membership.collegeId,
    membershipId: membership.id,
    role: membership.role,
    status: "ACTIVE",
    assignedDepartments: Object.freeze(membership.departmentAssignments.map(({ departmentCode }) => departmentCode))
  });
  verifiedMembershipPrincipals.add(principal);
  return principal;
}

/** Tenant GUC is set transaction-locally on the same connection used by all work. */
export async function withTenantTransaction<T>(
  principal: Principal,
  work: (transaction: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  if (
    principal.kind !== "membership" || principal.status !== "ACTIVE" ||
    !verifiedMembershipPrincipals.has(principal)
  ) {
    throw new AuthorizationError("An active college membership is required for tenant data.");
  }
  return db.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('app.current_tenant_id', ${principal.collegeId}, true)`;
    await transaction.$executeRaw`SELECT set_config('app.current_user_id', ${principal.userId}, true)`;
    const membership = await transaction.membership.findUnique({
      where: { collegeId_userId: { collegeId: principal.collegeId, userId: principal.userId } },
      select: {
        id: true,
        role: true,
        status: true,
        college: { select: { isActive: true } },
        user: { select: { isActive: true } }
      }
    });
    if (
      !membership || membership.status !== "ACTIVE" || !membership.college.isActive ||
      !membership.user.isActive || membership.id !== principal.membershipId || membership.role !== principal.role
    ) {
      throw new AuthenticationError("An active college membership is required for tenant data.");
    }
    return work(transaction);
  });
}

export const supportedMembershipRoles = Object.values(MembershipRole);
