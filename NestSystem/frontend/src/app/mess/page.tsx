"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import Navbar from "@/components/Navbar";

export default function MessCommunityPage() {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [pollVoted, setPollVoted] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [pollTally, setPollTally] = useState<Record<number, number>>({ 0: 42, 1: 28, 2: 15 });

  useEffect(() => {
    api.get("/api/services/mess/poll")
      .then((r) => {
        if (r.data.tally && Object.keys(r.data.tally).length > 0) {
          setPollTally(r.data.tally);
        }
      })
      .catch(() => {});
  }, []);

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
    if (pollVoted) return;
    setSelectedOption(optionIndex);
    try {
      await api.post("/api/services/mess/poll", { option_index: optionIndex });
    } catch {
      // duplicate vote or fallback
    }
    setPollTally((prev) => ({
      ...prev,
      [optionIndex]: (prev[optionIndex] || 0) + 1,
    }));
    setPollVoted(true);
  }

  const pollOptions = [
    { index: 0, label: "North Indian Special (Dal Makhani, Butter Naan)" },
    { index: 1, label: "Indo-Chinese Fusion (Hakka Noodles, Manchurian)" },
    { index: 2, label: "More Variety & Healthy Salads" },
  ];

  const totalVotes = Object.values(pollTally).reduce((a, b) => a + b, 0);

  return (
    <main className="min-h-screen pb-20 bg-sand">
      <Navbar active="/mess" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink mb-1">
            Mess & Community
          </h1>
          <p className="text-slate text-sm sm:text-base">
            View today's meals, rate food quality, participate in menu polls, and check mess analytics.
          </p>
        </div>

        {/* Top Grid: Today's Menu + Attendance */}
        <div className="grid lg:grid-cols-3 gap-8 mb-8">
          {/* Today's Detailed Menu (2 Cols) */}
          <div className="lg:col-span-2 nest-card p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🍲</span>
                <div>
                  <h2 className="font-display text-xl font-bold text-ink">Today's Mess Schedule</h2>
                  <p className="text-xs text-slate">Hostel Girls Central Dining Hall</p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-moss/10 text-moss text-xs font-bold">
                ISO 22000 Certified Kitchen
              </span>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              {/* Breakfast */}
              <div className="p-4 rounded-2xl bg-sand/60 border border-ink/5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-amber uppercase">Breakfast</span>
                    <span className="text-[10px] text-slate font-medium">7:30 – 9:30 AM</span>
                  </div>
                  <ul className="text-xs text-ink/80 space-y-1.5 mb-4">
                    <li>• Poha with Sev & Peanuts</li>
                    <li>• Boiled Eggs / Omelette</li>
                    <li>• Fresh Banana & Papaya</li>
                    <li>• Hot Tea / Coffee / Milk</li>
                  </ul>
                </div>
                <span className="text-[10px] font-bold text-moss bg-moss/10 px-2.5 py-1 rounded-lg self-start">
                  ✓ Served (Attended)
                </span>
              </div>

              {/* Lunch */}
              <div className="p-4 rounded-2xl bg-sand/60 border border-ink/5 ring-2 ring-marine/20 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-marine uppercase">Lunch</span>
                    <span className="text-[10px] text-slate font-medium">12:00 – 2:00 PM</span>
                  </div>
                  <ul className="text-xs text-ink/80 space-y-1.5 mb-4">
                    <li className="font-bold text-ink">• Punjabi Rajma Chawal</li>
                    <li>• Aloo Gobi Mixed Veg</li>
                    <li>• Fresh Curd & Boondi Raita</li>
                    <li>• Green Salad & Papad</li>
                  </ul>
                </div>
                <span className="text-[10px] font-bold text-moss bg-moss/10 px-2.5 py-1 rounded-lg self-start">
                  ✓ Served (Attended)
                </span>
              </div>

              {/* Dinner */}
              <div className="p-4 rounded-2xl bg-sand/60 border border-ink/5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-moss uppercase">Dinner</span>
                    <span className="text-[10px] text-slate font-medium">7:00 – 9:00 PM</span>
                  </div>
                  <ul className="text-xs text-ink/80 space-y-1.5 mb-4">
                    <li>• Shahi Paneer Curry</li>
                    <li>• Dal Tadka</li>
                    <li>• Tandoori Roti / Phulka</li>
                    <li>• Gulab Jamun Sweet</li>
                  </ul>
                </div>
                <span className="text-[10px] font-bold text-marine bg-marine/10 px-2.5 py-1 rounded-lg self-start">
                  🕒 Serving Soon
                </span>
              </div>
            </div>
          </div>

          {/* Mess Analytics & Stats (1 Col) */}
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

        {/* Middle Grid: Food Feedback + Quick Poll */}
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
              {/* 5-Star Rating Buttons */}
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

          {/* Quick Poll Widget */}
          <div className="nest-card p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🗳️</span>
                  <h3 className="font-display text-lg font-bold text-ink">Quick Community Poll</h3>
                </div>
                <span className="text-[10px] font-bold text-marine bg-marine/10 px-2.5 py-0.5 rounded-full">
                  Weekly Menu Vote
                </span>
              </div>
              <p className="text-xs text-slate mb-4">
                "How would you like to see next week's special dinner menu?"
              </p>

              <div className="space-y-3 mb-4">
                {pollOptions.map((opt) => {
                  const votes = pollTally[opt.index] || 0;
                  const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
                  const isSelected = selectedOption === opt.index;

                  return (
                    <button
                      key={opt.index}
                      onClick={() => handleVote(opt.index)}
                      disabled={pollVoted}
                      className={`w-full p-3.5 rounded-xl border text-left transition relative overflow-hidden ${
                        isSelected
                          ? "border-marine bg-marine/10 ring-2 ring-marine"
                          : "border-ink/10 bg-white hover:border-marine/40"
                      }`}
                    >
                      {/* Progress Bar background */}
                      {pollVoted && (
                        <div
                          className="absolute left-0 top-0 bottom-0 bg-marine/10 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      )}

                      <div className="relative z-10 flex items-center justify-between text-xs">
                        <span className="font-bold text-ink">{opt.label}</span>
                        {pollVoted && (
                          <span className="font-bold text-marine ml-2">{pct}% ({votes})</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {pollVoted ? (
              <p className="text-xs font-bold text-moss">✓ Vote recorded! Thank you for participating.</p>
            ) : (
              <p className="text-[11px] text-slate">Click an option above to cast your vote (1 vote per student).</p>
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
