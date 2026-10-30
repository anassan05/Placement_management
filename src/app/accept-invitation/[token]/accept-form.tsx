"use client";

import { useActionState } from "react";
import { acceptInvitationAction } from "@/app/actions/onboarding";

export function AcceptForm({ token, email }: { token: string; email: string }) {
  const action = acceptInvitationAction.bind(null, token);
  const [state, formAction, pending] = useActionState(action, {} as { error?: string });
  return <form action={formAction} className="mt-6 grid gap-4 rounded-xl border bg-white p-6">
    <label className="grid gap-1">Invited email<input name="email" type="email" defaultValue={email} readOnly className="rounded border bg-slate-50 p-2" /></label>
    <label className="grid gap-1">Administrator name<input name="displayName" required maxLength={140} className="rounded border p-2" /></label>
    <label className="grid gap-1">Password (12 or more characters)<input name="password" type="password" minLength={12} maxLength={256} autoComplete="new-password" required className="rounded border p-2" /></label>
    {state.error && <p role="alert" className="rounded bg-red-50 p-3">{state.error}</p>}
    <button disabled={pending} className="rounded bg-blue-950 p-3 font-semibold text-white">{pending ? "Activating…" : "Create account and activate college"}</button>
  </form>;
}
