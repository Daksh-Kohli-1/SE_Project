import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col bg-sand">
      <header className="flex items-center justify-between px-6 py-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-marine text-white font-display font-bold text-xl flex items-center justify-center shadow-xs">
            N
          </div>
          <span className="font-display text-2xl font-bold tracking-tight text-ink">
            Nest 2.0
          </span>
        </div>
        <nav className="flex gap-3">
          <Link
            href="/login"
            className="px-5 py-2 text-marine font-bold text-sm hover:underline flex items-center gap-1"
          >
            Log in
          </Link>
          <Link
            href="/dashboard"
            className="px-6 py-2.5 bg-marine hover:bg-ink text-white rounded-full font-bold text-sm shadow-md transition"
          >
            Explore Student Portal 👋
          </Link>
        </nav>
      </header>

      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 max-w-4xl mx-auto py-12">
        <span className="uppercase tracking-widest text-coral text-xs font-bold mb-4 bg-coral/10 px-4 py-1 rounded-full border border-coral/20">
          Thapar Hostel Operating System · 2.0 Evolution
        </span>
        <h1 className="font-display text-4xl sm:text-6xl font-bold text-ink leading-tight mb-6">
          Pick your room.
          <br />
          <span className="text-marine">Manage your campus life.</span>
        </h1>
        <p className="text-slate text-base sm:text-lg max-w-2xl mb-10 leading-relaxed">
          The complete hostel management ecosystem for Thapar Institute — featuring real-time floor plans, group allocation, mess analytics, service requests, visitor gate pass, emergency alerts, and cashless billing.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link
            href="/dashboard"
            className="px-8 py-3.5 bg-coral text-white rounded-full font-bold text-base hover:bg-ink shadow-lg hover:shadow-xl transition"
          >
            Open Student Dashboard →
          </Link>
          <Link
            href="/login"
            className="px-8 py-3.5 border border-ink/20 bg-white text-ink rounded-full font-bold text-base hover:bg-sand transition shadow-xs"
          >
            Log in
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto px-6 pb-20 w-full">
        {[
          {
            icon: "🗺️",
            title: "1. Visual Cluster Map",
            body: "Browse floor plans, inspect room amenities, and rank cluster choices in real time.",
          },
          {
            icon: "👥",
            title: "2. Optional Teaming",
            body: "Form groups of 1–4 members with shareable codes. Allotment runs as each member pays.",
          },
          {
            icon: "🛠️",
            title: "3. Requests & Campus Services",
            body: "Raise 12+ request types including room maintenance, leave passes, visitors, and emergency SOS alerts.",
          },
        ].map((step) => (
          <div key={step.title} className="nest-card p-6">
            <div className="w-10 h-10 rounded-xl bg-marine/10 text-xl flex items-center justify-center mb-3">
              {step.icon}
            </div>
            <h3 className="font-display text-lg font-bold text-ink mb-2">{step.title}</h3>
            <p className="text-slate text-xs leading-relaxed">{step.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
