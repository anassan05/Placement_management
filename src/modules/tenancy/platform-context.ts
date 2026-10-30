import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { AuthenticationError, AuthorizationError } from "@/lib/errors";
import type { Principal } from "@/modules/authorization/permissions";
import { hashSessionToken } from "@/modules/authentication/session";
import { resolveSessionContext } from "@/modules/authentication/session-store";

const verifiedPlatformPrincipals = new WeakSet<object>();

export async function resolvePlatformPrincipal(sessionToken: string): Promise<Extract<Principal, { kind: "platform_admin" }>> {
  const session = await resolveSessionContext(sessionToken);
  if (!session || session.activeCollegeId !== null) throw new AuthenticationError("An active platform session is required.");
  const principal = await db.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('app.current_session_hash', ${hashSessionToken(sessionToken)}, true)`;
    await transaction.$executeRaw`SELECT set_config('app.current_user_id', ${session.userId}, true)`;
    const user = await transaction.user.findUnique({
      where: { id: session.userId },
      select: { isActive: true, isPlatformAdmin: true }
    });
    if (!user?.isActive || !user.isPlatformAdmin) return null;
    return Object.freeze({ kind: "platform_admin" as const, userId: session.userId, active: true });
  });
  if (!principal) throw new AuthorizationError("Platform administrator access is required.");
  verifiedPlatformPrincipals.add(principal);
  return principal;
}

export async function withPlatformTransaction<T>(
  principal: Extract<Principal, { kind: "platform_admin" }>,
  work: (transaction: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  if (!principal.active || !verifiedPlatformPrincipals.has(principal)) {
    throw new AuthorizationError("Platform administrator access is required.");
  }
  return db.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('app.is_platform_admin', 'true', true)`;
    await transaction.$executeRaw`SELECT set_config('app.current_user_id', ${principal.userId}, true)`;
    const user = await transaction.user.findUnique({
      where: { id: principal.userId },
      select: { isActive: true, isPlatformAdmin: true }
    });
    if (!user?.isActive || !user.isPlatformAdmin) throw new AuthenticationError("Platform administrator access is required.");
    return work(transaction);
  });
}
