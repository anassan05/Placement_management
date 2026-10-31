import Link from "next/link";
import { createDepartmentAction, toggleDepartmentAction } from "@/app/actions/staff";
import { ConfirmForm } from "@/app/components/confirm-form";
import { requireCollegeAdminPage } from "@/modules/tenancy/page-auth";
import { listDepartments } from "@/modules/staff/staff.service";

export default async function DepartmentsPage() {
  const principal = await requireCollegeAdminPage();
  const departments = await listDepartments(principal);
  return <main className="mx-auto max-w-5xl px-5 py-10"><Link href="/college/staff" className="text-sm underline">← Staff management</Link><h1 className="mt-4 text-3xl font-bold">Departments</h1>
    <form action={createDepartmentAction} className="mt-6 grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-3"><label className="grid gap-1">Department name<input name="name" required maxLength={100} className="rounded border p-2" /></label><label className="grid gap-1">Short code<input name="shortCode" required maxLength={20} className="rounded border p-2" /></label><label className="grid gap-1">Description<input name="description" maxLength={500} className="rounded border p-2" /></label><button className="w-fit rounded bg-blue-950 px-4 py-2 text-white sm:col-span-3">Create department</button></form>
    <section className="mt-6 overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left"><thead className="bg-slate-100"><tr><th className="p-3">Department</th><th className="p-3">Short code</th><th className="p-3">Staff count</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead><tbody>{departments.map((d) => <tr key={d.id} className="border-t"><td className="p-3"><Link href={`/college/departments/${d.id}`} className="underline">{d.name}</Link></td><td className="p-3">{d.shortCode}</td><td className="p-3">{d._count.assignments}</td><td className="p-3">{d.isActive ? "Active" : "Inactive"}</td><td className="p-3"><ConfirmForm action={toggleDepartmentAction} fields={{ id: d.id, active: String(!d.isActive) }} question={`${d.isActive ? "Deactivate" : "Activate"} ${d.name}? Existing assignments and history are preserved.`} label={d.isActive ? "Deactivate" : "Activate"} /></td></tr>)}</tbody></table>{departments.length === 0 && <p className="p-5 text-slate-600">No departments yet.</p>}</section>
  </main>;
}
