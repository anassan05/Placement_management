"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionCookieOptions } from "@/modules/authentication/session";
import { authenticateCollegeAdmin, authenticatePlatformAdmin } from "@/modules/authentication/login.service";
import { revokeUserSession, setSessionActiveCollege } from "@/modules/authentication/session-store";
import { resolvePlatformPrincipal } from "@/modules/tenancy/platform-context";
import { submitCollegeApplication } from "@/modules/onboarding/application.service";
import { acceptCollegeAdminInvitation } from "@/modules/onboarding/invitation.service";
import { approveCollegeApplication, rejectCollegeApplication, revokeCollegeInvitation, setCollegeActivation } from "@/modules/onboarding/platform.service";
import { collegeApplicationSchema, formString, invitationAcceptanceSchema } from "@/modules/onboarding/validation";

const cookieName = "cc_session";
const applyCookie = async (session: { token: string; expiresAt: Date }) => {
  (await cookies()).set(cookieName, session.token, { ...getSessionCookieOptions(), expires: session.expiresAt });
};

export async function applyCollegeAction(formData: FormData) {
  const parsed = collegeApplicationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/apply-college?error=invalid");
  try {
    const reference = await submitCollegeApplication(parsed.data);
    redirect(`/apply-college?submitted=${encodeURIComponent(reference)}`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    redirect(`/apply-college?error=submit`);
  }
}

export async function platformLoginAction(formData: FormData) {
  try {
    const session = await authenticatePlatformAdmin(formString(formData, "email"), formString(formData, "password"));
    await applyCookie(session);
    redirect("/platform/dashboard");
  } catch (error) {
    if (isRedirect(error)) throw error;
    redirect("/platform/login?error=1");
  }
}

export async function collegeLoginAction(formData: FormData) {
  try {
    const session = await authenticateCollegeAdmin(formString(formData, "email"), formString(formData, "password"));
    await applyCookie(session);
    redirect(session.selectionRequired ? "/college/select-college" : "/college/dashboard");
  } catch (error) {
    if (isRedirect(error)) throw error;
    redirect("/college/login?error=1");
  }
}

export async function selectCollegeAction(formData: FormData) {
  const store = await cookies();
  const token = store.get(cookieName)?.value;
  if (!token) redirect("/college/login");
  try {
    await setSessionActiveCollege(token, formString(formData, "collegeId"));
    redirect("/college/dashboard");
  } catch (error) {
    if (isRedirect(error)) throw error;
    redirect("/college/select-college?error=1");
  }
}

export async function logoutAction() {
  const store = await cookies();
  const token = store.get(cookieName)?.value;
  if (token) await revokeUserSession(token);
  store.delete(cookieName);
  redirect("/");
}

export async function acceptInvitationAction(token: string, _previous: { error?: string }, formData: FormData) {
  const parsed = invitationAcceptanceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a valid name, invited email, and password of at least 12 characters." };
  try {
    const session = await acceptCollegeAdminInvitation(token, parsed.data);
    await applyCookie(session);
    redirect("/college/dashboard");
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { error: "The invitation could not be accepted. Check the invitation, email, and account password." };
  }
}

export async function approveApplicationAction(_previous: { invitationUrl?: string; error?: string }, formData: FormData) {
  const id = formString(formData, "id");
  try {
    const principal = await platformPrincipal();
    const result = await approveCollegeApplication(principal, id);
    return { invitationUrl: result.invitationUrl };
  } catch {
    return { error: "Approval failed. The application may no longer be pending." };
  }
}

export async function rejectApplicationAction(formData: FormData) {
  const principal = await platformPrincipal();
  await rejectCollegeApplication(principal, formString(formData, "id"), formString(formData, "reason"));
  redirect("/platform/applications");
}

export async function revokeInvitationAction(formData: FormData) {
  const principal = await platformPrincipal();
  await revokeCollegeInvitation(principal, formString(formData, "id"));
  redirect("/platform/invitations");
}

export async function toggleCollegeAction(formData: FormData) {
  const principal = await platformPrincipal();
  await setCollegeActivation(principal, formString(formData, "id"), formString(formData, "active") === "true");
  redirect("/platform/colleges");
}

async function platformPrincipal() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) redirect("/platform/login");
  try { return await resolvePlatformPrincipal(token); }
  catch { redirect("/platform/login"); }
}

function isRedirect(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT"));
}
