"use client";

import { useActionState, useState } from "react";
import { inviteStaffAction } from "@/app/actions/staff";

export function InviteStaffForm({ departments }: { departments: Array<{ id: string; name: string; shortCode: string; isActive: boolean }> }) {
  const [state, formAction, pending] = useActionState(inviteStaffAction, {} as { invitationUrl?: string; error?: string });
  const [role, setRole] = useState("PLACEMENT_OFFICER");
  const [copied, setCopied] = useState(false);
  return <form action={formAction} className="mt-6 grid gap-4 rounded-xl border bg-white p-6">
    <label className="grid gap-1">Full name<input name="fullName" required minLength={2} maxLength={140} className="rounded border p-2" /></label>
    <label className="grid gap-1">Official email<input name="email" type="email" required maxLength={254} className="rounded border p-2" /></label>
    <label className="grid gap-1">Staff role<select name="role" value={role} onChange={(e) => setRole(e.target.value)} className="rounded border p-2"><option value="PLACEMENT_OFFICER">Placement Officer</option><option value="COORDINATOR">Coordinator</option></select></label>
    {role === "COORDINATOR" && <fieldset className="grid gap-2"><legend className="font-medium">Department assignment (required)</legend>{departments.filter((d) => d.isActive).map((department) => <label key={department.id} className="flex items-center gap-2"><input type="checkbox" name="departmentIds" value={department.id} />{department.name} ({department.shortCode})</label>)}{departments.every((d) => !d.isActive) && <p className="text-sm text-amber-800">Create an active department before inviting a Coordinator.</p>}</fieldset>}
    <label className="grid gap-1">Optional invitation message<textarea name="message" rows={3} maxLength={1000} className="rounded border p-2" /></label>
    {state.error && <p role="alert" className="rounded bg-red-50 p-3 text-red-800">{state.error}</p>}
    {state.invitationUrl && <div role="status" className="rounded bg-amber-50 p-4"><p className="font-semibold">Copy this one-time link now. It will not be shown again after leaving this page.</p><div className="mt-2 flex gap-2"><input aria-label="One-time staff invitation URL" readOnly value={state.invitationUrl} className="min-w-0 flex-1 rounded border bg-white p-2" /><button type="button" onClick={async () => { await navigator.clipboard.writeText(state.invitationUrl!); setCopied(true); }} className="rounded border px-3">{copied ? "Copied" : "Copy link"}</button></div></div>}
    <button disabled={pending || Boolean(state.invitationUrl)} className="rounded bg-blue-950 p-3 font-semibold text-white">{pending ? "Creating invitation…" : "Generate invitation link"}</button>
  </form>;
}
