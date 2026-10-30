import type { Prisma } from "@/generated/prisma/client";
import type { Principal } from "@/modules/authorization/permissions";
import { AuthorizationError } from "@/lib/errors";

/** Call inside withTenantTransaction; caller-supplied tenant IDs and arbitrary metadata are not accepted. */
export async function recordAuditEvent(
  transaction: Prisma.TransactionClient,
  principal: Principal,
  event: { action: string; entityType: string; entityId?: string }
): Promise<void> {
  if (principal.kind !== "membership" || principal.status !== "ACTIVE") {
    throw new AuthorizationError("An active college membership is required to write tenant audit events.");
  }
  if (!event.action.trim() || event.action.length > 100 || !event.entityType.trim() || event.entityType.length > 100) {
    throw new Error("Audit action and entity type must be between 1 and 100 characters.");
  }
  await transaction.auditLog.create({
    data: {
      collegeId: principal.collegeId,
      actorUserId: principal.userId,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId
    }
  });
}
