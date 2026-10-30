import Link from "next/link";
import { toggleCollegeAction } from "@/app/actions/onboarding";
import { listApprovedColleges } from "@/modules/onboarding/platform.service";
import { requirePlatformPage } from "@/modules/tenancy/page-auth";

export default async function CollegesPage() {
  const principal = await requirePlatformPage();
  const colleges = await listApprovedColleges(principal);
  return <main className="mx-auto max-w-5xl px-5 py-10"><Link href="/platform/dashboard">← Dashboard</Link><h1 className="mt-4 text-3xl font-bold">Colleges</h1><div className="mt-5 divide-y rounded-xl border bg-white">{colleges.map((college) => <article key={college.id} className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center"><div><strong>{college.name}</strong><p className="text-sm text-slate-600">{college.code} · {college.onboardingState} · {college.isActive ? "Active" : "Inactive"}</p><p className="text-xs text-slate-500">{college.administrators.map((admin) => `${admin.displayName} (${admin.email})`).join(", ") || "No administrator membership"}</p></div><form action={toggleCollegeAction}><input type="hidden" name="id" value={college.id} /><input type="hidden" name="active" value={String(!college.isActive)} /><button className="rounded border px-3 py-2">{college.isActive ? "Suspend" : "Reactivate"}</button></form></article>)}</div></main>;
}
