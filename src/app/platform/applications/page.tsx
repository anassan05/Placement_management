import Link from "next/link";
import { CollegeApplicationStatus } from "@/generated/prisma/enums";
import { listCollegeApplications } from "@/modules/onboarding/platform.service";
import { requirePlatformPage } from "@/modules/tenancy/page-auth";

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const principal = await requirePlatformPage();
  const { status, q } = await searchParams;
  const valid = Object.values(CollegeApplicationStatus).includes(status as CollegeApplicationStatus) ? status as CollegeApplicationStatus : undefined;
  const applications = await listCollegeApplications(principal, { status: valid, query: q });
  return <main className="mx-auto max-w-5xl px-5 py-10"><Link href="/platform/dashboard">← Dashboard</Link><h1 className="mt-4 text-3xl font-bold">College applications</h1><form className="mt-4 flex gap-2"><input name="q" defaultValue={q} placeholder="Search college, administrator, reference" className="min-w-0 flex-1 rounded border bg-white p-2" /><button className="rounded bg-blue-950 px-4 text-white">Search</button></form><nav className="mt-4 flex flex-wrap gap-3"><Link href="?">All</Link>{Object.values(CollegeApplicationStatus).map((value) => <Link key={value} href={`?status=${value}`}>{value}</Link>)}</nav><div className="mt-5 divide-y rounded-xl border bg-white">{applications.map((application) => <Link key={application.id} href={`/platform/applications/${application.id}`} className="block p-4 hover:bg-slate-50"><div className="flex justify-between gap-4"><strong>{application.collegeName}</strong><span>{application.status}</span></div><p className="mt-1 text-sm text-slate-600">{application.administratorName} · {application.administratorEmail} · {application.applicationRef}</p></Link>)}{applications.length === 0 && <p className="p-5 text-slate-600">No applications found.</p>}</div></main>;
}
