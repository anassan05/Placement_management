import Link from "next/link";
import { logoutAction } from "@/app/actions/onboarding";
import { withTenantTransaction } from "@/modules/tenancy/tenant-context";
import { requireCollegeAdminPage } from "@/modules/tenancy/page-auth";

export default async function CollegeDashboard() {
  const principal = await requireCollegeAdminPage();
  const college = await withTenantTransaction(principal, (transaction) => transaction.college.findUnique({
    where: { id: principal.collegeId }, select: { name: true, onboardingState: true }
  }));
  if (!college) return <main className="p-8">College unavailable.</main>;
  const memberCount = await withTenantTransaction(principal, (transaction) => transaction.membership.count({ where: { status: "ACTIVE" } }));
  const { membership, activity } = await withTenantTransaction(principal, async (transaction) => {
    const membership = await transaction.membership.findUnique({ where: { id: principal.membershipId }, select: { role: true, status: true, user: { select: { displayName: true, email: true } } } });
    const activity = await transaction.auditLog.findMany({ where: { collegeId: principal.collegeId }, orderBy: { createdAt: "desc" }, take: 5, select: { action: true, entityType: true, createdAt: true } });
    return { membership, activity };
  });
  return <main className="mx-auto max-w-5xl px-5 py-10"><header className="flex items-center justify-between"><div><h1 className="text-3xl font-bold">{college.name}</h1><p className="text-slate-600">College administrator workspace</p></div><form action={logoutAction}><button className="underline">Sign out</button></form></header><section className="mt-8 grid gap-5 md:grid-cols-2"><article className="rounded-xl border bg-white p-6"><h2 className="text-xl font-semibold">College profile</h2><p className="mt-2 text-slate-600">Onboarding: {college.onboardingState}</p><p className="mt-1 text-slate-600">Active members: {memberCount}</p><Link className="mt-4 inline-block text-blue-800 underline" href="/college/profile">View profile</Link></article><article className="rounded-xl border bg-white p-6"><h2 className="text-xl font-semibold">Administrator</h2><p className="mt-2">{membership?.user.displayName}</p><p className="text-sm text-slate-600">{membership?.user.email}</p><p className="mt-2 text-sm">{membership?.role} · {membership?.status}</p></article></section><section className="mt-8 rounded-xl border bg-white p-6"><h2 className="text-xl font-semibold">Recent administrative activity</h2>{activity.length ? <ul className="mt-3 divide-y">{activity.map((event) => <li key={`${event.action}-${event.createdAt.toISOString()}`} className="py-3"><strong>{event.action}</strong><span className="ml-2 text-sm text-slate-500">{event.entityType} · {event.createdAt.toLocaleString()}</span></li>)}</ul> : <p className="mt-2 text-slate-600">No activity has been recorded yet.</p>}</section></main>;
}
