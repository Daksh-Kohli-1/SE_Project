"use client";

/*
  Hostel selection (step 1 of allotment) - save as  app/hostels/page.tsx
  and add a "Hostels" link to the Navbar pointing at /hostels.

  Flow: students form/join a group first (/group). Only the group LEADER (or a
  solo student) ranks hostels here; other members see the group's ranking
  read-only. Ranking is editable until the admin-controlled window closes.
  After the admin runs "Allot hostels", this page shows the allotted hostel.
*/

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import api from "@/lib/api";
import Navbar from "@/components/Navbar";

type HostelSummary = { id: string; name: string; gender: string; capacity: number; occupied: number };

function formatRemaining(totalSeconds: number) {
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function HostelSelectionPage() {
  const [status, setStatus] = useState<any>(null);
  const [hostels, setHostels] = useState<HostelSummary[]>([]);
  const [ranking, setRanking] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  async function load() {
    try {
      const [s, h] = await Promise.all([
        api.get("/api/hostels/preference-status"),
        api.get("/api/hostels/for-preferences"),
      ]);
      setStatus(s.data);
      setHostels(h.data);
      setRanking(s.data.ranking || []);
      setDirty(false);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Could not load hostel preferences");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(() => {
      // keep window state / countdown fresh without clobbering unsaved edits
      api.get("/api/hostels/preference-status").then((r) => {
        setStatus(r.data);
      }).catch(() => {});
    }, 60000);
    return () => clearInterval(t);
  }, []);

  const byId = useMemo(() => Object.fromEntries(hostels.map((h) => [h.id, h])), [hostels]);
  const canEdit = !!status?.can_edit;
  const min = status?.min_prefs ?? 5;
  const max = status?.max_prefs ?? 6;
  const state: string = status?.window?.state || "closed";

  function add(id: string) {
    if (!canEdit || ranking.includes(id) || ranking.length >= max) return;
    setRanking([...ranking, id]);
    setDirty(true);
    setSaved(false);
  }
  function remove(id: string) {
    setRanking(ranking.filter((r) => r !== id));
    setDirty(true);
    setSaved(false);
  }
  function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= ranking.length) return;
    const next = [...ranking];
    [next[index], next[j]] = [next[j], next[index]];
    setRanking(next);
    setDirty(true);
    setSaved(false);
  }

  async function submit() {
    setSaving(true);
    setError("");
    try {
      await api.post("/api/hostels/preferences", { hostel_ids: ranking });
      setSaved(true);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Could not save preferences");
    } finally {
      setSaving(false);
    }
  }

  const banner = (() => {
    if (!status) return null;
    if (status.assigned_hostel_id) return null;
    if (state === "open") {
      const left = status.window?.seconds_remaining;
      return {
        tone: "green",
        text: left != null ? `Hostel selection is open — closes in ${formatRemaining(left)}.` : "Hostel selection is open.",
      };
    }
    if (state === "not_started") return { tone: "blue", text: "Hostel selection hasn't opened yet. Use this time to create or join a group." };
    if (state === "closed") return { tone: "orange", text: "Hostel selection is closed. Allotments will be published soon." };
    return null;
  })();

  const toneClass: Record<string, string> = {
    green: "bg-green-500/10 text-green-400 border-green-500/20",
    blue: "bg-blue-500/10 text-blue-300 border-blue-500/20",
    orange: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  };

  return (
    <main className="min-h-screen pb-16 bg-[#0B0B0C]">
      <Navbar active="/hostels" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-3xl sm:text-4xl font-semibold text-white mb-1">Choose your hostel</h1>
        <p className="text-white/60 text-sm sm:text-base mb-6">
          Rank {min === max ? min : `${min}–${max}`} hostels in order of preference. Allotment is by CGPA — your group's
          average CGPA decides who gets a popular hostel first.
        </p>

        {loading && <p className="text-xs text-white/50">Loading…</p>}

        {banner && (
          <div className={`border rounded-xl px-4 py-3 text-sm font-medium mb-6 ${toneClass[banner.tone]}`}>{banner.text}</div>
        )}

        {/* Already allotted */}
        {status?.assigned_hostel_id && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/[0.03] border border-green-500/20 rounded-2xl p-6 mb-6"
          >
            <p className="text-[10px] uppercase font-bold tracking-wider text-white/50">Your allotted hostel</p>
            <p className="text-3xl font-semibold text-green-400 mt-1">{status.assigned_hostel_name}</p>
            <p className="text-xs text-white/60 mt-2">
              Room allotment opens after the admin schedules it. Once it does, rank your preferred clusters and pay the
              hostel fee.
            </p>
          </motion.div>
        )}

        {/* Group context */}
        {status && !status.assigned_hostel_id && (
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-sm text-white/70">
              {status.has_group ? (
                <>
                  Group <span className="font-mono font-semibold text-blue-300">{status.group_code}</span> ·{" "}
                  {status.member_count} member{status.member_count === 1 ? "" : "s"} ·{" "}
                  {status.is_leader ? "You are the group leader" : "Only the group leader can choose hostels"}
                </>
              ) : (
                <>You're not in a group — you'll be allotted as a solo student. Want to team up first?</>
              )}
            </div>
            <Link href="/group" className="text-xs font-bold text-orange-400 hover:text-orange-300 transition-colors">
              {status.has_group ? "Manage group →" : "Create or join a group →"}
            </Link>
          </div>
        )}

        {status && !status.assigned_hostel_id && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Available hostels */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
              <h2 className="text-lg font-semibold text-white mb-1">Available hostels</h2>
              <p className="text-xs text-white/50 mb-4">
                {canEdit ? "Tap a hostel to add it to your ranking." : "Read-only right now."}
              </p>
              <div className="space-y-2">
                {hostels.map((h) => {
                  const rank = ranking.indexOf(h.id);
                  const picked = rank >= 0;
                  return (
                    <button
                      key={h.id}
                      onClick={() => add(h.id)}
                      disabled={!canEdit || picked || ranking.length >= max}
                      className={`w-full text-left flex items-center justify-between rounded-xl border px-4 py-3 transition-colors ${
                        picked
                          ? "border-blue-500/30 bg-blue-500/10"
                          : "border-white/10 bg-white/[0.02] hover:border-blue-500/40 disabled:hover:border-white/10"
                      } disabled:opacity-60`}
                    >
                      <span>
                        <span className="block text-sm font-semibold text-white">{h.name}</span>
                        <span className="block text-[11px] text-white/50">{h.capacity} seats</span>
                      </span>
                      {picked ? (
                        <span className="text-xs font-bold text-blue-300">#{rank + 1}</span>
                      ) : (
                        canEdit && <span className="text-xs font-bold text-white/40">+ Add</span>
                      )}
                    </button>
                  );
                })}
                {hostels.length === 0 && !loading && <p className="text-xs text-white/50">No hostels available.</p>}
              </div>
            </div>

            {/* Ranking */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-lg font-semibold text-white">Your ranking</h2>
                <span className="text-xs text-white/50">
                  {ranking.length}/{max}
                </span>
              </div>
              <p className="text-xs text-white/50 mb-4">#1 is your top choice. Use the arrows to reorder.</p>

              <div className="space-y-2">
                <AnimatePresence initial={false}>
                  {ranking.map((id, i) => (
                    <motion.div
                      key={id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5"
                    >
                      <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <span className="flex-1 text-sm font-semibold text-white">{byId[id]?.name || "Hostel"}</span>
                      {canEdit && (
                        <div className="flex items-center gap-1">
                          <button onClick={() => move(i, -1)} disabled={i === 0} className="px-2 py-1 text-xs text-white/60 hover:text-white disabled:opacity-30">
                            ▲
                          </button>
                          <button onClick={() => move(i, 1)} disabled={i === ranking.length - 1} className="px-2 py-1 text-xs text-white/60 hover:text-white disabled:opacity-30">
                            ▼
                          </button>
                          <button onClick={() => remove(id)} className="px-2 py-1 text-xs text-orange-400 hover:text-orange-300">
                            ✕
                          </button>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
                {ranking.length === 0 && <p className="text-xs text-white/50 py-6 text-center">Nothing ranked yet.</p>}
              </div>

              {canEdit && (
                <div className="mt-5">
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={submit}
                    disabled={saving || ranking.length < min || ranking.length > max || !dirty}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-full shadow-sm transition-colors disabled:opacity-40"
                  >
                    {saving ? "Saving…" : dirty ? "Submit preferences" : "Preferences saved"}
                  </motion.button>
                  {ranking.length < min && (
                    <p className="text-[11px] text-white/50 mt-2">Add at least {min} hostels to submit.</p>
                  )}
                  {saved && <p className="text-xs font-bold text-green-400 mt-2">✓ Saved for your whole group. You can change it until the window closes.</p>}
                </div>
              )}

              {!canEdit && status?.has_group && !status?.is_leader && (
                <p className="text-[11px] text-white/50 mt-4">Your group leader chooses the hostel ranking for everyone.</p>
              )}
            </div>
          </div>
        )}

        {error && <p className="text-xs text-orange-400 font-bold mt-4">{error}</p>}
      </div>
    </main>
  );
}