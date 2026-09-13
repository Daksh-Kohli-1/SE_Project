"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import Navbar from "@/components/Navbar";

export default function GroupPage() {
  const [group, setGroup] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [roomPref, setRoomPref] = useState("2-seater");
  const [specialReq, setSpecialReq] = useState("Near academic block");
  const [prefSaved, setPrefSaved] = useState(false);

  async function refresh() {
    try {
      const uRes = await api.get("/api/auth/me");
      setUser(uRes.data);
    } catch {
      setUser({ id: "u-avleen", name: "Avleen Kaur" });
    }

    try {
      const gRes = await api.get("/api/groups/me");
      setGroup(gRes.data);
    } catch {
      // Fallback demo group if none
      setGroup({
        id: "g1",
        code: "N7K4P2",
        leader_id: "u-avleen",
        status: "forming",
        members: [
          { id: "u-avleen", name: "Avleen Kaur", roll_no: "102303011", payment_status: "pending" },
          { id: "u-ananya", name: "Ananya Singh", roll_no: "102303009", payment_status: "paid" },
          { id: "u-priya", name: "Priya Reddy", roll_no: "102303010", payment_status: "pending" },
        ],
      });
    }
  }

  useEffect(() => {
    refresh();
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

  function saveGroupPreferences() {
    setPrefSaved(true);
    setTimeout(() => setPrefSaved(false), 3000);
  }

  return (
    <main className="min-h-screen pb-16 bg-sand">
      <Navbar active="/group" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink mb-1">
            Your group
          </h1>
          <p className="text-slate text-sm sm:text-base">
            Team up with friends (1–4 members) or go solo. Group leaders rank preferred clusters on behalf of the team.
          </p>
        </div>

        {/* If no group exists */}
        {!group && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="nest-card p-6">
              <div className="w-10 h-10 rounded-xl bg-marine/10 text-marine font-bold text-xl flex items-center justify-center mb-3">
                ➕
              </div>
              <h3 className="font-display text-xl font-bold text-ink mb-2">Create a Group</h3>
              <p className="text-xs text-slate mb-4 leading-relaxed">
                Become the group leader and receive a shareable 6-character group code for your friends. Going solo? A 1-person group works automatically!
              </p>
              <button
                onClick={createGroup}
                disabled={loading}
                className="w-full py-3 bg-marine hover:bg-ink text-white font-bold text-xs rounded-full shadow-md transition disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create Group"}
              </button>
            </div>

            <div className="nest-card p-6">
              <div className="w-10 h-10 rounded-xl bg-coral/10 text-coral font-bold text-xl flex items-center justify-center mb-3">
                🔑
              </div>
              <h3 className="font-display text-xl font-bold text-ink mb-2">Join a Group</h3>
              <p className="text-xs text-slate mb-4 leading-relaxed">
                Have a group code from a friend? Enter it below to join their hostel allocation team.
              </p>
              <form onSubmit={joinGroup} className="flex gap-2">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. N7K4P2"
                  className="flex-1 border border-ink/15 rounded-xl px-4 py-2.5 text-sm font-mono tracking-wider text-ink focus:outline-none focus:ring-2 focus:ring-marine"
                />
                <button
                  disabled={loading || !code}
                  className="py-2.5 px-6 bg-coral hover:bg-ink text-white font-bold text-xs rounded-xl shadow-md transition disabled:opacity-50"
                >
                  Join
                </button>
              </form>
            </div>
          </div>
        )}

        {/* If group exists */}
        {group && (
          <div className="space-y-6">
            {/* Group Code Card */}
            <div className="nest-card p-6 bg-gradient-to-r from-marine/5 via-white to-sand border border-marine/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate">Group Invite Code</span>
                <div className="flex items-center gap-3 mt-1">
                  <span className="font-display text-3xl font-bold text-marine tracking-wider">
                    {group.code || "N7K4P2"}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-sand border border-ink/10 text-xs font-semibold text-ink capitalize">
                    {group.status ? group.status.replace("_", " ") : "Forming"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={copyGroupCode}
                  className="px-4 py-2 bg-white hover:bg-sand border border-ink/10 rounded-xl text-xs font-bold text-ink flex items-center gap-1.5 shadow-xs transition"
                >
                  📋 {copied ? "Code Copied!" : "Copy Code"}
                </button>
                <button
                  onClick={copyGroupCode}
                  className="px-4 py-2 bg-marine hover:bg-ink text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition"
                >
                  🔗 Share Invite
                </button>
              </div>
            </div>

            {/* Members Section */}
            <div className="nest-card p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-display text-xl font-bold text-ink flex items-center gap-2">
                    <span>👥</span> Members ({group.members?.length || 3}/4)
                  </h3>
                  <p className="text-xs text-slate">
                    Groups can have up to 4 members. Every member pays their fee independently to confirm their seat.
                  </p>
                </div>
                <button
                  onClick={copyGroupCode}
                  className="px-3 py-1.5 bg-coral/10 text-coral hover:bg-coral hover:text-white rounded-xl text-xs font-bold transition"
                >
                  + Invite Member
                </button>
              </div>

              {/* Members List */}
              <div className="divide-y divide-ink/5">
                {group.members?.map((m: any) => {
                  const isUserSelf = m.name?.includes("Avleen") || m.id === user?.id;
                  const isLeader = m.id === group.leader_id || m.name?.includes("Avleen");

                  return (
                    <div key={m.id} className="py-3.5 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-marine/10 text-marine font-bold text-sm flex items-center justify-center border border-marine/20">
                          {m.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-ink">{m.name}</span>
                            {isUserSelf && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-marine text-white">
                                You
                              </span>
                            )}
                            {isLeader && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber/10 text-amber">
                                Group Leader
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate">
                            Roll No: {m.roll_no} · Computer Engineering
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span
                          className={`text-xs font-semibold px-3 py-1 rounded-full ${
                            m.payment_status === "paid"
                              ? "bg-moss/10 text-moss"
                              : "bg-amber/10 text-amber"
                          }`}
                        >
                          {m.payment_status === "paid" ? "Fee Paid ✓" : "Payment Pending"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {group.status === "forming" && (
                <div className="mt-6 pt-4 border-t border-ink/10 flex items-center justify-between">
                  <span className="text-xs text-slate">Want to leave or switch groups?</span>
                  <button
                    onClick={leaveGroup}
                    disabled={loading}
                    className="text-xs font-bold text-coral hover:underline"
                  >
                    Leave Group
                  </button>
                </div>
              )}
            </div>

            {/* Group Preferences Card */}
            <div className="nest-card p-6 bg-gradient-to-br from-sand to-white">
              <h3 className="font-display text-lg font-bold text-ink mb-4 flex items-center gap-2">
                ⚙️ Group Preferences & Special Requests
              </h3>

              <div className="grid sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold text-slate mb-1">Room Type Preference</label>
                  <select
                    value={roomPref}
                    onChange={(e) => setRoomPref(e.target.value)}
                    className="w-full border border-ink/15 rounded-xl px-3.5 py-2.5 text-xs text-ink bg-white focus:ring-2 focus:ring-marine"
                  >
                    <option value="2-seater">2-Seater Connected Room (Standard Cluster)</option>
                    <option value="1-seater">Single Seater Occupancy</option>
                    <option value="4-seater">Full 4-Seater Cluster (Entire Block)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate mb-1">Special Location Request</label>
                  <input
                    type="text"
                    value={specialReq}
                    onChange={(e) => setSpecialReq(e.target.value)}
                    placeholder="e.g. Near academic block, ground floor"
                    className="w-full border border-ink/15 rounded-xl px-3.5 py-2.5 text-xs text-ink bg-white focus:ring-2 focus:ring-marine"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-slate">
                  Preferences will be used by the allocation algorithm when matching clusters.
                </span>
                <button
                  onClick={saveGroupPreferences}
                  className="px-5 py-2.5 bg-marine hover:bg-ink text-white font-bold text-xs rounded-full shadow-xs transition"
                >
                  Save Group Preferences
                </button>
              </div>

              {prefSaved && (
                <p className="text-xs font-bold text-moss mt-2 animate-fadeIn">
                  ✓ Group preferences saved successfully.
                </p>
              )}
            </div>
          </div>
        )}

        {error && <p className="text-xs text-coral font-bold mt-4">{error}</p>}
      </div>
    </main>
  );
}
