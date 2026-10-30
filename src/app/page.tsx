export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-white">
      <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between px-5 py-5 sm:px-8">
        <a href="#home" className="flex items-center gap-3" aria-label="CampusConnect home">
          <span className="grid size-10 place-items-center rounded-xl bg-blue-950 text-lg font-bold text-white">C</span>
          <span className="text-lg font-bold tracking-tight text-slate-950">CampusConnect</span>
        </a>
        <nav aria-label="Main navigation" className="order-3 flex w-full items-center justify-center gap-7 pt-4 text-xs font-medium text-slate-600 sm:order-none sm:w-auto sm:gap-8 sm:pt-0 sm:text-sm">
          <a className="transition hover:text-blue-800" href="#platform">Platform</a>
          <a className="transition hover:text-blue-800" href="#foundation">Foundation</a>
          <a className="transition hover:text-blue-800" href="#about">About</a>
        </nav>
        <a href="mailto:hello@campusconnect.example" className="rounded-lg bg-blue-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
          Get in touch
        </a>
        <div className="flex w-full justify-center gap-4 pt-3 text-xs text-blue-900 sm:w-auto sm:pt-0">
          <a href="/apply-college">Apply for your college</a>
          <a href="/college/login">College sign in</a>
        </div>
      </header>

      <section id="home" className="relative isolate border-y border-slate-100 bg-slate-50">
        <div className="absolute -right-28 -top-36 -z-10 size-[30rem] rounded-full bg-blue-100/70 blur-3xl" />
        <div className="mx-auto grid max-w-7xl gap-14 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-blue-900">
              <span className="size-1.5 rounded-full bg-blue-600" /> Campus placements, connected
            </p>
            <h1 className="mt-7 max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight text-slate-950 sm:text-6xl">
              Better connections.<br /><span className="text-blue-800">Stronger first steps.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              A clear, connected way for colleges to coordinate placement opportunities and help students move confidently toward what comes next.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a href="#platform" className="rounded-lg bg-blue-950 px-5 py-3 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-blue-900">Explore the platform <span aria-hidden="true">→</span></a>
              <a href="#foundation" className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-800 transition hover:border-blue-300 hover:text-blue-900">Our foundation</a>
            </div>
            <div className="mt-10 flex items-center gap-3 text-sm text-slate-500">
              <span className="flex -space-x-2" aria-hidden="true">
                <span className="size-8 rounded-full border-2 border-slate-50 bg-blue-200" />
                <span className="size-8 rounded-full border-2 border-slate-50 bg-sky-300" />
                <span className="size-8 rounded-full border-2 border-slate-50 bg-indigo-300" />
              </span>
              Built around the campus community
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-lg">
            <div className="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-blue-200/70 to-sky-100/30 blur-2xl" />
            <div className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-blue-950/10 sm:p-7">
              <div className="flex items-start justify-between border-b border-slate-100 pb-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Placement workspace</p>
                  <h2 className="mt-1 text-lg font-bold text-slate-950">A connected campus</h2>
                </div>
                <span className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-800">Foundation</span>
              </div>
              <div className="mt-5 space-y-3">
                {[
                  ["01", "College spaces", "Each institution has its own secure workspace"],
                  ["02", "Shared direction", "Students and staff work from one source"],
                  ["03", "Clear opportunities", "Placement activity stays organized"]
                ].map(([number, title, description]) => (
                  <div key={number} className="flex gap-4 rounded-xl bg-slate-50 p-4">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-xs font-bold text-blue-800 shadow-sm">{number}</span>
                    <div><h3 className="text-sm font-semibold text-slate-900">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></div>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-center justify-between rounded-xl bg-blue-950 px-4 py-3 text-white">
                <span className="text-sm font-medium">Designed for every next step</span>
                <span aria-hidden="true" className="text-blue-200">✦</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="platform" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.15em] text-blue-800">One platform, shared purpose</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Built to bring the placement journey together.</h2>
          <p className="mt-4 leading-7 text-slate-600">CampusConnect is laying the groundwork for a more coordinated experience across colleges, placement teams, and students.</p>
        </div>
        <div id="foundation" className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            ["01", "A space for each college", "College-specific workspaces keep people, programs, and opportunities in the right place."],
            ["02", "Roles with purpose", "A clear role foundation helps teams collaborate with responsibilities in view."],
            ["03", "Opportunities in focus", "A structured placement foundation brings companies, drives, and registrations together."]
          ].map(([number, title, description]) => (
            <article key={number} className="rounded-2xl border border-slate-200 bg-white p-6 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-950/5">
              <span className="text-xs font-bold tracking-[0.15em] text-blue-700">{number}</span>
              <h3 className="mt-5 text-lg font-bold text-slate-950">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <footer id="about" className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-7 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span className="font-semibold text-slate-700">CampusConnect</span>
          <span>Connecting campuses to opportunity.</span>
          <span className="text-xs">Foundation preview · Not for real student data</span>
        </div>
      </footer>
    </main>
  );
}
