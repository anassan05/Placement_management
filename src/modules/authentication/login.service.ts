import { createHash } from "node:crypto";
import { MembershipRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { AuthenticationError } from "@/lib/errors";
import { onboardingRateLimits } from "@/lib/postgres-rate-limit";
import { RateLimitError } from "@/lib/rate-limit";
import { createUserSession } from "./session-store";
import { verifyPassword } from "./session";

const genericFailure = () => new AuthenticationError("Email or password is incorrect.");
const dummySalt = Buffer.alloc(16).toString("base64url");
const dummyKey = Buffer.alloc(64).toString("base64url");
const dummyPasswordHash = `scrypt$32768$8$1$${dummySalt}$${dummyKey}`;

async function lookupAccount(email: string) {
  return db.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('app.auth_email', ${email}, true)`;
    return transaction.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true, displayName: true, isPlatformAdmin: true, isActive: true }
    });
  });
}

export async function authenticatePlatformAdmin(email: string, password: string) {
  await enforceLoginLimit(email);
  const user = await lookupAccount(email.trim().toLowerCase());
  const passwordMatches = await verifyPassword(password, user?.passwordHash ?? dummyPasswordHash);
  if (!user?.isActive || !user.isPlatformAdmin || !user.passwordHash || !passwordMatches) {
    throw genericFailure();
  }
  return createUserSession(user.id, null);
}

export async function authenticateCollegeAdmin(email: string, password: string) {
  await enforceLoginLimit(email);
  const user = await lookupAccount(email.trim().toLowerCase());
  const passwordMatches = await verifyPassword(password, user?.passwordHash ?? dummyPasswordHash);
  if (!user?.isActive || user.isPlatformAdmin || !user.passwordHash || !passwordMatches) {
    throw genericFailure();
  }
  const memberships = await db.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('app.current_user_id', ${user.id}, true)`;
    const rows = await transaction.membership.findMany({
      where: { userId: user.id, role: { in: [MembershipRole.COLLEGE_ADMIN, MembershipRole.PLACEMENT_OFFICER, MembershipRole.COORDINATOR] }, status: "ACTIVE" },
      select: { collegeId: true }, take: 20
    });
    const active: string[] = [];
    for (const row of rows) {
      await transaction.$executeRaw`SELECT set_config('app.current_tenant_id', ${row.collegeId}, true)`;
      const college = await transaction.college.findUnique({ where: { id: row.collegeId }, select: { isActive: true } });
      if (college?.isActive) active.push(row.collegeId);
    }
    return active;
  });
  if (!memberships.length) throw genericFailure();
  if (memberships.length === 1) return { ...(await createUserSession(user.id, memberships[0])), selectionRequired: false };
  return { ...(await createUserSession(user.id, null)), selectionRequired: true };
}

async function enforceLoginLimit(email: string) {
  const digest = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
  const decision = await onboardingRateLimits.consume(`login:${digest}`, 10, 15 * 60);
  if (!decision.allowed) throw new RateLimitError(decision.retryAfterSeconds);
}
