"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export default function Home() {
  return (
    <main className="relative min-h-screen flex flex-col bg-[#0B0B0C] overflow-hidden">
      {/* Charcoal base with grain texture + soft blue/orange glows */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 w-[36rem] h-[36rem] bg-blue-600/15 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 -right-32 w-[30rem] h-[30rem] bg-blue-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 w-[24rem] h-[24rem] bg-orange-500/10 rounded-full blur-[100px]" />

        {/* Live animated grid — thicker lines */}
        <motion.div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.9) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,0.9) 2px, transparent 2px)",
            backgroundSize: "56px 56px",
          }}
          animate={{ backgroundPosition: ["0px 0px", "56px 56px"] }}
          transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
        />

        {/* Sweeping highlight bar across the grid */}
        <motion.div
          className="absolute -inset-y-20 w-1/3 bg-gradient-to-r from-transparent via-blue-500/10 to-transparent"
          animate={{ x: ["-40vw", "140vw"] }}
          transition={{ duration: 9, repeat: Infinity, ease: "linear" }}
        />

        {/* Granular noise texture — slow drift for a living surface */}
        <motion.div
          className="absolute -inset-full opacity-[0.35]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'%3E%3C/feTurbulence%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.5 0'%3E%3C/feColorMatrix%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'%3E%3C/rect%3E%3C/svg%3E")`,
            backgroundRepeat: "repeat",
          }}
          animate={{ x: [0, -40, 0], y: [0, -30, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
        />
      </div>

      <motion.header
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 flex items-center justify-between px-6 py-6 max-w-7xl mx-auto w-full"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-blue-600 text-white font-bold text-lg flex items-center justify-center shadow-[0_0_20px_-4px] shadow-blue-500/60">
            N
          </div>
          <span className="text-xl font-semibold tracking-tight text-white">
            NEST
          </span>
        </div>
        <nav className="flex gap-3">
          <Link
            href="/login"
            className="px-5 py-2 text-blue-400 font-bold text-sm hover:underline flex items-center gap-1"
          >
            Log in
          </Link>
          {/* <Link
            href="/dashboard"
            className="px-6 py-2.5 bg-marine hover:bg-ink text-white rounded-full font-bold text-sm shadow-md transition"
          >
            Explore Student Portal 👋
          </Link> */}
        </nav>
      </motion.header>

      <section className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6 max-w-4xl mx-auto py-12">
        {/* <motion.span
          initial="hidden"
          animate="show"
          custom={0}
          variants={fadeUp}
          className="inline-flex items-center gap-2 text-xs font-medium text-white mb-6 bg-white/5 px-3.5 py-1.5 rounded-full border border-white/10"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
          Thapar Hostel Operating System · 2.0
        </motion.span> */}

        <motion.h1
          initial="hidden"
          animate="show"
          custom={1}
          variants={fadeUp}
          className="text-4xl sm:text-6xl font-semibold leading-[1.1] tracking-tight mb-6"
        >
          <span className="text-white">Pick your room.</span>
          <br />
          <span className="text-blue-400">Manage your campus life.</span>
        </motion.h1>

        <motion.p
          initial="hidden"
          animate="show"
          custom={2}
          variants={fadeUp}
          className="text-white/70 text-base sm:text-lg max-w-2xl mb-10 leading-relaxed"
        >
          The complete hostel management ecosystem for Thapar Institute — featuring real-time floor plans, group allocation, mess analytics, service requests, visitor gate pass, emergency alerts, and cashless billing.
        </motion.p>

        <motion.div
          initial="hidden"
          animate="show"
          custom={3}
          variants={fadeUp}
          className="flex flex-wrap justify-center gap-4"
        >
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Link
              href="/login"
              className="px-8 py-3.5 bg-orange-500 text-white rounded-full font-bold text-base shadow-[0_0_24px_-6px] shadow-orange-500/60 hover:bg-orange-400 transition-colors inline-block"
            >
              Open Student Dashboard →
            </Link>
          </motion.div>
          {/* <Link
            href="/login"
            className="px-8 py-3.5 border border-ink/20 bg-white text-ink rounded-full font-bold text-base hover:bg-sand transition shadow-xs"
          >
            Log in
          </Link> */}
        </motion.div>
      </section>

      <section className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-6xl mx-auto px-6 pb-20 w-full">
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
        ].map((step, i) => (
          <motion.div
            key={step.title}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.1, delay: i * 0.1, ease: "easeOut" }}
            whileHover={{ y: -4, borderColor: "rgba(96,165,250,0.4)" }}
            className="rounded-xl bg-white/[0.03] backdrop-blur-sm border border-white/10 p-6 text-left transition-colors"
          >
            <div className="w-10 h-10 rounded-xl border border-blue-500/20 bg-blue-500/10 text-blue-300 text-xl flex items-center justify-center mb-3">
              {step.icon}
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
            <p className="text-white/70 text-xs leading-relaxed">{step.body}</p>
          </motion.div>
        ))}
      </section>
    </main>
  );
}