"use client";

import { useActionState, useState } from "react";
import { resendStaffInvitationAction, revokeStaffInvitationAction } from "@/app/actions/staff";
import type { StaffInvitationActionState } from "@/app/actions/staff";

export function InvitationActions({ id }: { id: string }) {
  const [state, resendAction, pending] = useActionState(resendStaffInvitationAction, {} as StaffInvitationActionState);
  const [copied, setCopied] = useState(false);
  return <div className="grid gap-2"><form action={resendAction} onSubmit={(e) => { if (!window.confirm("Resending revokes the old invitation link and creates a new one-time link. Continue?")) e.preventDefault(); }}><input type="hidden" name="id" value={id} /><button disabled={pending || Boolean(state.invitationUrl)} className="underline">{pending ? "Generating…" : "Resend"}</button></form>
    <form action={revokeStaffInvitationAction} onSubmit={(e) => { if (!window.confirm("Revoke this invitation? Its current link will stop working immediately.")) e.preventDefault(); }}><input type="hidden" name="id" value={id} /><button className="text-red-700 underline">Revoke</button></form>
    {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
    {state.invitationUrl && <div role="status" className="max-w-sm rounded bg-amber-50 p-3"><p className="text-sm font-medium">Copy the new one-time link now.</p><input readOnly aria-label="Resent invitation URL" value={state.invitationUrl} className="mt-2 w-full rounded border p-2 text-xs" /><button type="button" onClick={async () => { await navigator.clipboard.writeText(state.invitationUrl!); setCopied(true); }} className="mt-2 underline">{copied ? "Copied" : "Copy link"}</button></div>}</div>;
}
