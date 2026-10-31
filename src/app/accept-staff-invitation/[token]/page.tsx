import { notFound } from "next/navigation";
import { getStaffInvitation } from "@/modules/staff/staff.service";
import { AcceptStaffForm } from "./staff-form";

export default async function AcceptStaffInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await getStaffInvitation(token);
  if (!invitation) notFound();
  return <main className="mx-auto max-w-xl px-5 py-14"><h1 className="text-3xl font-bold">Accept staff invitation</h1><p className="mt-3 text-slate-600">You are invited to join {invitation.collegeName} as a {invitation.role === "COORDINATOR" ? "Coordinator" : "Placement Officer"}. This link is single-use and the email is bound to the invitation.</p>{invitation.message && <p className="mt-3 rounded bg-white p-3">{invitation.message}</p>}<AcceptStaffForm token={token} fullName={invitation.fullName} email={invitation.email} /></main>;
}
