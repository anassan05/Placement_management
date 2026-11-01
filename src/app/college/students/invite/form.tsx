"use client";

import { useState } from "react";
import { useActionState } from "react";
import { inviteStudentAction } from "@/app/actions/student";

export function InviteStudentForm({ departments }: { departments: Array<{ id: string; name: string; shortCode: string; isActive: boolean }> }) {
  const [state, formAction, pending] = useActionState(inviteStudentAction, {} as { invitationUrl?: string; error?: string });
  const [copied, setCopied] = useState(false);
  return <form action={formAction} className="mt-6 grid gap-4 rounded-xl border bg-white p-6">
    <label className="grid gap-1">Full name<input name="fullName" required minLength={2} maxLength={140} className="rounded border p-2" /></label>
    <label className="grid gap-1">College email<input name="email" type="email" required maxLength={254} className="rounded border p-2" /></label>
    <label className="grid gap-1">Register number<input name="registerNumber" required maxLength={50} className="rounded border p-2" /></label>
    <label className="grid gap-1">Department<select name="departmentId" required className="rounded border p-2"><option value="">Select department</option>{departments.filter((d) => d.isActive).map((department) => <option key={department.id} value={department.id}>{department.name} ({department.shortCode})</option>)}</select></label>
    <label className="grid gap-1">Batch year<input name="batchYear" type="number" min={2000} max={2200} required className="rounded border p-2" /></label>
    {state.error && <p role="alert" className="rounded bg-red-50 p-3 text-red-800">{state.error}</p>}
    {state.invitationUrl && <div role="status" className="rounded bg-amber-50 p-4"><p className="font-semibold">Copy this one-time link now. It will not be shown again.</p><div className="mt-2 flex gap-2"><input aria-label="One-time student invitation URL" readOnly value={state.invitationUrl} className="min-w-0 flex-1 rounded border bg-white p-2" /><button type="button" onClick={async () => { await navigator.clipboard.writeText(state.invitationUrl!); setCopied(true); }} className="rounded border px-3">{copied ? "Copied" : "Copy link"}</button></div></div>}
    <button disabled={pending || Boolean(state.invitationUrl)} className="rounded bg-blue-950 p-3 font-semibold text-white">{pending ? "Creating invitation…" : "Generate invitation link"}</button>
  </form>;
}
