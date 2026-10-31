import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolvePlatformPrincipal } from "./platform-context";
import { resolveMembershipPrincipal } from "./tenant-context";

const COOKIE = "cc_session";

export async function requirePlatformPage() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) redirect("/platform/login");
  try { return await resolvePlatformPrincipal(token); }
  catch { redirect("/platform/login"); }
}

export async function requireCollegeAdminPage() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) redirect("/college/login");
  try {
    const principal = await resolveMembershipPrincipal(token);
    if (principal.role !== "COLLEGE_ADMIN") redirect("/college/login");
    return principal;
  } catch { redirect("/college/login"); }
}

export async function requireMembershipPage() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) redirect("/college/login");
  try { return await resolveMembershipPrincipal(token); }
  catch { redirect("/college/login"); }
}
