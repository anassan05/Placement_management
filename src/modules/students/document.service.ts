import { createHash, randomUUID } from "node:crypto";
import { extname } from "node:path";
import { StudentDocumentCategory, MembershipRole } from "@/generated/prisma/enums";
import { env } from "@/lib/env";
import { AuthorizationError } from "@/lib/errors";
import { requirePermission, type Principal } from "@/modules/authorization/permissions";
import { recordAuditEvent } from "@/modules/audit/audit.service";
import { withTenantTransaction } from "@/modules/tenancy/tenant-context";
import { deletePrivateDocument, readPrivateDocument, writePrivateDocument } from "./document-storage";

const allowedTypes = {
  pdf: { mime: "application/pdf", signature: (bytes: Uint8Array) => ascii(bytes, 0, 5) === "%PDF-" },
  png: { mime: "image/png", signature: (bytes: Uint8Array) => bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index]) },
  jpg: { mime: "image/jpeg", signature: (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff }
} as const;
const categories = Object.values(StudentDocumentCategory);
const maxNameLength = 180;

type DocumentAccess = { studentId: string; collegeId: string };

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function canWriteDocuments(principal: Principal): asserts principal is Extract<Principal, { kind: "membership" }> {
  if (principal.kind !== "membership") throw new AuthorizationError("College membership is required.");
  if (principal.role === MembershipRole.STUDENT) requirePermission(principal, "students:own:write");
  else requirePermission(principal, "students:write");
}

async function resolveAccess(principal: Principal, studentId: string, write: boolean): Promise<DocumentAccess> {
  if (principal.kind !== "membership") throw new AuthorizationError("College membership is required.");
  if (write) canWriteDocuments(principal);
  else if (principal.role === MembershipRole.STUDENT) requirePermission(principal, "students:own:read");
  else requirePermission(principal, "students:read");
  return withTenantTransaction(principal, async (tx) => {
    const student = await tx.studentProfile.findUnique({ where: { id: studentId }, select: { id: true, collegeId: true, departmentCode: true, membershipId: true } });
    if (!student) throw new AuthorizationError("Student not found.");
    if (principal.role === MembershipRole.STUDENT && student.membershipId !== principal.membershipId) {
      throw new AuthorizationError("You do not have access to this student.");
    }
    if (principal.role === MembershipRole.COORDINATOR && !principal.assignedDepartments.includes(student.departmentCode)) {
      throw new AuthorizationError("You do not have access to this student.");
    }
    return { studentId: student.id, collegeId: student.collegeId };
  });
}

function validateName(name: string): { originalName: string; extension: keyof typeof allowedTypes } {
  const originalName = name.trim().replace(/[\u0000-\u001f\u007f]/g, "").replace(/[\\/]/g, "_").slice(0, maxNameLength);
  const extension = extname(originalName).slice(1).toLowerCase() as keyof typeof allowedTypes;
  if (!originalName || !allowedTypes[extension]) throw new Error("Only PDF, PNG, and JPEG documents are supported.");
  return { originalName, extension };
}

async function validateFile(file: File): Promise<{ bytes: Uint8Array; originalName: string; extension: keyof typeof allowedTypes; mimeType: string; sha256: string }> {
  const { originalName, extension } = validateName(file.name);
  if (file.size <= 0 || file.size > env.STUDENT_DOCUMENT_MAX_BYTES) throw new Error("The document is empty or exceeds the configured size limit.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength !== file.size || bytes.byteLength > env.STUDENT_DOCUMENT_MAX_BYTES) {
    throw new Error("The uploaded document size is invalid.");
  }
  const type = allowedTypes[extension];
  if (file.type !== type.mime || !type.signature(bytes)) throw new Error("The file extension, MIME type, and file signature must match.");
  return { bytes, originalName, extension, mimeType: type.mime, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export async function listStudentDocuments(principal: Principal, studentId: string) {
  const access = await resolveAccess(principal, studentId, false);
  return withTenantTransaction(principal, (tx) => tx.studentDocument.findMany({
    where: { studentId: access.studentId },
    orderBy: { createdAt: "desc" },
    select: { id: true, category: true, originalName: true, mimeType: true, extension: true, sizeBytes: true, createdAt: true, updatedAt: true }
  }));
}

export async function uploadStudentDocument(principal: Principal, studentId: string, category: StudentDocumentCategory, file: File) {
  const access = await resolveAccess(principal, studentId, true);
  if (!categories.includes(category)) throw new Error("Unsupported document category.");
  const validated = await validateFile(file);
  const stored = await writePrivateDocument(validated.bytes, validated.extension);
  let previousKey: string | null = null;
  let documentId: string | null = null;
  try {
    await withTenantTransaction(principal, async (tx) => {
      const previous = await tx.studentDocument.findUnique({ where: { studentId_category: { studentId: access.studentId, category } }, select: { id: true, storageKey: true } });
      previousKey = previous?.storageKey ?? null;
      const document = await tx.studentDocument.upsert({
        where: { studentId_category: { studentId: access.studentId, category } },
        create: { id: randomUUID(), studentId: access.studentId, collegeId: access.collegeId, category, originalName: validated.originalName, storageKey: stored.storageKey, mimeType: validated.mimeType, extension: validated.extension, sizeBytes: validated.bytes.byteLength, sha256: validated.sha256, uploadedById: principal.userId },
        update: { originalName: validated.originalName, storageKey: stored.storageKey, mimeType: validated.mimeType, extension: validated.extension, sizeBytes: validated.bytes.byteLength, sha256: validated.sha256, uploadedById: principal.userId }
      });
      documentId = document.id;
      await recordAuditEvent(tx, principal, { action: previous ? "student_document.replaced" : "student_document.uploaded", entityType: "StudentDocument", entityId: document.id });
    });
  } catch (error) {
    await deletePrivateDocument(stored.storageKey).catch(() => undefined);
    throw error;
  }
  if (previousKey) await deletePrivateDocument(previousKey).catch(() => undefined);
  if (!documentId) throw new Error("Document metadata was not created.");
  return { id: documentId, storageKey: stored.storageKey };
}

export async function getStudentDocument(principal: Principal, studentId: string, documentId: string) {
  const access = await resolveAccess(principal, studentId, false);
  return withTenantTransaction(principal, async (tx) => {
    const document = await tx.studentDocument.findUnique({ where: { id: documentId }, select: { id: true, studentId: true, storageKey: true, originalName: true, mimeType: true, sizeBytes: true } });
    if (!document || document.studentId !== access.studentId) throw new AuthorizationError("Document not found.");
    await recordAuditEvent(tx, principal, { action: "student_document.downloaded", entityType: "StudentDocument", entityId: document.id });
    return { ...document, bytes: await readPrivateDocument(document.storageKey) };
  });
}

export async function deleteStudentDocument(principal: Principal, studentId: string, documentId: string) {
  const access = await resolveAccess(principal, studentId, true);
  let storageKey: string | null = null;
  await withTenantTransaction(principal, async (tx) => {
    const document = await tx.studentDocument.findUnique({ where: { id: documentId }, select: { id: true, studentId: true, storageKey: true } });
    if (!document || document.studentId !== access.studentId) throw new AuthorizationError("Document not found.");
    storageKey = document.storageKey;
    await tx.studentDocument.delete({ where: { id: document.id } });
    await recordAuditEvent(tx, principal, { action: "student_document.deleted", entityType: "StudentDocument", entityId: document.id });
  });
  if (storageKey) await deletePrivateDocument(storageKey).catch(() => undefined);
}
