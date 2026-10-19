"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import api from "@/lib/api";
import Navbar from "@/components/Navbar";

export default function GroupPage() {
  const [group, setGroup] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [hostelStatus, setHostelStatus] = useState<any>(null);

  async function refresh() {
    try {
      const uRes = await api.get("/api/auth/me");
      setUser(uRes.data);
    } catch {
      setUser(null);
    }

    try {
      const gRes = await api.get("/api/groups/me");
      setGroup(gRes.data);
    } catch {
      // No group yet (404) — this is the normal, expected state for a new user.
      setGroup(null);
    }

    try {
      const hRes = await api.get("/api/hostels/preference-status");
      setHostelStatus(hRes.data);
    } catch {
      setHostelStatus(null);
    }
  }

  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, []);

  function copyGroupCode() {
    if (group?.code) {
      navigator.clipboard.writeText(group.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function createGroup() {
    setLoading(true);
    setError("");
    try {
      await api.post("/api/groups/create");
      await refresh();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Could not create group");
    } finally {
      setLoading(false);
    }
  }

  async function joinGroup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.post("/api/groups/join", { code });
      await refresh();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Could not join group");
    } finally {
      setLoading(false);
    }
  }

  async function leaveGroup() {
    setLoading(true);
    try {
      await api.delete("/api/groups/leave");
      await refresh();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Could not leave group");
    } finally {
      setLoading(false);
    }
  }

  const fadeUp = {
    hidden: { opacity: 0, y: 16 },
    show: (i: number = 0) => ({
      opacity: 1,
      y: 0,
      transition: { duration: 0.4, delay: i * 0.08, ease: "easeOut" as const },
    }),
  };

  return (
    <main className="min-h-screen pb-16 bg-[#0B0B0C]">
      <Navbar active="/group" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <motion.div initial="hidden" animate="show" custom={0} variants={fadeUp} className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-semibold text-white mb-1">
            Your group
          </h1>
          <p className="text-white/60 text-sm sm:text-base">
            Team up with friends (1–4 members) or go solo. The group leader ranks preferred hostels on behalf of the whole team — allotment is by the group&apos;s average CGPA.
          </p>
        </motion.div>

        {loading && <p className="text-xs text-white/50 mb-4">Loading…</p>}

        {/* If no group exists */}
        {!loading && !group && (
          <div className="grid md:grid-cols-2 gap-6">
            <motion.div
              initial="hidden"
              animate="show"
              custom={1}
              variants={fadeUp}
              className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-300 font-bold text-xl flex items-center justify-center mb-3">
                ➕
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Create a Group</h3>
              <p className="text-xs text-white/60 mb-4 leading-relaxed">
                Become the group leader and receive a shareable 6-character group code for your friends. Going solo? A 1-person group works automatically!
              </p>
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={createGroup}
                disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-full shadow-sm transition-colors disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create Group"}
              </motion.button>
            </motion.div>

            <motion.div
              initial="hidden"
              animate="show"
              custom={2}
              variants={fadeUp}
              className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6"
            >
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-400 font-bold text-xl flex items-center justify-center mb-3">
                🔑
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Join a Group</h3>
              <p className="text-xs text-white/60 mb-4 leading-relaxed">
                Have a group code from a friend? Enter it below to join their hostel allocation team.
              </p>
              <form onSubmit={joinGroup} className="flex gap-2">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. N7K4P2"
                  className="flex-1 border border-white/15 bg-white/[0.03] rounded-xl px-4 py-2.5 text-sm font-mono tracking-wider text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={loading || !code}
                  className="py-2.5 px-6 bg-orange-500 hover:bg-orange-400 text-white font-bold text-xs rounded-xl shadow-sm transition-colors disabled:opacity-50"
                >
                  Join
                </motion.button>
              </form>
            </motion.div>
          </div>
        )}

        {/* If group exists */}
        {!loading && group && (
          <div className="space-y-6">
            {/* Group Code Card */}
            <motion.div
              initial="hidden"
              animate="show"
              custom={1}
              variants={fadeUp}
              className="bg-white/[0.03] border border-blue-500/20 rounded-2xl shadow-sm p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            >
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-white/50">Group Invite Code</span>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-3xl font-semibold text-blue-300 tracking-wider">
                    {group.code}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-semibold text-white capitalize">
                    {group.status ? group.status.replace("_", " ") : "Forming"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={copyGroupCode}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  📋 {copied ? "Code Copied!" : "Copy Code"}
                </button>
                <button
                  onClick={copyGroupCode}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  🔗 Share Invite
                </button>
              </div>
            </motion.div>

            {/* Members Section */}
            <motion.div
              initial="hidden"
              animate="show"
              custom={2}
              variants={fadeUp}
              className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                    <span>👥</span> Members ({group.members?.length || 0}/4)
                  </h3>
                  <p className="text-xs text-white/50">
                    Groups can have up to 4 members. Every member pays their fee independently to confirm their seat.
                  </p>
                </div>
                <button
                  onClick={copyGroupCode}
                  className="px-3 py-1.5 bg-orange-500/10 text-orange-400 hover:bg-orange-500 hover:text-white rounded-xl text-xs font-bold transition-colors"
                >
                  + Invite Member
                </button>
              </div>

              {/* Members List */}
              <div className="divide-y divide-white/10">
                {group.members?.map((m: any, i: number) => {
                  const isUserSelf = m.id === user?.id;
                  const isLeader = m.id === group.leader_id;

                  return (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.06 }}
                      className="py-3.5 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-300 font-bold text-sm flex items-center justify-center border border-blue-500/20">
                          {m.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-white">{m.name}</span>
                            {isUserSelf && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white">
                                You
                              </span>
                            )}
                            {isLeader && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400">
                                Group Leader
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-white/50">Roll No: {m.roll_no}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span
                          className={`text-xs font-semibold px-3 py-1 rounded-full ${
                            m.payment_status === "paid"
                              ? "bg-green-500/10 text-green-400"
                              : "bg-orange-500/10 text-orange-400"
                          }`}
                        >
                          {m.payment_status === "paid" ? "Fee Paid ✓" : "Payment Pending"}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {group.status === "forming" && (
                <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
                  <span className="text-xs text-white/50">Want to leave or switch groups?</span>
                  <button
                    onClick={leaveGroup}
                    disabled={loading}
                    className="text-xs font-bold text-orange-400 hover:text-orange-300 transition-colors"
                  >
                    Leave Group
                  </button>
                </div>
              )}
            </motion.div>

            {/* Hostel preference card */}
            <motion.div
              initial="hidden"
              animate="show"
              custom={3}
              variants={fadeUp}
              className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6"
            >
              <h3 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">🏠 Hostel preference</h3>

              {hostelStatus?.assigned_hostel_id ? (
                <p className="text-sm text-white/70 mt-2">
                  Your group was allotted{" "}
                  <span className="font-semibold text-green-400">{hostelStatus.assigned_hostel_name}</span>.
                </p>
              ) : (
                <>
                  <p className="text-xs text-white/60 mb-4">
                    {hostelStatus?.window?.state === "open"
                      ? "Hostel selection is open."
                      : hostelStatus?.window?.state === "not_started"
                      ? "Hostel selection hasn't opened yet."
                      : "Hostel selection is closed — group changes are frozen until allotment is done."}{" "}
                    {hostelStatus?.ranking?.length
                      ? `Your group has ranked ${hostelStatus.ranking.length} hostels.`
                      : "No hostels ranked yet."}
                  </p>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-white/50">
                      {hostelStatus?.is_leader
                        ? "As group leader, you choose the ranking for everyone."
                        : "Only the group leader can choose hostels."}
                    </span>
                    <Link
                      href="/hostels"
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-full shadow-sm transition-colors"
                    >
                      {hostelStatus?.is_leader ? "Choose hostels" : "View ranking"}
                    </Link>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}

        {error && <p className="text-xs text-orange-400 font-bold mt-4">{error}</p>}
      </div>
    </main>
  );
}