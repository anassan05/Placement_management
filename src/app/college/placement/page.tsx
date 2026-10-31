import { redirect } from "next/navigation";
import { requireMembershipPage } from "@/modules/tenancy/page-auth";
import { withTenantTransaction } from "@/modules/tenancy/tenant-context";

export default async function PlacementWorkspace() {
  const principal = await requireMembershipPage();
  if (principal.role !== "PLACEMENT_OFFICER") redirect("/college/login");
  const college = await withTenantTransaction(principal, (tx) => tx.college.findUnique({ where: { id: principal.collegeId }, select: { name: true } }));
  return <main className="mx-auto max-w-4xl px-5 py-12"><h1 className="text-3xl font-bold">Placement Officer workspace</h1><p className="mt-2 text-slate-600">{college?.name}</p><section className="mt-6 rounded-xl border bg-white p-6"><h2 className="text-xl font-semibold">Placement operations</h2><p className="mt-2 text-slate-600">Your staff account is active. Placement drives and company tools will appear here when those modules are in scope.</p></section></main>;
}
