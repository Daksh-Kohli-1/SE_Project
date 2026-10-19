"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "@/lib/api";
import Navbar from "@/components/Navbar";
import { useHostelAssignment } from "../../lib/useHostelAssignment";
import HostelGate from "../../components/HostelGate";

/* ------------------------------------------------------------------ */
/*  FLOOR PLAN LAYOUT                                                  */
/*  Coordinates are taken from the sketch (1053 x 732 reference).      */
/*  Backend clusters (sorted by cluster_number) are assigned to these  */
/*  slots IN ORDER. To change which cluster sits where, just reorder   */
/*  the SLOTS array below.   o = "v" (rooms stacked) | "h" (side by side) */
/* ------------------------------------------------------------------ */
const S = 1.6; // render scale of the reference grid
const REF_W = 1060;
const REF_H = 790;
const CW = REF_W * S;
const CH = REF_H * S;

type Slot = { x: number; y: number; w: number; h: number; o: "v" | "h" };

// every cluster uses exactly one of two sizes, so the plan is perfectly uniform
const VW = 48, VH = 88; // vertical cluster (2 rooms stacked)
const HW = 96, HH = 44; // horizontal cluster (2 rooms side by side)
const V = (x: number, y: number): Slot => ({ x, y, w: VW, h: VH, o: "v" });
const H = (x: number, y: number): Slot => ({ x, y, w: HW, h: HH, o: "h" });

// column / row guides
const L1 = 76, L2 = 136; // left strip columns
const R1 = 684, R2 = 788; // right strip columns
const row = (i: number) => (i === 0 ? 14 : 84 + i * 100); // left strip rows 0..6 (gap after row 0 holds the stairs)

/* Backend clusters (sorted by cluster_number) are assigned to these slots IN ORDER.
   Reorder this array to move a cluster to a different position. */
const SLOTS: Slot[] = [
  // back-left corner
  V(L1, row(0)), V(L2, row(0)),
  // top middle
  H(232, 118), H(232, 172), H(350, 118), H(350, 172), H(468, 118),
  // top right
  H(920, 110), H(920, 164),
  // left strip
  V(L1, row(1)), V(L2, row(1)),
  V(L1, row(2)), V(L2, row(2)),
  V(L1, row(3)), V(L2, row(3)),
  V(L1, row(4)),
  V(L1, row(5)), V(L2, row(5)),
  V(L1, row(6)), V(L2, row(6)),
  // right strip
  V(R2, 240),
  V(R1, 360), V(R2, 360),
  V(R1, 480), V(R2, 480),
  V(R1, 600), V(R2, 600),
  // bottom right
  H(R1, 722), H(R2, 722),
];

// stairs (same position as in the floor sketch)
const STAIRS = [
  { x: L1, y: 108, w: L2 + VW - L1, h: 66 }, // left, between corner and first row
  { x: 700, y: 118, w: 130, h: 98 }, // right, beside the top-middle clusters
];

// blocked cells (same size as a real cluster) - drawn with a symmetric corner-to-corner X
const BLOCKED: Slot[] = [
  V(L2, row(4)),
  H(468, 172),
  V(R1, 240),
];

// balconies / walls. dir arrow shows which side the rooms look out to
const AREAS: {
  x: number; y: number; w: number; h: number;
  label?: string; sub?: string; vertical?: boolean; accent?: boolean;
}[] = [
  { x: 200, y: 0, w: 840, h: 96, label: "Back Balcony", sub: "▲ rooms face north / back side", accent: true },
  { x: 0, y: 0, w: 56, h: 786, label: "Outside Balcony", sub: "◀ rooms face outside", vertical: true, accent: true },
  { x: 60, y: 0, w: 140, h: 786 },
  { x: 200, y: 230, w: 460, h: 556, label: "Inside Balcony", sub: "rooms look into courtyard", accent: true },
  { x: 660, y: 230, w: 240, h: 556 },
  { x: 900, y: 230, w: 140, h: 556, label: "Outside Balcony", sub: "rooms face outside ▶", vertical: true, accent: true },
];

const box = (x: number, y: number, w: number, h: number): React.CSSProperties => ({
  position: "absolute",
  left: x * S,
  top: y * S,
  width: w * S,
  height: h * S,
});

