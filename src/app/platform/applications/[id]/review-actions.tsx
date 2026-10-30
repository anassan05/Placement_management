"use client";

import { useActionState } from "react";
import { approveApplicationAction, rejectApplicationAction } from "@/app/actions/onboarding";

export function ReviewActions({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(approveApplicationAction, {} as { invitationUrl?: string; error?: string });
  return <section className="mt-6 grid gap-4 rounded-xl border bg-white p-5">
    <form action={formAction} onSubmit={(event) => { if (!window.confirm("Approve this application and create an inactive college with a one-time administrator invitation?")) event.preventDefault(); }}><input type="hidden" name="id" value={id} /><button disabled={pending || Boolean(state.invitationUrl)} className="rounded bg-green-800 px-4 py-2 font-semibold text-white">{pending ? "Approving…" : "Approve and issue invitation"}</button></form>
    {state.error && <p role="alert" className="text-red-700">{state.error}</p>}
    {state.invitationUrl && <div className="rounded bg-amber-50 p-4"><p className="font-semibold">Copy this one-time invitation now. It will not be shown again.</p><input aria-label="One-time invitation URL" readOnly value={state.invitationUrl} className="mt-2 w-full rounded border bg-white p-2" /></div>}
    <form action={rejectApplicationAction} onSubmit={(event) => { if (!window.confirm("Reject this college application? This decision will be recorded.")) event.preventDefault(); }} className="grid gap-2 border-t pt-4"><input type="hidden" name="id" value={id} /><label className="grid gap-1 text-sm">Rejection reason<textarea name="reason" maxLength={1000} rows={2} className="rounded border p-2" /></label><button className="w-fit rounded border border-red-300 px-4 py-2 font-semibold text-red-800">Reject application</button></form>
  </section>;
}
