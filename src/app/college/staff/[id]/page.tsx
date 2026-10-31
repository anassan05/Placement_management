import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmForm } from "@/app/components/confirm-form";
import { toggleAssignmentAction, toggleStaffAction } from "@/app/actions/staff";
import { requireCollegeAdminPage } from "@/modules/tenancy/page-auth";
import { withTenantTransaction } from "@/modules/tenancy/tenant-context";

export default async function StaffDetails({ params }: { params: Promise<{ id: string }> }) {
  const principal = await requireCollegeAdminPage();
  const { id } = await params;
  const data = await withTenantTransaction(principal, async (tx) => {
    const membership = await tx.membership.findUnique({ where: { id }, select: { id: true, role: true, status: true, createdAt: true, user: { select: { displayName: true, email: true } }, departmentAssignments: { select: { departmentId: true } } } });
    if (!membership || !["PLACEMENT_OFFICER", "COORDINATOR"].includes(membership.role)) return null;
    const departments = await tx.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, shortCode: true, isActive: true } });
    return { membership, departments };
  });
  if (!data) notFound();
  const { membership, departments } = data;
  const assigned = new Set(membership.departmentAssignments.map((x) => x.departmentId));
  return <main className="mx-auto max-w-3xl px-5 py-10"><Link href="/college/staff" className="text-sm underline">← Staff management</Link><h1 className="mt-4 text-3xl font-bold">{membership.user.displayName}</h1><p className="mt-1 text-slate-600">{membership.user.email} · {membership.role === "PLACEMENT_OFFICER" ? "Placement Officer" : "Coordinator"} · {membership.status}</p><p className="mt-1 text-sm text-slate-500">Joined {membership.createdAt.toLocaleDateString()}</p>
    <div className="mt-5"><ConfirmForm action={toggleStaffAction} fields={{ id, active: String(membership.status !== "ACTIVE") }} question={membership.status === "ACTIVE" ? "Deactivate this staff membership?" : "Reactivate this staff membership?"} label={membership.status === "ACTIVE" ? "Deactivate membership" : "Reactivate membership"} /></div>
    {membership.role === "COORDINATOR" && <section className="mt-7 rounded-xl border bg-white p-5"><h2 className="text-xl font-semibold">Department assignments</h2><ul className="mt-3 divide-y">{departments.map((department) => <li key={department.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><span>{department.name} ({department.shortCode}){!department.isActive && " · inactive"}</span><ConfirmForm action={toggleAssignmentAction} fields={{ membershipId: id, departmentId: department.id, assign: String(!assigned.has(department.id)) }} question={`${assigned.has(department.id) ? "Remove" : "Assign"} ${membership.user.displayName} ${assigned.has(department.id) ? "from" : "to"} ${department.name}?`} label={assigned.has(department.id) ? "Remove assignment" : department.isActive ? "Assign" : "Inactive"} /></li>)}</ul></section>}
  </main>;
}
