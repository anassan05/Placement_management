import Link from "next/link";
import { requireCollegeAdminPage } from "@/modules/tenancy/page-auth";
import { listStaff } from "@/modules/staff/staff.service";
import { toggleStaffAction } from "@/app/actions/staff";
import { ConfirmForm } from "@/app/components/confirm-form";
import { listDepartments } from "@/modules/staff/staff.service";

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; department?: string; status?: string }> }) {
  const principal = await requireCollegeAdminPage();
  const [{ memberships, invitations }, departments, filters] = await Promise.all([listStaff(principal), listDepartments(principal), searchParams]);
  const active = memberships.filter((m) => m.status === "ACTIVE").length;
  const pending = invitations.filter((i) => !i.acceptedAt && !i.revokedAt && i.expiresAt > new Date()).length;
  const cards = [["Total staff", memberships.length], ["Active staff", active], ["Placement Officers", memberships.filter((m) => m.role === "PLACEMENT_OFFICER").length], ["Coordinators", memberships.filter((m) => m.role === "COORDINATOR").length], ["Pending invitations", pending], ["Inactive staff", memberships.length - active]];
  const staffRows = memberships.map((membership) => {
    const invitation = invitations.find((item) => item.acceptedByUserId === membership.userId && item.acceptedAt);
    return {
      ...membership,
      displayName: invitation?.fullName ?? membership.user?.displayName ?? "Staff member",
      email: invitation?.email ?? membership.user?.email ?? ""
    };
  });
  const visibleStaff = staffRows.filter((m) =>
    (!filters.q || `${m.displayName} ${m.email}`.toLowerCase().includes(filters.q.toLowerCase())) &&
    (!filters.role || m.role === filters.role) &&
    (!filters.department || m.departmentAssignments.some((a) => a.department.id === filters.department)) &&
    (!filters.status || (filters.status === "active" ? m.status === "ACTIVE" : m.status !== "ACTIVE"))
  );
  return <main className="mx-auto max-w-6xl px-5 py-10"><header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-bold">Staff management</h1><p className="mt-1 text-slate-600">Manage placement staff and department access for this college.</p></div><nav className="flex gap-4"><Link className="underline" href="/college/staff/invite">Invite staff</Link><Link className="underline" href="/college/staff/invitations">Invitations</Link><Link className="underline" href="/college/departments">Departments</Link></nav></header>
    <section className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{cards.map(([label, count]) => <article key={label} className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-600">{label}</p><p className="mt-1 text-2xl font-bold">{count}</p></article>)}</section>
    <form method="get" className="mt-7 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4"><label className="grid gap-1 text-sm">Search<input name="q" defaultValue={filters.q} placeholder="Name or email" className="rounded border p-2" /></label><label className="grid gap-1 text-sm">Role<select name="role" defaultValue={filters.role ?? ""} className="rounded border p-2"><option value="">All roles</option><option value="PLACEMENT_OFFICER">Placement Officer</option><option value="COORDINATOR">Coordinator</option></select></label><label className="grid gap-1 text-sm">Department<select name="department" defaultValue={filters.department ?? ""} className="rounded border p-2"><option value="">All departments</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label className="grid gap-1 text-sm">Status<select name="status" defaultValue={filters.status ?? ""} className="rounded border p-2"><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label><button className="rounded border px-4 py-2">Filter</button></form>
    <section className="mt-4 overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-100"><tr>{["Staff name", "Email", "Role", "Department(s)", "Account status", "Invitation status", "Joined", "Actions"].map((x) => <th key={x} className="p-3">{x}</th>)}</tr></thead><tbody>{visibleStaff.map((m) => { const accepted = invitations.some((i) => i.email === m.email && i.acceptedAt); return <tr key={m.id} className="border-t"><td className="p-3"><Link className="font-medium underline" href={`/college/staff/${m.id}`}>{m.displayName}</Link></td><td className="p-3">{m.email}</td><td className="p-3">{m.role === "PLACEMENT_OFFICER" ? "Placement Officer" : "Coordinator"}</td><td className="p-3">{m.departmentAssignments.map((x) => x.department.shortCode).join(", ") || "—"}</td><td className="p-3">{m.status === "ACTIVE" ? "Active" : "Inactive"}</td><td className="p-3">{accepted ? "Accepted" : "—"}</td><td className="p-3">{m.createdAt.toLocaleDateString()}</td><td className="p-3"><ConfirmForm action={toggleStaffAction} fields={{ id: m.id, active: String(m.status !== "ACTIVE") }} question={m.status === "ACTIVE" ? "Deactivate this staff membership?" : "Reactivate this staff membership?"} label={m.status === "ACTIVE" ? "Deactivate" : "Reactivate"} /></td></tr>; })}</tbody></table>{memberships.length === 0 && <p className="p-6 text-slate-600">No staff memberships yet. Create an invitation to get started.</p>}{memberships.length > 0 && visibleStaff.length === 0 && <p className="p-6 text-slate-600">No staff match these filters.</p>}</section>
  </main>;
}
