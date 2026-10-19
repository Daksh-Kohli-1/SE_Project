"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import api from "@/lib/api";
import Navbar from "@/components/Navbar";
import { useHostelAssignment } from "../../lib/useHostelAssignment";
import HostelGate from "../../components/HostelGate";

type MealType = "breakfast" | "lunch" | "dinner";

function formatWindowTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
}

export default function MessCommunityPage() {
  const gate = useHostelAssignment();
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
    if (!gate.allotted) return; // mess data only exists for allotted students
    loadTodayMenu();
  }, [gate.allotted]);

  useEffect(() => {
    if (!gate.allotted) return;
    loadPoll(activeMeal);
    // live-ish refresh while this tab is open
    const interval = setInterval(() => loadPoll(activeMeal), 8000);
    return () => clearInterval(interval);
  }, [activeMeal, gate.allotted]);

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
    <main className="min-h-screen pb-20 bg-[#0B0B0C]">
      <Navbar active="/mess" />

      {gate.loading && <p className="text-xs text-white/50 text-center mt-16">Loading…</p>}

      {!gate.loading && !gate.allotted && (
        <HostelGate what="Mess & Community" windowState={gate.windowState} />
      )}

      {!gate.loading && gate.allotted && (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div>
            <h1 className="text-3xl sm:text-4xl font-semibold text-white mb-1">
              Mess & Community
            </h1>
            <p className="text-white/60 text-sm sm:text-base">
              View today's meals, rate food quality, vote live on how each meal turned out, and check mess analytics.
            </p>
          </div>
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Link
              href="/mess/live"
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-full shadow-sm transition-colors inline-flex items-center gap-2 shrink-0"
            >
              📊 View Live Poll Results
            </Link>
          </motion.div>
        </motion.div>

        {/* Top Grid: Today's Menu + Analytics */}
        <div className="grid lg:grid-cols-3 gap-8 mb-8">
          {/* Today's Detailed Menu — from database, editable by admin */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05, ease: "easeOut" }}
            className="lg:col-span-2 bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🍲</span>
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    {todayMenu?.day_name ? `${todayMenu.day_name}'s` : "Today's"} Mess Schedule
                  </h2>
                  <p className="text-xs text-white/50">Hostel Central Dining Hall</p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-green-500/10 text-green-400 text-xs font-bold">
                ISO 22000 Certified Kitchen
              </span>
            </div>

            {menuLoading && <p className="text-xs text-white/50">Loading menu…</p>}

            {!menuLoading && (
              <div className="grid sm:grid-cols-3 gap-4">
                {(["breakfast", "lunch", "dinner"] as MealType[]).map((meal) => {
                  const items: string[] = todayMenu?.[meal] || [];
                  const meta = mealMeta[meal];
                  const highlight = meal === "lunch";
                  return (
                    <div
                      key={meal}
                      className={`p-4 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col justify-between ${
                        highlight ? "ring-2 ring-blue-500/20" : ""
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-blue-300 uppercase">{meta.label}</span>
                          <span className="text-[10px] text-white/40 font-medium">{meta.time}</span>
                        </div>
                        <ul className="text-xs text-white/70 space-y-1.5 mb-4">
                          {items.length > 0 ? (
                            items.map((item, i) => <li key={i}>• {item}</li>)
                          ) : (
                            <li className="text-white/40">Menu not set for today yet.</li>
                          )}
                        </ul>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>

          {/* Mess Analytics & Stats */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
            className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6 flex flex-col justify-between"
          >
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span>📊</span> Mess Analytics
            </h3>

            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase font-bold text-white/50">Average Food Rating</p>
                  <p className="text-lg font-bold text-white">4.6 / 5.0 ⭐</p>
                </div>
                <span className="text-xs text-green-400 font-bold">Based on 340 reviews</span>
              </div>

              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase font-bold text-white/50">Monthly Meals Attended</p>
                  <p className="text-lg font-bold text-white">26 / 30 Meals</p>
                </div>
                <span className="text-xs text-blue-300 font-bold">86.6% Attendance</span>
              </div>

              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase font-bold text-white/50">Food Waste Reduction</p>
                  <p className="text-lg font-bold text-green-400">-14% Waste</p>
                </div>
                <span className="text-xs text-white/50 font-medium">Eco Campaign</span>
              </div>
            </div>

            <p className="text-[10px] text-white/40 mt-4">
              Biometric attendance sync active at dining hall entrance.
            </p>
          </motion.div>
        </div>

        {/* Middle Grid: Food Feedback + Live Meal Poll */}
        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          {/* Food Feedback Widget */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15, ease: "easeOut" }}
            className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">⭐</span>
              <h3 className="text-lg font-semibold text-white">How was today's food?</h3>
            </div>
            <p className="text-xs text-white/60 mb-4">
              Your feedback directly impacts daily mess preparation and vendor quality audits.
            </p>

            <form onSubmit={submitFeedback} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-white/60 mb-2">Select Rating</label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <motion.button
                      key={star}
                      type="button"
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setRating(star)}
                      className={`w-11 h-11 rounded-xl text-lg font-bold transition-colors flex items-center justify-center ${
                        rating >= star
                          ? "bg-orange-500 text-white shadow-sm"
                          : "bg-white/[0.03] text-white/40 border border-white/10"
                      }`}
                    >
                      ★
                    </motion.button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-white/60 mb-1">Optional Comments / Suggestions</label>
                <textarea
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="e.g. Great spice balance in Rajma, soft rotis..."
                  className="w-full border border-white/15 bg-white/[0.03] text-white placeholder-white/30 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                className="py-3 px-6 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-full shadow-sm transition-colors"
              >
                Submit Food Rating
              </motion.button>

              <AnimatePresence>
                {feedbackSubmitted && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-xs font-bold text-green-400"
                  >
                    ✓ Thank you! Your feedback has been recorded.
                  </motion.p>
                )}
              </AnimatePresence>
            </form>
          </motion.div>

          {/* Live Meal Poll Widget */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2, ease: "easeOut" }}
            className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🗳️</span>
                  <h3 className="text-lg font-semibold text-white">Live Meal Poll</h3>
                </div>
                <span className="text-[10px] font-bold text-blue-300 bg-blue-500/10 px-2.5 py-0.5 rounded-full animate-pulse">
                  ● Live
                </span>
              </div>
              <p className="text-xs text-white/60 mb-4">
                Vote once per meal, per day — see everyone's reaction update live.
              </p>

              {/* Meal selector */}
              <div className="flex gap-2 mb-4">
                {(["breakfast", "lunch", "dinner"] as MealType[]).map((meal) => (
                  <button
                    key={meal}
                    onClick={() => setActiveMeal(meal)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${
                      activeMeal === meal
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white/[0.02] border-white/10 text-white/60 hover:bg-white/5"
                    }`}
                  >
                    {mealMeta[meal].icon} {mealMeta[meal].label}
                  </button>
                ))}
              </div>

              {pollLoading && <p className="text-xs text-white/50 mb-4">Loading poll…</p>}

              {!pollLoading && pollResult && !pollResult.is_open && (
                <div className="mb-4 p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-xs text-white/80">
                  🔒 Voting for {mealMeta[activeMeal].label.toLowerCase()} is closed right now. It opens{" "}
                  <strong className="text-white">{formatWindowTime(pollResult.window_start)} – {formatWindowTime(pollResult.window_end)}</strong>.
                </div>
              )}

              {!pollLoading && pollResult && (
                <div className="space-y-3 mb-4">
                  {pollResult.options.map((label: string, idx: number) => {
                    const votes = pollResult.tally[idx] || 0;
                    const pct = pollResult.total_votes > 0 ? Math.round((votes / pollResult.total_votes) * 100) : 0;
                    const disabled = pollResult.you_voted || voting || !pollResult.is_open;
                    return (
                      <motion.button
                        key={idx}
                        whileHover={!disabled ? { y: -1 } : {}}
                        onClick={() => handleVote(idx)}
                        disabled={disabled}
                        className={`w-full p-3.5 rounded-xl border text-left transition-colors relative overflow-hidden ${
                          disabled
                            ? "border-white/10 bg-white/[0.02] cursor-not-allowed opacity-70"
                            : "border-white/10 bg-white/[0.02] hover:border-blue-500/40"
                        }`}
                      >
                        {pollResult.you_voted && (
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.5, ease: "easeOut" }}
                            className="absolute left-0 top-0 bottom-0 bg-blue-500/15"
                          />
                        )}
                        <div className="relative z-10 flex items-center justify-between text-xs">
                          <span className="font-bold text-white">{label}</span>
                          {pollResult.you_voted && (
                            <span className="font-bold text-blue-300 ml-2">{pct}% ({votes})</span>
                          )}
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              )}

              {voteError && <p className="text-xs text-orange-400 font-semibold mb-2">{voteError}</p>}
            </div>

            {pollResult?.you_voted ? (
              <p className="text-xs font-bold text-green-400">
                ✓ Vote recorded for {mealMeta[activeMeal].label.toLowerCase()} today. Thank you!
              </p>
            ) : pollResult?.is_open ? (
              <p className="text-[11px] text-white/50">Tap an option above to cast your vote for {mealMeta[activeMeal].label.toLowerCase()}.</p>
            ) : (
              <p className="text-[11px] text-white/50">Come back during the voting window to have your say.</p>
            )}
          </motion.div>
        </div>

        {/* Notice Board & Upcoming Holidays */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25, ease: "easeOut" }}
          className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">📢</span>
            <h3 className="text-xl font-semibold text-white">Mess Notice Board & Holidays</h3>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10">
              <span className="text-xs font-bold text-orange-400">Notice #1</span>
              <h4 className="text-xs font-bold text-white mt-1 mb-1">Feast Day Announcement</h4>
              <p className="text-[11px] text-white/60">Special Independence Day dinner scheduled with ice cream counter.</p>
            </div>

            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10">
              <span className="text-xs font-bold text-blue-300">Notice #2</span>
              <h4 className="text-xs font-bold text-white mt-1 mb-1">Rebate Application Window</h4>
              <p className="text-[11px] text-white/60">Mess rebate forms open for students leaving for weekend holidays.</p>
            </div>

            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10">
              <span className="text-xs font-bold text-green-400">Notice #3</span>
              <h4 className="text-xs font-bold text-white mt-1 mb-1">Hygiene Audit Score: 98%</h4>
              <p className="text-[11px] text-white/60">FSSAI food safety inspection completed with top grade certification.</p>
            </div>
          </div>
        </motion.div>
      </div>
      )}
    </main>
  );
}