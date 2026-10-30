"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center px-6 py-16">
      <section className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-800">Something went wrong</p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">We couldn’t load this page.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Try again. If the problem continues, contact your CampusConnect administrator.</p>
        <button onClick={reset} className="mt-6 rounded-lg bg-blue-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-900">Try again</button>
      </section>
    </main>
  );
}
