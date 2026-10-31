import { redirect } from "next/navigation";
import { requireMembershipPage } from "@/modules/tenancy/page-auth";
import { listDepartments } from "@/modules/staff/staff.service";

export default async function CoordinatorWorkspace() {
  const principal = await requireMembershipPage();
  if (principal.role !== "COORDINATOR") redirect("/college/login");
  const departments = await listDepartments(principal);
  return <main className="mx-auto max-w-4xl px-5 py-12"><h1 className="text-3xl font-bold">Coordinator workspace</h1><p className="mt-2 text-slate-600">Only departments explicitly assigned to you are shown here.</p><section className="mt-6 grid gap-4 sm:grid-cols-2">{departments.map((department) => <article key={department.id} className="rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">{department.name}</h2><p className="text-slate-600">{department.shortCode}</p></article>)}</section>{departments.length === 0 && <p className="mt-6 rounded border bg-white p-5">No active department assignments are available.</p>}</main>;
}
