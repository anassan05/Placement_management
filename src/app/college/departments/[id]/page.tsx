import { notFound } from "next/navigation";
import Link from "next/link";
import { updateDepartmentAction } from "@/app/actions/staff";
import { requireCollegeAdminPage } from "@/modules/tenancy/page-auth";
import { withTenantTransaction } from "@/modules/tenancy/tenant-context";

export default async function DepartmentDetails({ params }: { params: Promise<{ id: string }> }) {
  const principal = await requireCollegeAdminPage();
  const { id } = await params;
  const department = await withTenantTransaction(principal, async (tx) => tx.department.findUnique({ where: { id }, select: {
    id: true, name: true, shortCode: true, description: true, isActive: true,
    assignments: { where: { membership: { role: "COORDINATOR" } }, select: { membership: { select: { id: true, status: true, user: { select: { displayName: true, email: true } } } } } }
  } }));
  if (!department) notFound();
  return <main className="mx-auto max-w-3xl px-5 py-10"><Link href="/college/departments" className="text-sm underline">← Departments</Link><h1 className="mt-4 text-3xl font-bold">{department.name}</h1><p className="mt-1 text-slate-600">{department.isActive ? "Active" : "Inactive"} · {department.assignments.length} Coordinator assignments</p>
    <form action={updateDepartmentAction} className="mt-6 grid gap-4 rounded-xl border bg-white p-6"><input type="hidden" name="id" value={id} /><label className="grid gap-1">Name<input name="name" defaultValue={department.name} required maxLength={100} className="rounded border p-2" /></label><label className="grid gap-1">Short code<input name="shortCode" defaultValue={department.shortCode} required maxLength={20} className="rounded border p-2" /></label><label className="grid gap-1">Description<textarea name="description" defaultValue={department.description ?? ""} maxLength={500} className="rounded border p-2" /></label><button className="w-fit rounded bg-blue-950 px-4 py-2 text-white">Save department</button></form>
    <section className="mt-6 rounded-xl border bg-white p-5"><h2 className="text-xl font-semibold">Assigned Coordinators</h2>{department.assignments.length ? <ul className="mt-3 divide-y">{department.assignments.map(({ membership }) => <li key={membership.id} className="py-3">{membership.user.displayName} · {membership.user.email} · {membership.status}</li>)}</ul> : <p className="mt-2 text-slate-600">No Coordinators assigned yet. Assign from a staff profile.</p>}</section>
  </main>;
}
