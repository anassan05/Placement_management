"use client";

import { useActionState } from "react";
import { acceptStudentInvitationAction } from "@/app/actions/student";

export function AcceptStudentForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptStudentInvitationAction.bind(null, token), {} as { error?: string });
  return <form action={action} className="mt-6 grid gap-4 rounded-xl border bg-white p-6">
    <label className="grid gap-1">Password (12 or more characters)<input name="password" type="password" minLength={12} maxLength={256} autoComplete="new-password" required className="rounded border p-2" /></label>
    <label className="grid gap-1">Confirm password<input name="confirmPassword" type="password" minLength={12} maxLength={256} autoComplete="new-password" required className="rounded border p-2" /></label>
    {state.error && <p role="alert" className="rounded bg-red-50 p-3 text-red-800">{state.error}</p>}
    <button disabled={pending} className="rounded bg-blue-950 p-3 font-semibold text-white">{pending ? "Activating…" : "Create account and join college"}</button>
  </form>;
}
