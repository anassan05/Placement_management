import Link from "next/link";
import { withTenantTransaction } from "@/modules/tenancy/tenant-context";
import { requireCollegeAdminPage } from "@/modules/tenancy/page-auth";

export default async function CollegeProfile() {
  const principal = await requireCollegeAdminPage();
  const college = await withTenantTransaction(principal, (transaction) => transaction.college.findUnique({
    where: { id: principal.collegeId }, select: { name: true, shortName: true, code: true, contactEmail: true, contactPhone: true, websiteUrl: true, state: true, district: true, address: true }
  }));
  return <main className="mx-auto max-w-3xl px-5 py-10"><Link href="/college/dashboard">← Dashboard</Link><h1 className="mt-4 text-3xl font-bold">College profile</h1><dl className="mt-5 grid gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2">{Object.entries(college ?? {}).map(([key, value]) => <div key={key}><dt className="text-sm text-slate-500">{key}</dt><dd>{value ?? "—"}</dd></div>)}</dl></main>;
}
