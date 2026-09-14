"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import Navbar from "@/components/Navbar";

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
    loadAll();
    const interval = setInterval(loadAll, 6000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="min-h-screen pb-20 bg-sand">
      <Navbar active="/mess" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink mb-1 flex items-center gap-3">
              Live Poll Results
              <span className="text-[10px] font-bold text-marine bg-marine/10 px-2.5 py-1 rounded-full animate-pulse align-middle">
                ● Live
              </span>
            </h1>
            <p className="text-slate text-sm sm:text-base">
              How the hostel is reacting to today's meals, updating in real time.
            </p>
          </div>
          <Link
            href="/mess"
            className="px-5 py-2.5 bg-white border border-ink/10 hover:bg-sand text-ink font-bold text-xs rounded-full shadow-xs transition inline-flex items-center gap-2 shrink-0"
          >
            ← Back to Mess & Community
          </Link>
        </div>

        {loading && <p className="text-xs text-slate mb-4">Loading live results…</p>}

        <div className="grid md:grid-cols-3 gap-6">
          {(["breakfast", "lunch", "dinner"] as MealType[]).map((meal) => {
            const r = results[meal];
            const meta = MEAL_META[meal];
            return (
              <div key={meal} className="nest-card p-6 flex flex-col">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-display text-lg font-bold text-ink flex items-center gap-2">
                    <span>{meta.icon}</span> {meta.label}
                  </h3>
                  {r ? (
                    <span
                      className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                        r.is_open ? "bg-moss/10 text-moss" : "bg-slate/10 text-slate"
                      }`}
                    >
                      {r.is_open ? "● Open now" : "Closed"}
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate font-medium">{meta.time}</span>
                  )}
                </div>
                <p className="text-[11px] text-slate mb-4">
                  {r
                    ? `${r.total_votes} vote${r.total_votes === 1 ? "" : "s"} · window ${formatWindowTime(r.window_start)} – ${formatWindowTime(r.window_end)}`
                    : "No data yet"}
                </p>

                <div className="space-y-3 flex-1">
                  {r?.options?.map((label: string, idx: number) => {
                    const votes = r.tally[idx] || 0;
                    const pct = r.total_votes > 0 ? Math.round((votes / r.total_votes) * 100) : 0;
                    return (
                      <div key={idx} className="relative overflow-hidden rounded-xl border border-ink/10 bg-white p-3">
                        <div
                          className="absolute left-0 top-0 bottom-0 bg-marine/10 transition-all duration-700"
                          style={{ width: `${pct}%` }}
                        />
                        <div className="relative z-10 flex items-center justify-between text-xs">
                          <span className="font-bold text-ink">{label}</span>
                          <span className="font-bold text-marine">{pct}% ({votes})</span>
                        </div>
                      </div>
                    );
                  })}
                  {!r && (
                    <div className="py-6 text-center text-xs text-slate bg-sand/60 rounded-xl border border-dashed border-ink/15">
                      No votes recorded for this meal yet today.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {lastUpdated && (
          <p className="text-[10px] text-slate/70 text-center mt-6">
            Last updated {lastUpdated.toLocaleTimeString()} · refreshes automatically every few seconds
          </p>
        )}
      </div>
    </main>
  );
}