"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import api from "@/lib/api";
import Navbar from "@/components/Navbar";
import { useHostelAssignment } from "../../../lib/useHostelAssignment";
import HostelGate from "../../../components/HostelGate";

type MealType = "breakfast" | "lunch" | "dinner";

const MEAL_META: Record<MealType, { label: string; icon: string; time: string }> = {
  breakfast: { label: "Breakfast", icon: "🍳", time: "7:30 – 9:30 AM" },
  lunch: { label: "Lunch", icon: "🍛", time: "12:00 – 2:00 PM" },
  dinner: { label: "Dinner", icon: "🍽️", time: "7:00 – 9:00 PM" },
};

function formatWindowTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
}

export default function LiveMessPollPage() {
  const gate = useHostelAssignment();
  const [results, setResults] = useState<Record<MealType, any>>({} as any);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function loadAll() {
    const meals: MealType[] = ["breakfast", "lunch", "dinner"];
    const responses = await Promise.allSettled(
      meals.map((m) => api.get("/api/services/mess/live-poll/results", { params: { meal_type: m } }))
    );
    const next: Record<string, any> = {};
    responses.forEach((r, i) => {
      if (r.status === "fulfilled") next[meals[i]] = r.value.data;
    });
    setResults(next as Record<MealType, any>);
    setLastUpdated(new Date());
    setLoading(false);
  }

  useEffect(() => {
    if (!gate.allotted) return;
    loadAll();
    const interval = setInterval(loadAll, 6000);
    return () => clearInterval(interval);
  }, [gate.allotted]);

  return (
    <main className="min-h-screen pb-20 bg-[#0B0B0C]">
      <Navbar active="/mess" />

      {gate.loading && <p className="text-xs text-white/50 text-center mt-16">Loading…</p>}

      {!gate.loading && !gate.allotted && (
        <HostelGate what="Live mess voting" windowState={gate.windowState} />
      )}

      {!gate.loading && gate.allotted && (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div>
            <h1 className="text-3xl sm:text-4xl font-semibold text-white mb-1 flex items-center gap-3">
              Live Poll Results
              <span className="text-[10px] font-bold text-blue-300 bg-blue-500/10 px-2.5 py-1 rounded-full animate-pulse align-middle">
                ● Live
              </span>
            </h1>
            <p className="text-white/60 text-sm sm:text-base">
              How the hostel is reacting to today's meals, updating in real time.
            </p>
          </div>
          <Link
            href="/mess"
            className="px-5 py-2.5 bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] text-white font-bold text-xs rounded-full shadow-sm transition-colors inline-flex items-center gap-2 shrink-0"
          >
            ← Back to Mess & Community
          </Link>
        </motion.div>

        {loading && <p className="text-xs text-white/50 mb-4">Loading live results…</p>}

        <div className="grid md:grid-cols-3 gap-6">
          {(["breakfast", "lunch", "dinner"] as MealType[]).map((meal, mi) => {
            const r = results[meal];
            const meta = MEAL_META[meal];
            return (
              <motion.div
                key={meal}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: mi * 0.1, ease: "easeOut" }}
                className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6 flex flex-col"
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <span>{meta.icon}</span> {meta.label}
                  </h3>
                  {r ? (
                    <span
                      className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                        r.is_open ? "bg-green-500/10 text-green-400" : "bg-white/10 text-white/50"
                      }`}
                    >
                      {r.is_open ? "● Open now" : "Closed"}
                    </span>
                  ) : (
                    <span className="text-[10px] text-white/40 font-medium">{meta.time}</span>
                  )}
                </div>
                <p className="text-[11px] text-white/50 mb-4">
                  {r
                    ? `${r.total_votes} vote${r.total_votes === 1 ? "" : "s"} · window ${formatWindowTime(r.window_start)} – ${formatWindowTime(r.window_end)}`
                    : "No data yet"}
                </p>

                <div className="space-y-3 flex-1">
                  {r?.options?.map((label: string, idx: number) => {
                    const votes = r.tally[idx] || 0;
                    const pct = r.total_votes > 0 ? Math.round((votes / r.total_votes) * 100) : 0;
                    return (
                      <div key={idx} className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] p-3">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.7, ease: "easeOut" }}
                          className="absolute left-0 top-0 bottom-0 bg-blue-500/15"
                        />
                        <div className="relative z-10 flex items-center justify-between text-xs">
                          <span className="font-bold text-white">{label}</span>
                          <span className="font-bold text-blue-300">{pct}% ({votes})</span>
                        </div>
                      </div>
                    );
                  })}
                  {!r && (
                    <div className="py-6 text-center text-xs text-white/50 bg-white/[0.02] rounded-xl border border-dashed border-white/15">
                      No votes recorded for this meal yet today.
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {lastUpdated && (
          <p className="text-[10px] text-white/40 text-center mt-6">
            Last updated {lastUpdated.toLocaleTimeString()} · refreshes automatically every few seconds
          </p>
        )}
      </div>
      )}
    </main>
  );
}