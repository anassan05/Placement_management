import Link from "next/link";
import { requireMembershipPage } from "@/modules/tenancy/page-auth";
import { requirePermission } from "@/modules/authorization/permissions";
import { listDepartments } from "@/modules/staff/staff.service";
import { InviteStudentForm } from "./form";

export default async function InviteStudentPage() {
  const principal = await requireMembershipPage();
  requirePermission(principal, "students:write");
  const departments = await listDepartments(principal);
  return <main className="mx-auto max-w-2xl px-5 py-10"><Link className="text-sm underline" href="/college/students">← Students</Link><h1 className="mt-4 text-3xl font-bold">Invite student</h1><p className="mt-2 text-slate-600">The one-time activation link expires in seven days. The student’s college, department, register number, and batch are fixed by this invitation.</p><InviteStudentForm departments={departments} /></main>;
}
