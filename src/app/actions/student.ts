"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionCookieOptions } from "@/modules/authentication/session";
import { resolveMembershipPrincipal } from "@/modules/tenancy/tenant-context";
import { requireMembershipPage } from "@/modules/tenancy/page-auth";
import { formString } from "@/modules/onboarding/validation";
import { acceptStudentInvitation, createStudentInvitation } from "@/modules/students/student-invitation.service";
import { importStudentCsv, previewStudentImport, type StudentImportSummary } from "@/modules/students/csv-import.service";
import { studentAcceptanceSchema } from "@/modules/students/validation";
import { deleteStudentDocument, uploadStudentDocument } from "@/modules/students/document.service";
import { StudentDocumentCategory } from "@/generated/prisma/enums";

const COOKIE = "cc_session";

export async function inviteStudentAction(_previous: { invitationUrl?: string; error?: string }, formData: FormData) {
  try {
    const principal = await requireMembershipPage();
    const result = await createStudentInvitation(principal, {
      fullName: formString(formData, "fullName"),
      email: formString(formData, "email"),
      registerNumber: formString(formData, "registerNumber"),
      departmentId: formString(formData, "departmentId"),
      batchYear: formString(formData, "batchYear")
    });
    return { invitationUrl: result.invitationUrl };
  } catch {
    return { error: "Invitation could not be created. Check the student details, department, and duplicate records." };
  }
}

export async function acceptStudentInvitationAction(token: string, _previous: { error?: string }, formData: FormData) {
  const parsed = studentAcceptanceSchema.safeParse({
    displayName: formString(formData, "displayName"),
    password: formString(formData, "password"),
    confirmPassword: formString(formData, "confirmPassword")
  });
  if (!parsed.success) return { error: "Enter matching passwords of at least 12 characters." };
  try {
    const session = await acceptStudentInvitation(token, parsed.data);
    (await cookies()).set(COOKIE, session.token, { ...getSessionCookieOptions(), expires: session.expiresAt });
    const principal = await resolveMembershipPrincipal(session.token);
    if (principal.role !== "STUDENT") return { error: "The student account could not be activated." };
    redirect("/college/login?activated=1");
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { error: "This invitation could not be accepted. It may be expired, revoked, or already used." };
  }
}

export type StudentImportActionState = {
  csv?: string;
  preview?: Awaited<ReturnType<typeof previewStudentImport>>;
  summary?: StudentImportSummary;
  error?: string;
};

type DocumentActionState = { error?: string; success?: string };

export async function previewStudentImportAction(_previous: StudentImportActionState, formData: FormData): Promise<StudentImportActionState> {
  try {
    const principal = await requireMembershipPage();
    const file = formData.get("file");
    if (!(file instanceof File)) return { error: "Choose a CSV file." };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const csv = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return { csv, preview: await previewStudentImport(principal, bytes) };
  } catch {
    return { error: "The CSV could not be parsed or previewed." };
  }
}

export async function confirmStudentImportAction(_previous: StudentImportActionState, formData: FormData): Promise<StudentImportActionState> {
  try {
    const principal = await requireMembershipPage();
    const csv = formData.get("csv");
    if (typeof csv !== "string") return { error: "Upload and preview a CSV before confirming." };
    return { csv, summary: await importStudentCsv(principal, csv) };
  } catch {
    return { error: "The student import could not be completed." };
  }
}

export async function uploadStudentDocumentAction(_previous: DocumentActionState, formData: FormData): Promise<DocumentActionState> {
  try {
    const principal = await requireMembershipPage();
    if (formData.get("confirm") !== "on") return { error: "Confirm the upload before submitting." };
    const studentId = formData.get("studentId");
    const category = formData.get("category");
    const file = formData.get("file");
    if (typeof studentId !== "string" || typeof category !== "string" || !(file instanceof File)) {
      return { error: "Choose a document and category." };
    }
    if (!Object.values(StudentDocumentCategory).includes(category as StudentDocumentCategory)) {
      return { error: "Unsupported document category." };
    }
    await uploadStudentDocument(principal, studentId, category as StudentDocumentCategory, file);
    revalidatePath(`/college/students/${studentId}`);
    redirect(`/college/students/${studentId}`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { error: "The document could not be uploaded. Check its type, size, and access permissions." };
  }
}

export async function deleteStudentDocumentAction(_previous: { error?: string; success?: string }, formData: FormData): Promise<void> {
  try {
    const principal = await requireMembershipPage();
    const studentId = formData.get("studentId");
    const documentId = formData.get("documentId");
    if (typeof studentId !== "string" || typeof documentId !== "string") return;
    await deleteStudentDocument(principal, studentId, documentId);
    revalidatePath(`/college/students/${studentId}`);
  } catch {
    throw new Error("The document could not be deleted.");
  }
}

function isRedirect(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT"));
}
