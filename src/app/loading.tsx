export default function Loading() {
  return (
    <main className="mx-auto grid min-h-screen max-w-7xl place-items-center px-6" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
        <span className="size-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-800" />
        Loading CampusConnect…
      </div>
    </main>
  );
}
