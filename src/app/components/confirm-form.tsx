"use client";

export function ConfirmForm({ action, fields, question, label }: {
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  question: string;
  label: string;
}) {
  return <form action={action} onSubmit={(event) => { if (!window.confirm(question)) event.preventDefault(); }} className="inline">
    {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    <button className="underline">{label}</button>
  </form>;
}
