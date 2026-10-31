import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { createSessionToken, hashSessionToken } from "./session";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Returns the bearer token once; only its SHA-256 hash is persisted. */
export async function createUserSession(userId: string, activeCollegeId: string | null = null): Promise<{ token: string; expiresAt: Date }> {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.$transaction((transaction) => createUserSessionInTransaction(transaction, userId, activeCollegeId, token, expiresAt));
  return { token, expiresAt };
}

/** Creates a session inside an existing onboarding transaction. */
export async function createUserSessionInTransaction(
  transaction: Prisma.TransactionClient,
  userId: string,
  activeCollegeId: string | null,
  token = createSessionToken(),
  expiresAt = new Date(Date.now() + SESSION_TTL_MS)
): Promise<{ token: string; expiresAt: Date }> {
  if (activeCollegeId) {
    await transaction.$executeRaw`SELECT set_config('app.current_tenant_id', ${activeCollegeId}, true)`;
    await transaction.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
    const membership = await transaction.membership.findUnique({
      where: { collegeId_userId: { collegeId: activeCollegeId, userId } },
      select: { status: true, college: { select: { isActive: true } }, user: { select: { isActive: true } } }
    });
    if (!membership || membership.status !== "ACTIVE" || !membership.college.isActive || !membership.user.isActive) {
      throw new Error("An active college membership is required for this session.");
    }
  }
  const tokenHash = hashSessionToken(token);
  await transaction.$executeRaw`SELECT set_config('app.current_session_hash', ${tokenHash}, true)`;
  await transaction.$executeRaw`INSERT INTO "Session" (id, "userId", "activeCollegeId", "tokenHash", "expiresAt")
    VALUES (${randomUUID()}::uuid, ${userId}::uuid, ${activeCollegeId}::uuid, ${tokenHash}, ${expiresAt})`;
  return { token, expiresAt };
}

/** Expired, deleted/revoked, and inactive-user sessions all resolve to null. */
export async function resolveSessionContext(token: string, now = new Date()): Promise<{ userId: string; activeCollegeId: string | null } | null> {
  const tokenHash = hashSessionToken(token);
  const session = await db.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('app.current_session_hash', ${tokenHash}, true)`;
    return transaction.session.findUnique({
      where: { tokenHash },
      select: { expiresAt: true, activeCollegeId: true, user: { select: { id: true, isActive: true } } }
    });
  });
  if (!session || session.expiresAt <= now || !session.user.isActive) return null;
  return { userId: session.user.id, activeCollegeId: session.activeCollegeId };
}

export async function resolveSessionUser(token: string, now = new Date()): Promise<string | null> {
  return (await resolveSessionContext(token, now))?.userId ?? null;
}

/** Lists only the current session owner's active College Admin memberships. */
export async function listSessionCollegeChoices(token: string): Promise<Array<{ id: string; name: string }>> {
  const tokenHash = hashSessionToken(token);
  return db.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('app.current_session_hash', ${tokenHash}, true)`;
    const session = await transaction.session.findUnique({
      where: { tokenHash }, select: { userId: true, expiresAt: true, user: { select: { isActive: true } } }
    });
    if (!session || session.expiresAt <= new Date() || !session.user.isActive) return [];
    await transaction.$executeRaw`SELECT set_config('app.current_user_id', ${session.userId}, true)`;
    const memberships = await transaction.membership.findMany({
      where: { userId: session.userId, role: { in: ["COLLEGE_ADMIN", "PLACEMENT_OFFICER", "COORDINATOR"] }, status: "ACTIVE" },
      select: { collegeId: true }, take: 20
    });
    const choices: Array<{ id: string; name: string }> = [];
    for (const membership of memberships) {
      await transaction.$executeRaw`SELECT set_config('app.current_tenant_id', ${membership.collegeId}, true)`;
      const college = await transaction.college.findUnique({ where: { id: membership.collegeId }, select: { id: true, name: true, isActive: true } });
      if (college?.isActive) choices.push({ id: college.id, name: college.name });
    }
    return choices;
  });
}

/** A browser-selected college becomes trusted only after the session owner has an active membership. */
export async function setSessionActiveCollege(token: string, collegeId: string): Promise<void> {
  const tokenHash = hashSessionToken(token);
  await db.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('app.current_session_hash', ${tokenHash}, true)`;
    const session = await transaction.session.findUnique({
      where: { tokenHash }, select: { id: true, userId: true, expiresAt: true, user: { select: { isActive: true } } }
    });
    if (!session || session.expiresAt <= new Date() || !session.user.isActive) {
      throw new Error("A valid active session is required.");
    }
    await transaction.$executeRaw`SELECT set_config('app.current_tenant_id', ${collegeId}, true)`;
    await transaction.$executeRaw`SELECT set_config('app.current_user_id', ${session.userId}, true)`;
    const membership = await transaction.membership.findUnique({
      where: { collegeId_userId: { collegeId, userId: session.userId } },
      select: { status: true, college: { select: { isActive: true } } }
    });
    if (!membership || membership.status !== "ACTIVE" || !membership.college.isActive) {
      throw new Error("An active college membership is required for this session.");
    }
    await transaction.$executeRaw`UPDATE "Session" SET "activeCollegeId" = ${collegeId}::uuid WHERE id = ${session.id}::uuid`;
  });
}

/** Revocation removes the only server-side lookup for this opaque bearer token. */
export async function revokeUserSession(token: string): Promise<boolean> {
  const tokenHash = hashSessionToken(token);
  return db.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('app.current_session_hash', ${tokenHash}, true)`;
    const result = await transaction.session.deleteMany({ where: { tokenHash } });
    return result.count === 1;
  });
}
