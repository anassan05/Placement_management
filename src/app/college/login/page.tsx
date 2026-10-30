import Link from "next/link";
import { collegeLoginAction } from "@/app/actions/onboarding";

export default async function CollegeLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="mx-auto max-w-md px-5 py-16"><Link href="/" className="text-sm text-blue-800">← CampusConnect</Link><h1 className="mt-6 text-3xl font-bold">College administrator sign in</h1>
    {error && <p role="alert" className="mt-4 rounded bg-red-50 p-3">Email or password is incorrect.</p>}
    <form action={collegeLoginAction} className="mt-6 grid gap-4 rounded-xl border bg-white p-6"><label className="grid gap-1">Email<input name="email" type="email" autoComplete="username" required className="rounded border p-2" /></label><label className="grid gap-1">Password<input name="password" type="password" autoComplete="current-password" required className="rounded border p-2" /></label><button className="rounded bg-blue-950 p-3 font-semibold text-white">Sign in</button></form>
  </main>;
}
