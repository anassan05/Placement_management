import { notFound } from "next/navigation";
import { getInvitation } from "@/modules/onboarding/invitation.service";
import { AcceptForm } from "./accept-form";

export default async function AcceptInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await getInvitation(token);
  if (!invitation) notFound();
  return <main className="mx-auto max-w-xl px-5 py-14"><h1 className="text-3xl font-bold">Activate your college administrator account</h1><p className="mt-3 text-slate-600">You were invited to administer {invitation.collegeName}. The invite expires {invitation.expiresAt.toLocaleDateString()}.</p><AcceptForm token={token} email={invitation.email} /></main>;
}
