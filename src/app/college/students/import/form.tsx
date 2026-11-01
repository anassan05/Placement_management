"use client";

import { useActionState } from "react";
import { confirmStudentImportAction, previewStudentImportAction, type StudentImportActionState } from "@/app/actions/student";

const initialState: StudentImportActionState = {};

export function StudentImportForm() {
  const [state, previewAction, previewPending] = useActionState(previewStudentImportAction, initialState);
  const [confirmation, confirmAction, confirmPending] = useActionState(confirmStudentImportAction, state);
  const current = confirmation.summary || confirmation.preview ? confirmation : state;
  const errors = current.preview?.errors ?? [];
  return <section className="mt-6 grid gap-5">
    <form action={previewAction} className="grid gap-4 rounded-xl border bg-white p-6">
      <label className="grid gap-1">Student CSV<input name="file" type="file" accept=".csv,text/csv" required className="rounded border p-2" /></label>
      <p className="text-sm text-slate-600">The server enforces the configured file and row limits. Invalid rows are rejected and never create invitations.</p>
      {state.error && <p role="alert" className="rounded bg-red-50 p-3 text-red-800">{state.error}</p>}
      <button disabled={previewPending} className="rounded bg-blue-950 p-3 font-semibold text-white">{previewPending ? "Checking CSV…" : "Preview import"}</button>
    </form>
    {current.preview && <section className="rounded-xl border bg-white p-6">
      <h2 className="text-xl font-semibold">Preview</h2>
      <p className="mt-2 text-sm text-slate-600">{current.preview.totalRows} row(s), {current.preview.validRows.length} ready, {new Set(errors.map((error) => error.row)).size} rejected.</p>
      {errors.length > 0 && <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-100"><tr><th className="p-2">Row</th><th className="p-2">Field</th><th className="p-2">Error</th></tr></thead><tbody>{errors.map((error, index) => <tr key={`${error.row}-${error.field}-${index}`} className="border-t"><td className="p-2">{error.row}</td><td className="p-2">{error.field}</td><td className="p-2">{error.message}</td></tr>)}</tbody></table></div>}
      {current.preview.validRows.length > 0 && <form action={confirmAction} className="mt-5 grid gap-3"><input type="hidden" name="csv" value={current.csv ?? ""} /><label className="flex items-center gap-2"><input name="confirm" type="checkbox" required /> I reviewed the preview and want to create invitations for valid rows.</label><button disabled={confirmPending} className="rounded bg-emerald-800 p-3 font-semibold text-white">{confirmPending ? "Importing…" : `Import ${current.preview.validRows.length} valid row(s)`}</button></form>}
    </section>}
    {current.summary && <section role="status" className="rounded-xl border bg-emerald-50 p-6"><h2 className="text-xl font-semibold">Import summary</h2><p className="mt-2">Created: {current.summary.created} · Rejected: {current.summary.rejected} · Duplicate: {current.summary.duplicate} · Failed: {current.summary.failed}</p>{current.summary.invitationUrls.length > 0 && <details className="mt-4"><summary className="cursor-pointer font-medium">Invitation links</summary><ul className="mt-2 list-disc break-all pl-5 text-sm">{current.summary.invitationUrls.map((url) => <li key={url}>{url}</li>)}</ul></details>}</section>}
  </section>;
}
