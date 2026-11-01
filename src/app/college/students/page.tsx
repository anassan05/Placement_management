import Link from "next/link";
import { requireMembershipPage } from "@/modules/tenancy/page-auth";
import { listStudents } from "@/modules/students/student.service";

export default async function StudentsPage() {
  const principal = await requireMembershipPage();
  const students = await listStudents(principal);
  const canImport = principal.role === "COLLEGE_ADMIN" || principal.role === "PLACEMENT_OFFICER";
  return <main className="mx-auto max-w-6xl px-5 py-10"><header className="flex items-center justify-between"><h1 className="text-3xl font-bold">Students</h1><div className="flex gap-2">{canImport && <Link className="rounded bg-blue-950 px-4 py-2 text-white" href="/college/students/import">Import CSV</Link>}<Link className="rounded border px-4 py-2" href="/college/students/invite">Invite student</Link></div></header><section className="mt-6 overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-100"><tr>{["Name", "Register number", "Department", "Batch", "Verification"].map((x) => <th key={x} className="p-3">{x}</th>)}</tr></thead><tbody>{students.map((s) => <tr key={s.id} className="border-t"><td className="p-3"><Link className="underline" href={`/college/students/${s.id}`}>{s.fullName}</Link></td><td className="p-3">{s.registerNumber}</td><td className="p-3">{s.departmentCode}</td><td className="p-3">{s.batchYear}</td><td className="p-3">{s.verificationStatus}</td></tr>)}</tbody></table>{students.length === 0 && <p className="p-6 text-slate-600">No students found.</p>}</section></main>;
}
