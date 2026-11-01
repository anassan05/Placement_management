"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionCookieOptions } from "@/modules/authentication/session";
import { resolveMembershipPrincipal } from "@/modules/tenancy/tenant-context";
import { requireCollegeAdminPage } from "@/modules/tenancy/page-auth";
import { createDepartment, createStaffInvitation, revokeStaffInvitation, resendStaffInvitation, setCoordinatorDepartment, setDepartmentActive, setStaffMembershipActive, updateDepartment, acceptStaffInvitation } from "@/modules/staff/staff.service";
import { formString } from "@/modules/onboarding/validation";
import { staffAcceptanceSchema } from "@/modules/staff/validation";

const COOKIE = "cc_session";
export type StaffInvitationActionState = { invitationUrl?: string; error?: string };

export async function inviteStaffAction(_previous: { invitationUrl?: string; error?: string }, formData: FormData) {
  try {
    const principal = await requireCollegeAdminPage();
    const departmentIds = formData.getAll("departmentIds").filter((x): x is string => typeof x === "string");
    const result = await createStaffInvitation(principal, {
      fullName: formString(formData, "fullName"), email: formString(formData, "email"), role: formString(formData, "role"),
      departmentIds, message: formString(formData, "message")
    });
    return { invitationUrl: result.invitationUrl };
  } catch {
    return { error: "Invitation could not be created. Check the details, role, departments, and pending invitations." };
  }
}

export async function createDepartmentAction(formData: FormData) {
  const principal = await requireCollegeAdminPage();
  await createDepartment(principal, { name: formString(formData, "name"), shortCode: formString(formData, "shortCode"), description: formString(formData, "description") });
  redirect("/college/departments?created=1");
}

export async function updateDepartmentAction(formData: FormData) {
  const principal = await requireCollegeAdminPage();
  await updateDepartment(principal, formString(formData, "id"), { name: formString(formData, "name"), shortCode: formString(formData, "shortCode"), description: formString(formData, "description") });
  redirect(`/college/departments/${encodeURIComponent(formString(formData, "id"))}`);
}

export async function toggleDepartmentAction(formData: FormData) {
  const principal = await requireCollegeAdminPage();
  await setDepartmentActive(principal, formString(formData, "id"), formString(formData, "active") === "true");
  redirect("/college/departments");
}

export async function toggleStaffAction(formData: FormData) {
  const principal = await requireCollegeAdminPage();
  await setStaffMembershipActive(principal, formString(formData, "id"), formString(formData, "active") === "true");
  redirect("/college/staff");
}

export async function toggleAssignmentAction(formData: FormData) {
  const principal = await requireCollegeAdminPage();
  await setCoordinatorDepartment(principal, formString(formData, "membershipId"), formString(formData, "departmentId"), formString(formData, "assign") === "true");
  redirect(`/college/staff/${encodeURIComponent(formString(formData, "membershipId"))}`);
}

export async function revokeStaffInvitationAction(formData: FormData) {
  const principal = await requireCollegeAdminPage();
  await revokeStaffInvitation(principal, formString(formData, "id"));
  redirect("/college/staff/invitations");
}

export async function resendStaffInvitationAction(_previous: StaffInvitationActionState, formData: FormData): Promise<StaffInvitationActionState> {
  try {
    const principal = await requireCollegeAdminPage();
    return await resendStaffInvitation(principal, formString(formData, "id"));
  } catch {
    return { error: "Invitation could not be resent. It may no longer be pending, or an assigned department may be inactive." };
  }
}

export async function acceptStaffInvitationAction(token: string, _previous: { error?: string }, formData: FormData) {
  const parsed = staffAcceptanceSchema.safeParse({
    displayName: formString(formData, "displayName"),
    password: formString(formData, "password"),
    confirmPassword: formString(formData, "confirmPassword")
  });
  if (!parsed.success) return { error: "Enter your invited name and matching password (at least 12 characters)." };
  try {
    const session = await acceptStaffInvitation(token, parsed.data);
    (await cookies()).set(COOKIE, session.token, { ...getSessionCookieOptions(), expires: session.expiresAt });
    const principal = await resolveMembershipPrincipal(session.token);
    redirect(principal.role === "COORDINATOR" ? "/college/coordinator" : "/college/placement");
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { error: "This invitation could not be accepted. It may be expired, revoked, or already used." };
  }
}

function isRedirect(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT"));
}
