import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { selectCollegeAction, logoutAction } from "@/app/actions/onboarding";
import { listSessionCollegeChoices, resolveSessionContext } from "@/modules/authentication/session-store";

export default async function SelectCollegePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const token = (await cookies()).get("cc_session")?.value;
  if (!token) redirect("/college/login");
  const session = await resolveSessionContext(token);
  if (!session) redirect("/college/login");
  if (session.activeCollegeId) redirect("/college/dashboard");
  const choices = await listSessionCollegeChoices(token);
  if (!choices.length) redirect("/college/login?error=1");
  const { error } = await searchParams;
  return <main className="mx-auto max-w-xl px-5 py-16"><h1 className="text-3xl font-bold">Choose a college workspace</h1><p className="mt-2 text-slate-600">Your account has more than one active college administrator membership.</p>{error && <p role="alert" className="mt-4 rounded bg-red-50 p-3">That workspace is no longer available.</p>}<div className="mt-6 grid gap-3">{choices.map((college) => <form key={college.id} action={selectCollegeAction} className="rounded-xl border bg-white p-4"><input type="hidden" name="collegeId" value={college.id} /><p className="font-semibold">{college.name}</p><button className="mt-3 rounded bg-blue-950 px-4 py-2 text-white">Open workspace</button></form>)}</div><form action={logoutAction} className="mt-5"><button className="underline">Sign out</button></form></main>;
}
