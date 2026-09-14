"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import Navbar from "@/components/Navbar";

type MealType = "breakfast" | "lunch" | "dinner";

function formatWindowTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
}

export default function MessCommunityPage() {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  const [todayMenu, setTodayMenu] = useState<any>(null);
  const [menuLoading, setMenuLoading] = useState(true);

  const [activeMeal, setActiveMeal] = useState<MealType>("lunch");
  const [pollResult, setPollResult] = useState<any>(null);
  const [pollLoading, setPollLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [voteError, setVoteError] = useState("");

  function loadTodayMenu() {
    setMenuLoading(true);
    api
      .get("/api/services/mess/menu/today")
      .then((r) => setTodayMenu(r.data))
      .catch(() => setTodayMenu(null))
      .finally(() => setMenuLoading(false));
  }

  function loadPoll(meal: MealType) {
    setPollLoading(true);
    api
      .get("/api/services/mess/live-poll/results", { params: { meal_type: meal } })
      .then((r) => setPollResult(r.data))
      .catch(() => setPollResult(null))
      .finally(() => setPollLoading(false));
  }

  useEffect(() => {
    loadTodayMenu();
  }, []);

  useEffect(() => {
    loadPoll(activeMeal);
    // live-ish refresh while this tab is open
    const interval = setInterval(() => loadPoll(activeMeal), 8000);
    return () => clearInterval(interval);
  }, [activeMeal]);

  async function submitFeedback(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/api/services/mess/feedback", { rating, comment });
    } catch {
      // client handle
    }
    setFeedbackSubmitted(true);
    setTimeout(() => setFeedbackSubmitted(false), 4000);
    setComment("");
  }

  async function handleVote(optionIndex: number) {
    setVoting(true);
    setVoteError("");
    try {
      await api.post("/api/services/mess/live-poll/vote", { meal_type: activeMeal, option_index: optionIndex });
      loadPoll(activeMeal);
    } catch (err: any) {
      setVoteError(err?.response?.data?.detail || "Could not record your vote");
      loadPoll(activeMeal); // refresh is_open in case it just closed
    } finally {
      setVoting(false);
    }
  }

  const mealMeta: Record<MealType, { label: string; icon: string; time: string }> = {
    breakfast: { label: "Breakfast", icon: "🍳", time: "7:30 – 9:30 AM" },
    lunch: { label: "Lunch", icon: "🍛", time: "12:00 – 2:00 PM" },
    dinner: { label: "Dinner", icon: "🍽️", time: "7:00 – 9:00 PM" },
  };

  return (
    <main className="min-h-screen pb-20 bg-sand">
      <Navbar active="/mess" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink mb-1">
              Mess & Community
            </h1>
            <p className="text-slate text-sm sm:text-base">
              View today's meals, rate food quality, vote live on how each meal turned out, and check mess analytics.
            </p>
          </div>
          <Link
            href="/mess/live"
            className="px-5 py-2.5 bg-marine hover:bg-ink text-white font-bold text-xs rounded-full shadow-md transition inline-flex items-center gap-2 shrink-0"
          >
            📊 View Live Poll Results
          </Link>
        </div>

        {/* Top Grid: Today's Menu + Analytics */}
        <div className="grid lg:grid-cols-3 gap-8 mb-8">
          {/* Today's Detailed Menu — from database, editable by admin */}
          <div className="lg:col-span-2 nest-card p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🍲</span>
                <div>
                  <h2 className="font-display text-xl font-bold text-ink">
                    {todayMenu?.day_name ? `${todayMenu.day_name}'s` : "Today's"} Mess Schedule
                  </h2>
                  <p className="text-xs text-slate">Hostel Central Dining Hall</p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-moss/10 text-moss text-xs font-bold">
                ISO 22000 Certified Kitchen
              </span>
            </div>

            {menuLoading && <p className="text-xs text-slate">Loading menu…</p>}

            {!menuLoading && (
              <div className="grid sm:grid-cols-3 gap-4">
                {(["breakfast", "lunch", "dinner"] as MealType[]).map((meal) => {
                  const items: string[] = todayMenu?.[meal] || [];
                  const meta = mealMeta[meal];
                  const highlight = meal === "lunch";
                  return (
                    <div
                      key={meal}
                      className={`p-4 rounded-2xl bg-sand/60 border border-ink/5 flex flex-col justify-between ${
                        highlight ? "ring-2 ring-marine/20" : ""
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-marine uppercase">{meta.label}</span>
                          <span className="text-[10px] text-slate font-medium">{meta.time}</span>
                        </div>
                        <ul className="text-xs text-ink/80 space-y-1.5 mb-4">
                          {items.length > 0 ? (
                            items.map((item, i) => <li key={i}>• {item}</li>)
                          ) : (
                            <li className="text-slate">Menu not set for today yet.</li>
                          )}
                        </ul>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Mess Analytics & Stats */}
          <div className="nest-card p-6 flex flex-col justify-between">
            <h3 className="font-display text-lg font-bold text-ink mb-4 flex items-center gap-2">
              <span>📊</span> Mess Analytics
            </h3>

            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-sand/60 border border-ink/5 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate">Average Food Rating</p>
                  <p className="text-lg font-bold text-ink">4.6 / 5.0 ⭐</p>
                </div>
                <span className="text-xs text-moss font-bold">Based on 340 reviews</span>
              </div>

              <div className="p-3.5 rounded-xl bg-sand/60 border border-ink/5 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate">Monthly Meals Attended</p>
                  <p className="text-lg font-bold text-ink">26 / 30 Meals</p>
                </div>
                <span className="text-xs text-marine font-bold">86.6% Attendance</span>
              </div>

              <div className="p-3.5 rounded-xl bg-sand/60 border border-ink/5 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate">Food Waste Reduction</p>
                  <p className="text-lg font-bold text-moss">-14% Waste</p>
                </div>
                <span className="text-xs text-slate font-medium">Eco Campaign</span>
              </div>
            </div>

            <p className="text-[10px] text-slate mt-4">
              Biometric attendance sync active at dining hall entrance.
            </p>
          </div>
        </div>

        {/* Middle Grid: Food Feedback + Live Meal Poll */}
        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          {/* Food Feedback Widget */}
          <div className="nest-card p-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">⭐</span>
              <h3 className="font-display text-lg font-bold text-ink">How was today's food?</h3>
            </div>
            <p className="text-xs text-slate mb-4">
              Your feedback directly impacts daily mess preparation and vendor quality audits.
            </p>

            <form onSubmit={submitFeedback} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate mb-2">Select Rating</label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className={`w-11 h-11 rounded-xl text-lg font-bold transition flex items-center justify-center ${
                        rating >= star
                          ? "bg-amber text-white shadow-xs scale-105"
                          : "bg-sand text-slate border border-ink/10"
                      }`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate mb-1">Optional Comments / Suggestions</label>
                <textarea
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="e.g. Great spice balance in Rajma, soft rotis..."
                  className="w-full border border-ink/15 rounded-xl px-4 py-2.5 text-xs text-ink focus:ring-2 focus:ring-marine"
                />
              </div>

              <button
                type="submit"
                className="py-3 px-6 bg-marine hover:bg-ink text-white font-bold text-xs rounded-full shadow-md transition"
              >
                Submit Food Rating
              </button>

              {feedbackSubmitted && (
                <p className="text-xs font-bold text-moss animate-fadeIn">
                  ✓ Thank you! Your feedback has been recorded.
                </p>
              )}
            </form>
          </div>

          {/* Live Meal Poll Widget */}
          <div className="nest-card p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🗳️</span>
                  <h3 className="font-display text-lg font-bold text-ink">Live Meal Poll</h3>
                </div>
                <span className="text-[10px] font-bold text-marine bg-marine/10 px-2.5 py-0.5 rounded-full animate-pulse">
                  ● Live
                </span>
              </div>
              <p className="text-xs text-slate mb-4">
                Vote once per meal, per day — see everyone's reaction update live.
              </p>

              {/* Meal selector */}
              <div className="flex gap-2 mb-4">
                {(["breakfast", "lunch", "dinner"] as MealType[]).map((meal) => (
                  <button
                    key={meal}
                    onClick={() => setActiveMeal(meal)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${
                      activeMeal === meal
                        ? "bg-marine text-white border-marine"
                        : "bg-white border-ink/10 text-slate hover:bg-sand"
                    }`}
                  >
                    {mealMeta[meal].icon} {mealMeta[meal].label}
                  </button>
                ))}
              </div>

              {pollLoading && <p className="text-xs text-slate mb-4">Loading poll…</p>}

              {!pollLoading && pollResult && !pollResult.is_open && (
                <div className="mb-4 p-3 rounded-xl bg-amber/10 border border-amber/20 text-xs text-ink">
                  🔒 Voting for {mealMeta[activeMeal].label.toLowerCase()} is closed right now. It opens{" "}
                  <strong>{formatWindowTime(pollResult.window_start)} – {formatWindowTime(pollResult.window_end)}</strong>.
                </div>
              )}

              {!pollLoading && pollResult && (
                <div className="space-y-3 mb-4">
                  {pollResult.options.map((label: string, idx: number) => {
                    const votes = pollResult.tally[idx] || 0;
                    const pct = pollResult.total_votes > 0 ? Math.round((votes / pollResult.total_votes) * 100) : 0;
                    const disabled = pollResult.you_voted || voting || !pollResult.is_open;
                    return (
                      <button
                        key={idx}
                        onClick={() => handleVote(idx)}
                        disabled={disabled}
                        className={`w-full p-3.5 rounded-xl border text-left transition relative overflow-hidden ${
                          disabled
                            ? "border-ink/10 bg-white cursor-not-allowed opacity-70"
                            : "border-ink/10 bg-white hover:border-marine/40"
                        }`}
                      >
                        {pollResult.you_voted && (
                          <div
                            className="absolute left-0 top-0 bottom-0 bg-marine/10 transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        )}
                        <div className="relative z-10 flex items-center justify-between text-xs">
                          <span className="font-bold text-ink">{label}</span>
                          {pollResult.you_voted && (
                            <span className="font-bold text-marine ml-2">{pct}% ({votes})</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {voteError && <p className="text-xs text-coral font-semibold mb-2">{voteError}</p>}
            </div>

            {pollResult?.you_voted ? (
              <p className="text-xs font-bold text-moss">
                ✓ Vote recorded for {mealMeta[activeMeal].label.toLowerCase()} today. Thank you!
              </p>
            ) : pollResult?.is_open ? (
              <p className="text-[11px] text-slate">Tap an option above to cast your vote for {mealMeta[activeMeal].label.toLowerCase()}.</p>
            ) : (
              <p className="text-[11px] text-slate">Come back during the voting window to have your say.</p>
            )}
          </div>
        </div>

        {/* Notice Board & Upcoming Holidays */}
        <div className="nest-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">📢</span>
            <h3 className="font-display text-xl font-bold text-ink">Mess Notice Board & Holidays</h3>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-sand/60 border border-ink/5">
              <span className="text-xs font-bold text-coral">Notice #1</span>
              <h4 className="text-xs font-bold text-ink mt-1 mb-1">Feast Day Announcement</h4>
              <p className="text-[11px] text-slate">Special Independence Day dinner scheduled with ice cream counter.</p>
            </div>

            <div className="p-4 rounded-xl bg-sand/60 border border-ink/5">
              <span className="text-xs font-bold text-marine">Notice #2</span>
              <h4 className="text-xs font-bold text-ink mt-1 mb-1">Rebate Application Window</h4>
              <p className="text-[11px] text-slate">Mess rebate forms open for students leaving for weekend holidays.</p>
            </div>

            <div className="p-4 rounded-xl bg-sand/60 border border-ink/5">
              <span className="text-xs font-bold text-moss">Notice #3</span>
              <h4 className="text-xs font-bold text-ink mt-1 mb-1">Hygiene Audit Score: 98%</h4>
              <p className="text-[11px] text-slate">FSSAI food safety inspection completed with top grade certification.</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}