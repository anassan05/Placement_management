import Link from "next/link";
import { revokeInvitationAction } from "@/app/actions/onboarding";
import { listPlatformInvitations } from "@/modules/onboarding/platform.service";
import { requirePlatformPage } from "@/modules/tenancy/page-auth";

export default async function InvitationsPage() {
  const principal = await requirePlatformPage();
  const invitations = await listPlatformInvitations(principal);
  return <main className="mx-auto max-w-5xl px-5 py-10"><Link href="/platform/dashboard">← Dashboard</Link><h1 className="mt-4 text-3xl font-bold">Administrator invitations</h1><div className="mt-5 divide-y rounded-xl border bg-white">{invitations.map((invite) => <article key={invite.id} className="flex items-center justify-between gap-4 p-4"><div><strong>{invite.college.name}</strong><p className="text-sm text-slate-600">{invite.email} · expires {invite.expiresAt.toLocaleDateString()}</p><p className="text-xs">{invite.acceptedAt ? "Accepted" : invite.revokedAt ? "Revoked" : invite.expiresAt < new Date() ? "Expired" : "Pending"}</p></div>{!invite.acceptedAt && !invite.revokedAt && invite.expiresAt > new Date() && <form action={revokeInvitationAction}><input type="hidden" name="id" value={invite.id} /><button className="rounded border border-red-300 px-3 py-2 text-red-800">Revoke</button></form>}</article>)}</div></main>;
}
