import Link from "next/link";
import { requireCollegeAdminPage } from "@/modules/tenancy/page-auth";
import { listDepartments } from "@/modules/staff/staff.service";
import { InviteStaffForm } from "../invite-form";

export default async function InviteStaffPage() {
  const principal = await requireCollegeAdminPage();
  const departments = await listDepartments(principal);
  return <main className="mx-auto max-w-2xl px-5 py-10"><Link className="text-sm underline" href="/college/staff">← Staff management</Link><h1 className="mt-4 text-3xl font-bold">Invite staff</h1><p className="mt-2 text-slate-600">Only Placement Officer and Coordinator invitations are available. Links are single-use and expire in seven days.</p><InviteStaffForm departments={departments} /></main>;
}
