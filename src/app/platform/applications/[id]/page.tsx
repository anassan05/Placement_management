import Link from "next/link";
import { notFound } from "next/navigation";
import { getCollegeApplication } from "@/modules/onboarding/platform.service";
import { requirePlatformPage } from "@/modules/tenancy/page-auth";
import { ReviewActions } from "./review-actions";

export default async function ApplicationDetail({ params }: { params: Promise<{ id: string }> }) {
  const principal = await requirePlatformPage();
  const { id } = await params;
  const data = await getCollegeApplication(principal, id);
  if (!data) notFound();
  const app = data.application;
  return <main className="mx-auto max-w-3xl px-5 py-10"><Link href="/platform/applications">← Applications</Link><h1 className="mt-4 text-3xl font-bold">{app.collegeName}</h1><p className="mt-2 text-slate-600">{app.status} · {app.applicationRef}</p><dl className="mt-6 grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-2">{Object.entries({ "Short name": app.shortName, "College email": app.contactEmail, "Phone": app.contactPhone, "Administrator": app.administratorName, "Administrator email": app.administratorEmail, "Website": app.websiteUrl ?? "—", "State": app.state, "District": app.district, "Address": app.address, "Message": app.message ?? "—" }).map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd>{value}</dd></div>)}</dl>{app.status === "PENDING" && <ReviewActions id={id} />}<h2 className="mt-8 text-xl font-semibold">Review history</h2><ul className="mt-3 space-y-2">{data.decisions.map((event) => <li key={`${event.action}-${event.createdAt.toISOString()}`} className="rounded border bg-white p-3"><strong>{event.action}</strong><p className="text-sm text-slate-600">{event.summary}</p></li>)}</ul></main>;
}
