import Link from "next/link";
import { getPlatformOverview } from "@/modules/onboarding/platform.service";
import { requirePlatformPage } from "@/modules/tenancy/page-auth";
import { logoutAction } from "@/app/actions/onboarding";

export default async function PlatformDashboard() {
  const principal = await requirePlatformPage();
  const data = await getPlatformOverview(principal);
  return <main className="mx-auto max-w-5xl px-5 py-10"><header className="flex items-center justify-between"><h1 className="text-3xl font-bold">Platform dashboard</h1><form action={logoutAction}><button className="text-sm underline">Sign out</button></form></header><nav className="mt-5 flex gap-5"><Link href="/platform/applications">Applications</Link><Link href="/platform/colleges">Colleges</Link><Link href="/platform/invitations">Invitations</Link></nav><section className="mt-8 grid gap-3 sm:grid-cols-3">{Object.entries({ "Pending applications": data.pendingApplications, "Approved applications": data.approvedApplications, "Active colleges": data.activeColleges, "Pending invitations": data.pendingInvitations }).map(([label, value]) => <article key={label} className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></article>)}</section></main>;
}
