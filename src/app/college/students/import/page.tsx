import Link from "next/link";
import { requireMembershipPage } from "@/modules/tenancy/page-auth";
import { requirePermission } from "@/modules/authorization/permissions";
import { StudentImportForm } from "./form";

export default async function StudentImportPage() {
  const principal = await requireMembershipPage();
  requirePermission(principal, "students:write");
  if (principal.role !== "COLLEGE_ADMIN" && principal.role !== "PLACEMENT_OFFICER") {
    return <main className="mx-auto max-w-2xl px-5 py-10"><p>Only College Administrators and Placement Officers can import students.</p></main>;
  }
  return <main className="mx-auto max-w-3xl px-5 py-10"><Link className="text-sm underline" href="/college/students">← Students</Link><h1 className="mt-4 text-3xl font-bold">Bulk student import</h1><p className="mt-2 text-slate-600">Upload UTF-8 CSV with columns: fullName, email, registerNumber, department, batchYear. Optional academic columns: cgpa, tenthPercentage, twelfthPercentage, standingArrears, historyOfArrears.</p><StudentImportForm /></main>;
}
