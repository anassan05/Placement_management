import Link from "next/link";
import { logoutAction } from "@/app/actions/onboarding";
import { requireMembershipPage } from "@/modules/tenancy/page-auth";
import { getStudentDashboard } from "@/modules/students/dashboard.service";

export default async function StudentDashboardPage() {
  const principal = await requireMembershipPage();
  if (principal.role !== "STUDENT") return <main className="p-8">This dashboard is available to student accounts.</main>;
  const dashboard = await getStudentDashboard(principal);
  if (!dashboard) return <main className="mx-auto max-w-xl px-5 py-12"><h1 className="text-2xl font-bold">Student profile unavailable</h1><p className="mt-2 text-slate-600">Your student profile has not been activated yet. Please contact your college administrator.</p></main>;
  const { student, academics, documents, completion, registrations } = dashboard;
  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-slate-600">Student dashboard</p>
          <h1 className="mt-1 text-3xl font-bold">Welcome, {student.fullName}</h1>
          <p className="mt-2 text-slate-600">{student.departmentCode} · Batch {student.batchYear} · {student.registerNumber}</p>
        </div>
        <form action={logoutAction}><button className="underline" type="submit">Sign out</button></form>
      </header>

      <section className="mt-6 grid gap-5 md:grid-cols-3">
        <article className="rounded-xl border bg-white p-5 md:col-span-2">
          <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-semibold">Profile completion</h2><strong>{completion.percentage}%</strong></div>
          <div className="mt-3 h-3 overflow-hidden rounded bg-slate-200" aria-label="Profile completion"><div className="h-full bg-blue-700" style={{ width: `${completion.percentage}%` }} /></div>
          <p className="mt-2 text-sm text-slate-600">{completion.completed} of {completion.total} profile items completed.</p>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {Object.entries(completion.fields).map(([field, complete]) => <li key={field} className={complete ? "text-green-700" : "text-amber-700"}>{complete ? "Complete" : "Missing"}: {field.replace(/([A-Z])/g, " $1").toLowerCase()}</li>)}
          </ul>
        </article>
        <article className="rounded-xl border bg-white p-5"><h2 className="text-xl font-semibold">Verification</h2><p className="mt-3">{student.verificationStatus}</p><p className="mt-2 text-sm text-slate-600">Your college controls verification status.</p></article>
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-2">
        <article className="rounded-xl border bg-white p-5">
          <h2 className="text-xl font-semibold">Academic information</h2>
          {academics ? <dl className="mt-4 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-slate-500">CGPA</dt><dd className="font-medium">{academics.cgpa ?? "Not added"}</dd></div><div><dt className="text-slate-500">Standing arrears</dt><dd className="font-medium">{academics.standingArrears ?? "Not added"}</dd></div><div><dt className="text-slate-500">10th percentage</dt><dd className="font-medium">{academics.tenthPercentage ?? "Not added"}</dd></div><div><dt className="text-slate-500">12th percentage</dt><dd className="font-medium">{academics.twelfthPercentage ?? "Not added"}</dd></div></dl> : <p className="mt-3 text-slate-600">Academic information has not been added.</p>}
        </article>
        <article className="rounded-xl border bg-white p-5">
          <h2 className="text-xl font-semibold">Documents</h2>
          <dl className="mt-4 grid gap-3 text-sm"><div><dt className="text-slate-500">Resume</dt><dd>{documents.resume ? <Link className="underline" href={`/api/college/students/${student.id}/documents/${documents.resume.id}`}>{documents.resume.originalName}</Link> : "Not uploaded"}</dd></div><div><dt className="text-slate-500">Academic certificate</dt><dd>{documents.academicCertificate ? <Link className="underline" href={`/api/college/students/${student.id}/documents/${documents.academicCertificate.id}`}>{documents.academicCertificate.originalName}</Link> : "Not uploaded"}</dd></div><div><dt className="text-slate-500">Supporting documents</dt><dd>{documents.supportingCount}</dd></div></dl>
        </article>
      </section>

      <section className="mt-6 rounded-xl border bg-white p-5">
        <h2 className="text-xl font-semibold">Registered placement drives</h2>
        {registrations.length ? <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Drive</th><th className="p-2">Company</th><th className="p-2">Status</th><th className="p-2">Deadline</th></tr></thead><tbody>{registrations.map((registration) => <tr className="border-b" key={registration.id}><td className="p-2">{registration.title}</td><td className="p-2">{registration.companyName}</td><td className="p-2">{registration.status}</td><td className="p-2">{registration.deadlineAt?.toLocaleDateString() ?? "Not specified"}</td></tr>)}</tbody></table></div> : <p className="mt-3 text-slate-600">You have not registered for any placement drives.</p>}
      </section>
    </main>
  );
}
