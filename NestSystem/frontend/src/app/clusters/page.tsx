"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "@/lib/api";
import Navbar from "@/components/Navbar";

export default function ClustersPage() {
  const [hostels, setHostels] = useState<any[]>([]);
  const [activeHostel, setActiveHostel] = useState(0);
  const [activeFloor, setActiveFloor] = useState(2); // Floor 3 default for Avleen (0-indexed 2)
  const [selected, setSelected] = useState<string[]>([]); // ranked cluster ids
  const [selectedRoom, setSelectedRoom] = useState<any>(null);
  const [group, setGroup] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/hostels").then((r) => {
      setHostels(r.data);
      // Auto-select Girls hostel if found
      const girlsIdx = r.data.findIndex((h: any) => h.gender === "female");
      if (girlsIdx !== -1) setActiveHostel(girlsIdx);
    }).catch(() => {});

    api.get("/api/groups/me").then((r) => setGroup(r.data)).catch(() => setGroup(null));
  }, []);

  const hostel = hostels[activeHostel];
  const floor = hostel?.floors?.[activeFloor];

  function toggleCluster(clusterId: string) {
    setSelected((prev) => {
      if (prev.includes(clusterId)) return prev.filter((c) => c !== clusterId);
      if (prev.length >= 5) return prev;
      return [...prev, clusterId];
    });
  }

  function movePreference(index: number, direction: "up" | "down") {
    if ((direction === "up" && index === 0) || (direction === "down" && index === selected.length - 1)) {
      return;
    }
    const next = [...selected];
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    const temp = next[index];
    next[index] = next[targetIdx];
    next[targetIdx] = temp;
    setSelected(next);
  }

  async function submitPreferences() {
    setError("");
    if (selected.length < 3) {
      setError("Please rank at least 3 clusters before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const preferences = selected.map((cluster_id, idx) => ({ cluster_id, rank: idx + 1 }));
      const r = await api.post("/api/booking/preferences", { preferences });
      setResult(r.data);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Could not submit preferences");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen pb-20 bg-[#0B0B0C]">
      <Navbar active="/clusters" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div>
            <h1 className="text-3xl sm:text-4xl font-semibold text-white mb-1">
              Cluster map
            </h1>
            <p className="text-white/60 text-sm sm:text-base">
              Browse hostel floors, check availability, inspect room amenities, and rank your preferred clusters.
            </p>
          </div>

          {/* Legend */}
          <div className="bg-white/[0.03] rounded-2xl p-3 px-4 border border-white/10 shadow-sm flex items-center gap-4 text-xs font-semibold">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
              <span className="text-white">Available (0/4)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-orange-400 inline-block" />
              <span className="text-white">Almost Full (1-3/4)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
              <span className="text-white">Full (4/4)</span>
            </div>
          </div>
        </motion.div>

        {/* Hostel Selector Tabs */}
        {hostels.length > 0 && (
          <div className="mb-6 space-y-3">
            {/* <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate shrink-0 mr-2">Hostel:</span>
              {hostels.map((h, i) => (
                <button
                  key={h.id}
                  onClick={() => { setActiveHostel(i); setActiveFloor(0); }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border transition shrink-0 ${
                    activeHostel === i
                      ? "bg-marine text-white border-marine shadow-xs"
                      : "bg-white border-ink/10 text-slate hover:bg-sand hover:text-ink"
                  }`}
                >
                  🏢 {h.name} ({h.gender})
                </button>
              ))}
            </div> */}

            {/* Floor Selector Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-white/50 shrink-0 mr-2">Floor:</span>
              {hostel?.floors?.map((f: any, i: number) => (
                <button
                  key={f.id}
                  onClick={() => setActiveFloor(i)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-colors shrink-0 ${
                    activeFloor === i
                      ? "bg-orange-500 text-white border-orange-500 shadow-sm"
                      : "bg-white/[0.03] border-white/10 text-white/60 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  Floor {f.floor_number}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Main Grid: Room Map + Details / Ranking Sidebar */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left 2 Cols: Floor Room Map */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-white">
                    {hostel?.name || "Thapar Hostel"} — Floor {floor?.floor_number || 3} Plan
                  </h3>
                  <p className="text-xs text-white/50">
                    Click a cluster card to add it to your ranked preferences (pick 3 to 5). Click an individual room to inspect amenities.
                  </p>
                </div>
                <span className="text-xs font-bold text-blue-300 px-3 py-1 bg-blue-500/10 rounded-full">
                  {floor?.clusters?.length || 29} Clusters / 58 Rooms
                </span>
              </div>

              {/* Room Cards Layout (Floor Plan Style) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[560px] overflow-y-auto pr-1">
                {floor?.clusters?.map((c: any, ci: number) => {
                  const rankIdx = selected.indexOf(c.id);
                  const isFullyBooked = c.state === "full";
                  const isSelectedForPref = rankIdx !== -1;

                  let borderBadgeClass = "border-green-500/30 bg-green-500/5";
                  if (c.state === "partial") borderBadgeClass = "border-orange-400/30 bg-orange-400/5";
                  if (c.state === "full") borderBadgeClass = "border-red-500/30 bg-red-500/5 opacity-60";

                  return (
                    <motion.div
                      key={c.id}
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.25, delay: Math.min(ci * 0.01, 0.4) }}
                      className={`relative bg-white/[0.03] border-2 rounded-2xl p-3 transition-colors ${borderBadgeClass} ${
                        isSelectedForPref ? "ring-2 ring-blue-500 border-blue-500 shadow-md scale-[1.02]" : ""
                      }`}
                    >
                      {/* Preference Rank Badge */}
                      {isSelectedForPref && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 400, damping: 15 }}
                          className="absolute -top-2.5 -right-2.5 bg-blue-600 text-white text-xs w-6 h-6 rounded-full flex items-center justify-center font-bold shadow-md z-10"
                        >
                          {rankIdx + 1}
                        </motion.span>
                      )}

                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-white">
                          Cluster {c.cluster_number}
                        </span>
                        <button
                          onClick={() => toggleCluster(c.id)}
                          disabled={isFullyBooked && !isSelectedForPref}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md transition-colors ${
                            isSelectedForPref
                              ? "bg-blue-600 text-white"
                              : "bg-white/5 hover:bg-blue-600 hover:text-white text-white/60"
                          }`}
                        >
                          {isSelectedForPref ? "Ranked" : "+ Rank"}
                        </button>
                      </div>

                      {/* Rooms inside cluster */}
                      <div className="grid grid-cols-2 gap-1.5">
                        {c.rooms.map((r: any) => {
                          const isRoomSelected = selectedRoom?.id === r.id;
                          return (
                            <button
                              key={r.id}
                              onClick={() =>
                                setSelectedRoom({
                                  ...r,
                                  cluster_number: c.cluster_number,
                                  floor_number: floor?.floor_number,
                                  hostel_name: hostel?.name,
                                })
                              }
                              className={`p-2 rounded-xl text-center border transition-colors ${
                                isRoomSelected
                                  ? "border-blue-500 bg-blue-500/10 ring-2 ring-blue-500"
                                  : "border-white/10 bg-white/[0.02] hover:border-blue-500/40"
                              }`}
                            >
                              <p className="text-xs font-bold text-white">
                                C-{r.room_number}
                              </p>
                              <p className="text-[10px] text-white/50 font-medium">
                                {r.occupied_count}/{r.capacity} beds
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Room Details Card / Drawer */}
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedRoom?.id || "default"}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🛏️</span>
                    <h3 className="text-lg font-semibold text-white">
                      Room Details — {selectedRoom ? `C-${selectedRoom.room_number}` : "C-312"}
                    </h3>
                  </div>
                  <span className="text-xs font-bold px-3 py-1 bg-green-500/10 text-green-400 rounded-full">
                    {selectedRoom ? `${selectedRoom.capacity - selectedRoom.occupied_count} seat(s) available` : "Available"}
                  </span>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                  <div className="bg-white/[0.02] p-3 rounded-xl border border-white/10">
                    <p className="text-[10px] uppercase font-bold text-white/50">Block & Floor</p>
                    <p className="text-sm font-bold text-white">
                      Block C · Floor {selectedRoom?.floor_number || 3}
                    </p>
                  </div>
                  <div className="bg-white/[0.02] p-3 rounded-xl border border-white/10">
                    <p className="text-[10px] uppercase font-bold text-white/50">Occupancy</p>
                    <p className="text-sm font-bold text-white">
                      {selectedRoom ? `${selectedRoom.occupied_count} / ${selectedRoom.capacity}` : "1 / 2 Occupied"}
                    </p>
                  </div>
                  <div className="bg-white/[0.02] p-3 rounded-xl border border-white/10">
                    <p className="text-[10px] uppercase font-bold text-white/50">Hostel</p>
                    <p className="text-sm font-bold text-white">
                      {selectedRoom?.hostel_name || "Thapar Hostel – Girls"}
                    </p>
                  </div>
                </div>

                {/* Room Amenities Icons */}
                <p className="text-xs font-bold uppercase tracking-wider text-white/50 mb-2">Room Amenities Included:</p>
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1.5 rounded-xl bg-white/[0.02] border border-white/10 text-xs font-semibold text-white flex items-center gap-1.5">
                    🚿 Attached Washroom
                  </span>
                  <span className="px-3 py-1.5 rounded-xl bg-white/[0.02] border border-white/10 text-xs font-semibold text-white flex items-center gap-1.5">
                    📶 High-speed Wi-Fi
                  </span>
                  <span className="px-3 py-1.5 rounded-xl bg-white/[0.02] border border-white/10 text-xs font-semibold text-white flex items-center gap-1.5">
                    📚 Ergonomic Study Table
                  </span>
                  <span className="px-3 py-1.5 rounded-xl bg-white/[0.02] border border-white/10 text-xs font-semibold text-white flex items-center gap-1.5">
                    🗄️ Personal Almari / Lockers
                  </span>
                  <span className="px-3 py-1.5 rounded-xl bg-white/[0.02] border border-white/10 text-xs font-semibold text-white flex items-center gap-1.5">
                    ❄️ Air Conditioner (AC)
                  </span>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Right 1 Col: Cluster Ranking & Algorithm Card */}
          <div className="space-y-6">
            {/* Cluster Preference Ranking Widget */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span>⭐</span> Your Ranking ({selected.length}/5)
                </h3>
                <span className="text-xs text-white/50">Min 3 picks</span>
              </div>

              {selected.length === 0 ? (
                <div className="py-8 text-center bg-white/[0.02] rounded-xl border border-dashed border-white/15">
                  <p className="text-2xl mb-1">🎯</p>
                  <p className="text-xs font-semibold text-white">No clusters ranked yet</p>
                  <p className="text-[11px] text-white/50 mt-1">
                    Click "+ Rank" on any cluster from the floor map to add it.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 mb-4">
                  <AnimatePresence>
                    {selected.map((cid, idx) => {
                      const cObj = floor?.clusters?.find((c: any) => c.id === cid);
                      return (
                        <motion.div
                          key={cid}
                          layout
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          transition={{ duration: 0.25 }}
                          className="p-3 rounded-xl bg-white/[0.02] border border-white/10 shadow-sm flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <div>
                              <p className="text-xs font-bold text-white">
                                Cluster {cObj?.cluster_number || cid.substring(0, 6)}
                              </p>
                              <p className="text-[10px] text-white/50">
                                {cObj ? `${cObj.state} availability` : "Selected choice"}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => movePreference(idx, "up")}
                              disabled={idx === 0}
                              className="p-1 text-xs text-white/60 hover:bg-white/5 rounded disabled:opacity-30 transition-colors"
                            >
                              ▲
                            </button>
                            <button
                              onClick={() => movePreference(idx, "down")}
                              disabled={idx === selected.length - 1}
                              className="p-1 text-xs text-white/60 hover:bg-white/5 rounded disabled:opacity-30 transition-colors"
                            >
                              ▼
                            </button>
                            <button
                              onClick={() => toggleCluster(cid)}
                              className="p-1 text-xs text-orange-400 hover:bg-orange-500/10 rounded font-bold ml-1 transition-colors"
                            >
                              ✕
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}

              {error && <p className="text-xs text-orange-400 font-semibold mb-3">{error}</p>}

              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={submitPreferences}
                disabled={submitting || selected.length < 3}
                className="w-full py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold text-sm rounded-full shadow-[0_0_20px_-6px] shadow-orange-500/50 transition-colors disabled:opacity-50"
              >
                {submitting ? "Saving Preferences..." : "Save Preferences"}
              </motion.button>

              <AnimatePresence>
                {result && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-4 p-4 rounded-xl bg-green-500/10 border border-green-500/30"
                  >
                    <p className="text-xs font-bold text-green-400 mb-1">✓ Preferences Saved!</p>
                    <p className="text-[11px] text-white/60 mb-2">{result.message}</p>
                    <a href="/payment" className="text-xs font-bold text-blue-300 hover:text-blue-200 transition-colors">
                      Proceed to Payment →
                    </a>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Allocation Algorithm Card */}
            <div className="bg-white/[0.03] border border-blue-500/20 rounded-2xl shadow-sm p-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">🤖</span>
                <h3 className="text-lg font-semibold text-white">
                  Allocation Algorithm
                </h3>
              </div>
              <p className="text-xs text-white/60 mb-3 leading-relaxed">
                The smart allocation engine processes bookings based on real-time parameters:
              </p>
              <ul className="text-xs text-white/70 space-y-2 mb-4">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <strong className="text-white">Student Preferences:</strong> Highest ranked cluster choice first.
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <strong className="text-white">Group Size:</strong> 1 to 4 members seated together in connected rooms.
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <strong className="text-white">Room Availability:</strong> Redis lock guards concurrent allotment.
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <strong className="text-white">Floor Balance:</strong> Prevents uneven occupancy concentration.
                </li>
              </ul>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 text-[11px] text-white/60">
                💡 <strong className="text-white">Payment Driven:</strong> Allotment triggers instantly when your fee payment clears — no waiting on groupmates!
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}