export default function ClustersPage() {
  const [hostels, setHostels] = useState<any[]>([]);
  const [activeHostel, setActiveHostel] = useState(0);
  const [activeFloor, setActiveFloor] = useState(0);
  const gate = useHostelAssignment();
  const [selected, setSelected] = useState<string[]>([]); // ranked cluster ids
  const [selectedRoom, setSelectedRoom] = useState<any>(null);
  const [group, setGroup] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // ---- map viewport state ----
  const viewportRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 0.5 });
  const [dragging, setDragging] = useState(false);
  const fitK = useRef(0.5);
  const lastWidth = useRef(0);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const startPt = useRef({ x: 0, y: 0 });
  const pinchDist = useRef(0);
  const moved = useRef(false);

  useEffect(() => {
    if (!gate.allotted) return; // no hostel -> no map, nothing to fetch
    api.get("/api/hostels").then((r) => {
      setHostels(r.data);
      setActiveHostel(0); // the backend only returns the student's own allotted hostel
    }).catch(() => {});

    api.get("/api/groups/me").then((r) => setGroup(r.data)).catch(() => setGroup(null));
  }, [gate.allotted]);

  const hostel = hostels[activeHostel];
  const floor = hostel?.floors?.[activeFloor];

  const sortedClusters: any[] = [...(floor?.clusters || [])].sort(
    (a: any, b: any) => Number(a.cluster_number) - Number(b.cluster_number)
  );

  function roomLabel(r: any) {
    const n = Number(r.room_number);
    if (!isNaN(n) && n < 100 && floor?.floor_number) return String(floor.floor_number * 100 + n);
    return String(r.room_number);
  }

  // ---- fit map into the box ----
  const fitToBox = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const k = Math.min(el.clientWidth / CW, el.clientHeight / CH);
    fitK.current = k;
    setView({
      k,
      x: (el.clientWidth - CW * k) / 2,
      y: (el.clientHeight - CH * k) / 2,
    });
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    fitToBox();
    lastWidth.current = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== lastWidth.current) {
        lastWidth.current = el.clientWidth;
        fitToBox();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitToBox, hostels.length]);

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setView((v) => {
      const k = Math.min(Math.max(v.k * factor, fitK.current * 0.6), fitK.current * 6);
      const r = k / v.k;
      return { k, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r };
    });
  }, []);

  function zoomCenter(factor: number) {
    const el = viewportRef.current;
    if (!el) return;
    zoomAt(factor, el.clientWidth / 2, el.clientHeight / 2);
  }

  // wheel zoom (needs non-passive listener)
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, hostels.length]);

  function onPointerDown(e: React.PointerEvent) {
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 1) {
      startPt.current = { x: e.clientX, y: e.clientY };
      moved.current = false;
    }
    if (ptrs.current.size === 2) {
      const [a, b] = Array.from(ptrs.current.values());
      pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y);
      moved.current = true;
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const prev = ptrs.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    ptrs.current.set(e.pointerId, cur);

    if (ptrs.current.size === 1) {
      if (
        !moved.current &&
        Math.hypot(cur.x - startPt.current.x, cur.y - startPt.current.y) < 5
      ) {
        return;
      }
      if (!moved.current) {
        moved.current = true;
        setDragging(true);
      }
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    } else if (ptrs.current.size === 2) {
      const [a, b] = Array.from(ptrs.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = viewportRef.current!.getBoundingClientRect();
      const mx = (a.x + b.x) / 2 - rect.left;
      const my = (a.y + b.y) / 2 - rect.top;
      if (pinchDist.current > 0) zoomAt(dist / pinchDist.current, mx, my);
      pinchDist.current = dist;
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size === 0) {
      setDragging(false);
      setTimeout(() => (moved.current = false), 0);
    }
  }

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

      {gate.loading && <p className="text-xs text-white/50 text-center mt-16">Loading…</p>}

      {!gate.loading && !gate.allotted && (
        <HostelGate what="The cluster map" windowState={gate.windowState} />
      )}

      {!gate.loading && gate.allotted && (
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
              Cluster map{gate.hostelName ? ` — ${gate.hostelName}` : ""}
            </h1>
            <p className="text-white/60 text-sm sm:text-base">
              Browse hostel floors, check availability, inspect room amenities, and rank your preferred clusters.
            </p>
          </div>

          {/* Legend */}
          <div className="bg-white/[0.03] rounded-2xl p-3 px-4 border border-white/10 shadow-sm flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold">
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
          <div className="lg:col-span-2 space-y-6 min-w-0">
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-white">
                    {hostel?.name || "Thapar Hostel"} — Floor {floor?.floor_number ?? 1} Plan
                  </h3>
                  <p className="text-xs text-white/50">
                    Drag to move, scroll / pinch / buttons to zoom. Tap the badge on a cluster to rank it (pick 3 to 5). Tap a room to inspect it.
                  </p>
                </div>
                <span className="text-xs font-bold text-blue-300 px-3 py-1 bg-blue-500/10 rounded-full self-start sm:self-auto shrink-0">
                  {floor?.clusters?.length || 29} Clusters / 58 Rooms
                </span>
              </div>

              {/* ---------- MAP BOX (zoom + drag) ---------- */}
              <div className="relative">
                <div
                  ref={viewportRef}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  onClickCapture={(e) => {
                    if (moved.current) {
                      e.stopPropagation();
                      e.preventDefault();
                    }
                  }}
                  className={`relative w-full h-[420px] sm:h-[540px] lg:h-[620px] overflow-hidden rounded-xl border border-white/10 bg-[#111113] select-none ${
                    dragging ? "cursor-grabbing" : "cursor-grab"
                  }`}
                  style={{ touchAction: "none" }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      width: CW,
                      height: CH,
                      transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
                      transformOrigin: "0 0",
                      willChange: "transform",
                    }}
                  >
                    {/* balconies / walls */}
                    {AREAS.map((a, k) => (
                      <div
                        key={k}
                        style={box(a.x, a.y, a.w, a.h)}
                        className={`border rounded-md flex items-center justify-center text-center pointer-events-none ${
                          a.accent ? "border-white/30 bg-white/[0.03]" : "border-white/15"
                        }`}
                      >
                        {a.label && (
                          <div
                            className="flex flex-col items-center gap-1 px-2"
                            style={a.vertical ? { writingMode: "vertical-rl" } : undefined}
                          >
                            <span className="text-[34px] font-semibold text-white/70 leading-tight">{a.label}</span>
                            {a.sub && <span className="text-[18px] text-white/40 leading-tight">{a.sub}</span>}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* stairs */}
                    {STAIRS.map((st, k) => (
                      <div
                        key={k}
                        style={box(st.x, st.y, st.w, st.h)}
                        className="rounded-md border-2 border-white/40 bg-white/[0.06] flex flex-col items-center justify-center pointer-events-none"
                      >
                        <span className="text-[30px] leading-none">🪜</span>
                        <span className="text-[20px] font-bold text-white/80 tracking-wide mt-1">Stairs</span>
                      </div>
                    ))}

                    {/* blocked cells with symmetric X */}
                    {BLOCKED.map((c, k) => (
                      <div
                        key={k}
                        style={box(c.x, c.y, c.w, c.h)}
                        className="rounded-md border-2 border-dashed border-white/25"
                      >
                        <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%">
                          <line x1="0" y1="0" x2="100" y2="100" stroke="rgba(255,255,255,0.35)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                          <line x1="100" y1="0" x2="0" y2="100" stroke="rgba(255,255,255,0.35)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                        </svg>
                      </div>
                    ))}

                    {/* clusters */}
                    {SLOTS.map((slot, si) => {
                      const c = sortedClusters[si];
                      if (!c) return null;
                      const rankIdx = selected.indexOf(c.id);
                      const isFullyBooked = c.state === "full";
                      const isSelectedForPref = rankIdx !== -1;

                      let stateClass = "border-green-500/60 bg-green-500/10";
                      if (c.state === "partial") stateClass = "border-orange-400/60 bg-orange-400/10";
                      if (c.state === "full") stateClass = "border-red-500/60 bg-red-500/10";

                      return (
                        <div
                          key={c.id}
                          style={box(slot.x, slot.y, slot.w, slot.h)}
                          className={`rounded-md border-2 p-[3px] flex gap-[3px] box-border ${
                            slot.o === "v" ? "flex-col" : "flex-row"
                          } ${stateClass} ${
                            isSelectedForPref ? "ring-2 ring-blue-500 border-blue-500" : ""
                          } ${isFullyBooked ? "opacity-70" : ""}`}
                        >
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
                                className={`flex-1 min-w-0 min-h-0 rounded border flex flex-col items-center justify-center leading-none transition-colors ${
                                  isRoomSelected
                                    ? "border-blue-500 bg-blue-500/20 ring-1 ring-blue-500"
                                    : "border-white/20 bg-black/30 hover:border-blue-400"
                                }`}
                              >
                                <span className="text-[16px] font-bold text-white">{roomLabel(r)}</span>
                                <span className="text-[12px] text-white/60 mt-1">
                                  {r.occupied_count}/{r.capacity}
                                </span>
                              </button>
                            );
                          })}

                          {/* rank badge / toggle */}
                          <button
                            onClick={() => toggleCluster(c.id)}
                            disabled={isFullyBooked && !isSelectedForPref}
                            title={`Cluster ${c.cluster_number}`}
                            className={`absolute -top-3.5 -right-3.5 w-7 h-7 rounded-full text-[14px] font-bold flex items-center justify-center shadow-md z-10 transition-colors ${
                              isSelectedForPref
                                ? "bg-blue-600 text-white"
                                : "bg-[#0B0B0C] border border-white/30 text-white/70 hover:bg-blue-600 hover:text-white disabled:opacity-30"
                            }`}
                          >
                            {isSelectedForPref ? rankIdx + 1 : "+"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* zoom controls */}
                <div className="absolute right-3 top-3 flex flex-col gap-1.5 z-20">
                  <button
                    onClick={() => zoomCenter(1.3)}
                    className="w-9 h-9 rounded-lg bg-black/70 border border-white/15 text-white text-lg font-bold hover:bg-white/10"
                    aria-label="Zoom in"
                  >
                    +
                  </button>
                  <button
                    onClick={() => zoomCenter(1 / 1.3)}
                    className="w-9 h-9 rounded-lg bg-black/70 border border-white/15 text-white text-lg font-bold hover:bg-white/10"
                    aria-label="Zoom out"
                  >
                    −
                  </button>
                  <button
                    onClick={fitToBox}
                    className="w-9 h-9 rounded-lg bg-black/70 border border-white/15 text-white text-xs font-bold hover:bg-white/10"
                    aria-label="Reset view"
                  >
                    ⟲
                  </button>
                </div>
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
                      Room Details — {selectedRoom ? roomLabel(selectedRoom) : "312"}
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
                    Tap the "+" badge on any cluster in the floor map to add it.
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
      )}
    </main>
  );
}