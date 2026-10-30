import Link from "next/link";
import { applyCollegeAction } from "@/app/actions/onboarding";

export default async function ApplyCollegePage({ searchParams }: { searchParams: Promise<{ submitted?: string; error?: string }> }) {
  const query = await searchParams;
  return <main className="mx-auto min-h-screen max-w-3xl px-5 py-12">
    <Link href="/" className="text-sm text-blue-800">← CampusConnect</Link>
    <h1 className="mt-6 text-3xl font-bold">Apply to onboard your college</h1>
    <p className="mt-2 text-slate-600">Applications are reviewed by the CampusConnect platform team. Submission does not create an account.</p>
    {query.submitted && <p role="status" className="mt-5 rounded-lg bg-green-50 p-4">Application received. Reference: <strong>{query.submitted}</strong></p>}
    {query.error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4">We could not submit this application. Check the form or try again later.</p>}
    {!query.submitted && <form action={applyCollegeAction} className="mt-8 grid gap-4 rounded-xl border bg-white p-6 sm:grid-cols-2">
      <Field name="collegeName" label="College name" required />
      <Field name="shortName" label="Short name" required />
      <Field name="websiteUrl" label="Website URL" type="url" />
      <Field name="contactEmail" label="College contact email" type="email" required />
      <Field name="contactPhone" label="College contact phone" required />
      <Field name="state" label="State" required />
      <Field name="district" label="District" required />
      <Field name="address" label="Address" required />
      <Field name="administratorName" label="Administrator name" required />
      <Field name="administratorEmail" label="Administrator email" type="email" required />
      <label className="sm:col-span-2 grid gap-1 text-sm">Message <textarea name="message" maxLength={2000} rows={3} className="rounded-md border p-2" /></label>
      <label className="hidden" aria-hidden="true">Leave empty<input name="companyWebsite" tabIndex={-1} autoComplete="off" /></label>
      <button className="rounded-md bg-blue-950 px-4 py-3 font-semibold text-white sm:col-span-2">Submit application</button>
    </form>}
  </main>;
}

function Field({ name, label, type = "text", required = false }: { name: string; label: string; type?: string; required?: boolean }) {
  return <label className="grid gap-1 text-sm">{label}<input name={name} type={type} required={required} maxLength={500} className="rounded-md border p-2" /></label>;
}
