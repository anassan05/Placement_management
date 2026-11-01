import { notFound } from "next/navigation";
import { getStudentInvitation } from "@/modules/students/student-invitation.service";
import { AcceptStudentForm } from "./form";

export default async function AcceptStudentInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await getStudentInvitation(token);
  if (!invitation) notFound();
  return <main className="mx-auto max-w-xl px-5 py-14"><h1 className="text-3xl font-bold">Activate student account</h1><p className="mt-3 text-slate-600">You are invited to join {invitation.collegeName} in {invitation.departmentName}. This link is single-use and bound to {invitation.email}.</p><dl className="mt-4 grid gap-1 rounded bg-white p-4 text-sm"><div><dt className="inline font-medium">Name: </dt><dd className="inline">{invitation.fullName}</dd></div><div><dt className="inline font-medium">Register number: </dt><dd className="inline">{invitation.registerNumber}</dd></div><div><dt className="inline font-medium">Batch: </dt><dd className="inline">{invitation.batchYear}</dd></div></dl><AcceptStudentForm token={token} /></main>;
}
