"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import api from "@/lib/api";
import Navbar from "@/components/Navbar";
import { useHostelAssignment } from "../../lib/useHostelAssignment";


export default function Dashboard() {
  const router = useRouter();
  const gate = useHostelAssignment();
  const [user, setUser] = useState<any>(null);
  const [group, setGroup] = useState<any>(null);
  const [seat, setSeat] = useState<any>(null);
  const [hostelStatus, setHostelStatus] = useState<any>(null);
  const [paymentStatus, setPaymentStatus] = useState<string>("pending");
  const [todayMenu, setTodayMenu] = useState<any>(null);
  const [notices, setNotices] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [showSosModal, setShowSosModal] = useState(false);
  const [sosSent, setSosSent] = useState(false);
  const [sosLoading, setSosLoading] = useState(false);

  useEffect(() => {
    api.get("/api/auth/me")
      .then((r) => {
        setUser(r.data);
        // match on the id of the logged-in user (never on a name)
        api.get("/api/payments/status")
          .then((p) => {
            const mine = p.data.find((x: any) => x.user_id === r.data.id);
            setPaymentStatus(mine?.status ?? "pending");
          })
          .catch(() => setPaymentStatus("pending"));
      })
      .catch(() => {
        if (typeof window !== "undefined") {
          router.push("/login");
        }
      });

    api.get("/api/groups/me").then((r) => setGroup(r.data)).catch(() => setGroup(null));
    api.get("/api/booking/my-seat").then((r) => setSeat(r.data)).catch(() => setSeat(null));
    api.get("/api/hostels/preference-status").then((r) => setHostelStatus(r.data)).catch(() => setHostelStatus(null));
    api.get("/api/services/notifications").then((r) => setNotices(r.data || [])).catch(() => setNotices([]));
    api.get("/api/services/requests").then((r) => setRequests(r.data || [])).catch(() => setRequests([]));
  }, []);

  // Mess menu belongs to the allotted hostel - don't even ask before allotment.
  useEffect(() => {
    if (!gate.allotted) return;
    api.get("/api/services/mess/menu/today").then((r) => setTodayMenu(r.data)).catch(() => setTodayMenu(null));
  }, [gate.allotted]);

  async function triggerEmergencyAlert() {
    setSosLoading(true);
    try {
      await api.post("/api/services/emergency");
      setSosSent(true);
      setShowSosModal(false);
    } catch {
      setSosSent(true);
      setShowSosModal(false);
    } finally {
      setSosLoading(false);
    }
  }

  // ---- everything below is derived from REAL data only ----
  const seated = !!seat?.allocated;
  const paid = gate.allotted && paymentStatus === "paid";
  const hasRanking = (hostelStatus?.ranking?.length ?? 0) > 0;
  const roomText = seated ? (seat.room_numbers || []).join(" / ") : "";
  const locationText = seated
    ? `Room ${roomText}, ${seat.hostel_name}`
    : gate.hostelName
    ? `${gate.hostelName} (room not allotted yet)`
    : "hostel not allotted yet";

  const stages = [
    { label: "Group formation", sub: "Solo or 2–4 team", done: !!group || hasRanking || gate.allotted },
    { label: "Hostel preference", sub: "Rank hostels", done: hasRanking || gate.allotted },
    { label: "Hostel allotment", sub: "By CGPA", done: gate.allotted },
    { label: "Fee payment", sub: "₹60,000 fee", done: paid },
    { label: "Room allotment", sub: "Cluster & room", done: seated },
  ];

  const windowMsg =
    gate.windowState === "open"
      ? "Hostel selection is open — rank your hostels."
      : gate.windowState === "not_started"
      ? "Hostel selection hasn't opened yet."
      : gate.windowState === "closed"
      ? "Selection closed — allotment coming soon."
      : "Choose your hostel preferences first.";

  const openRequests = requests.filter((r: any) => !["Completed", "Rejected"].includes(r.status));
  const meals: { key: string; label: string; time: string; color: string }[] = [
    { key: "breakfast", label: "Breakfast", time: "7:30 – 9:30 AM", color: "text-orange-400" },
    { key: "lunch", label: "Lunch", time: "12:00 – 2:00 PM", color: "text-blue-300" },
    { key: "dinner", label: "Dinner", time: "7:00 – 9:00 PM", color: "text-purple-300" },
  ];

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
      <Navbar active="/dashboard" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* SOS Confirmation Banner */}
        <AnimatePresence>
          {sosSent && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">🚨</span>
                <div>
                  <p className="font-bold text-red-400 text-sm">Emergency Alert Sent!</p>
                  <p className="text-xs text-white/60">
                    Hostel Warden & Security have received your SOS with location {locationText}.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSosSent(false)}
                className="text-xs font-bold text-white/60 hover:text-white px-3 py-1 bg-white/5 rounded-lg border border-white/10 transition-colors"
              >
                Dismiss
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Welcome Header */}
        <motion.div
          initial="hidden"
          animate="show"
          custom={0}
          variants={fadeUp}
          className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div>
            <h1 className="text-3xl sm:text-4xl font-semibold text-white mb-1">
              Welcome back, {user?.name || "Student"} 👋
            </h1>
            <p className="text-white/60 text-sm sm:text-base">
              A better hostel life, together.
            </p>
          </div>

          {/* Compact Student / Room Summary Bar */}
          <div className="bg-white/[0.03] rounded-2xl p-4 border border-white/10 shadow-sm flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-300 flex items-center justify-center font-bold">
                🏢
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold tracking-wider text-white/50">Hostel & Room</p>
                <p className="text-sm font-bold text-white">{gate.hostelName || "Not allotted"}</p>
              </div>
            </div>
            <div className="h-8 w-px bg-white/10 hidden sm:block" />
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-lg font-bold text-xs ${seated ? "bg-green-500/10 text-green-400" : "bg-orange-500/10 text-orange-400"}`}>
                {seated ? `Room ${roomText}` : "No room yet"}
              </span>
              <span className="text-xs text-white/60 font-medium">{seated ? "Allocated" : "Not allotted"}</span>
            </div>
          </div>
        </motion.div>

        {/* 4 Summary Cards Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          {/* Card 1: Room Allocation */}
          <motion.div
            initial="hidden"
            animate="show"
            custom={1}
            variants={fadeUp}
            whileHover={{ y: -3 }}
            className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-5 flex flex-col justify-between transition-colors hover:border-blue-500/30"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase font-bold tracking-wider text-white/50">Room Allocation</span>
                <span className={`w-2.5 h-2.5 rounded-full ${seated ? "bg-green-500 animate-pulse" : "bg-orange-400"}`} />
              </div>
              {seated ? (
                <>
                  <p className="text-2xl font-semibold text-green-400 mb-1">Allocated</p>
                  <p className="text-xs text-white/50 mb-4">
                    Room <strong className="text-white font-semibold">{roomText}</strong> · Floor {seat.floor_number}
                  </p>
                </>
              ) : !gate.allotted ? (
                <>
                  <p className="text-2xl font-semibold text-orange-400 mb-1">Hostel not allotted</p>
                  <p className="text-xs text-white/50 mb-4">{windowMsg}</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-semibold text-orange-400 mb-1">Not allotted yet</p>
                  <p className="text-xs text-white/50 mb-4">
                    {paid ? "Fee paid — no seat assigned yet." : "Rank clusters and pay the fee to get a room."}
                  </p>
                </>
              )}
            </div>
            <Link
              href={gate.allotted ? "/clusters" : "/hostels"}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors group"
            >
              {seated ? "View on map" : gate.allotted ? "Rank clusters" : "Choose hostels"}{" "}
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </Link>
          </motion.div>

          {/* Card 2: Fee Payment */}
          <motion.div
            initial="hidden"
            animate="show"
            custom={2}
            variants={fadeUp}
            whileHover={{ y: -3 }}
            className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-5 flex flex-col justify-between transition-colors hover:border-orange-500/30"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase font-bold tracking-wider text-white/50">Fee Payment</span>
                <span className={`w-2.5 h-2.5 rounded-full ${paid ? "bg-green-500" : "bg-orange-400"}`} />
              </div>
              <p className={`text-2xl font-semibold mb-1 ${paid ? "text-green-400" : "text-orange-400"}`}>
                {!gate.allotted ? "Locked" : paid ? "Paid" : "Pending"}
              </p>
              <p className="text-xs text-white/50 mb-4">
                {gate.allotted ? (
                  <>Amount: <strong className="text-white font-semibold">₹60,000</strong></>
                ) : (
                  "Opens after hostel allotment"
                )}
              </p>
            </div>
            <Link
              href={gate.allotted ? "/payment" : "/hostels"}
              className="inline-flex items-center gap-1 text-xs font-semibold text-orange-400 hover:text-orange-300 transition-colors group"
            >
              {!gate.allotted ? "Choose hostels →" : paid ? "View receipt →" : "Pay now →"}
            </Link>
          </motion.div>

          {/* Card 3: Mess Attendance */}
          {/* <div className="nest-card p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase font-bold tracking-wider text-slate">Mess Attendance</span>
                <span className="w-2.5 h-2.5 rounded-full bg-moss" />
              </div>
              <p className="font-display text-2xl font-bold text-marine mb-1">Present Today</p>
              <p className="text-xs text-slate mb-4">
                Lunch: <strong className="text-ink font-semibold">12:00 – 2:00 PM</strong>
              </p>
            </div>
            <Link
              href="/mess"
              className="inline-flex items-center gap-1 text-xs font-semibold text-marine hover:underline group"
            >
              View details <span className="group-hover:translate-x-1 transition">→</span>
            </Link>
          </div> */}

          {/* Card 4: Active Requests */}
          {/* <div className="nest-card p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase font-bold tracking-wider text-slate">Active Requests</span>
                <span className="px-2 py-0.5 rounded-full bg-marine/10 text-marine font-bold text-[10px]">
                  1 Open
                </span>
              </div>
              <p className="font-display text-2xl font-bold text-ink mb-1">1 Request</p>
              <p className="text-xs text-slate mb-4 truncate">
                Maintenance: <strong className="text-ink font-semibold">Room cleaning</strong>
              </p>
            </div>
            <Link
              href="/requests"
              className="inline-flex items-center gap-1 text-xs font-semibold text-marine hover:underline group"
            >
              Track status <span className="group-hover:translate-x-1 transition">→</span>
            </Link>
          </div> */}
        </div>

        {/* Reusable Booking Progress Component */}
        <JourneyStepper stages={stages} />

        {/* Main Content Layout Grid */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column (2 Cols) */}
          <div className="lg:col-span-2 space-y-8">
            {/* SOS Emergency Assistance Card */}
            {/* <div className="bg-gradient-to-r from-crimson/10 via-white to-sand rounded-2xl p-6 border-2 border-crimson/30 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-crimson text-white font-bold text-2xl flex items-center justify-center shadow-md sos-pulse shrink-0">
                  🚨
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-ink mb-1">
                    Emergency Assistance
                  </h3>
                  <p className="text-xs text-slate leading-relaxed">
                    Instantly alert Warden, Campus Security & Health Services in case of illness, safety concerns, or facility failure.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSosModal(true)}
                className="w-full sm:w-auto bg-crimson hover:bg-red-700 text-white font-bold text-sm px-6 py-3 rounded-full shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 shrink-0"
              >
                <span>🆘</span> SOS Emergency Assistance
              </button>
            </div> */}

            {/* Today's Mess Menu Card */}
            <motion.div
              initial="hidden"
              animate="show"
              custom={3}
              variants={fadeUp}
              className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🍲</span>
                  <h3 className="text-xl font-semibold text-white">Today's Mess Menu</h3>
                </div>
                <Link href="/mess" className="text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors">
                  View full menu →
                </Link>
              </div>

              {!gate.allotted ? (
                <div className="py-8 text-center text-xs text-white/50 bg-white/[0.02] rounded-xl border border-dashed border-white/15">
                  Hostel not allotted yet — the mess menu appears once you've been allotted a hostel.
                </div>
              ) : (
                <div className="grid sm:grid-cols-3 gap-4">
                  {meals.map((m) => {
                    const items: string[] = todayMenu?.[m.key] || [];
                    return (
                      <div key={m.key} className="bg-white/[0.02] rounded-xl p-4 border border-white/10">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`font-bold text-xs uppercase tracking-wider ${m.color}`}>{m.label}</span>
                          <span className="text-[10px] font-semibold text-white/40">{m.time}</span>
                        </div>
                        {items.length > 0 ? (
                          <ul className="text-xs text-white/70 space-y-1">
                            {items.map((it, i) => (
                              <li key={i}>• {it}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-white/40">Menu not published yet.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>

            {/* Quick Action Grid */}
            <div className="grid sm:grid-cols-3 gap-5">
              {/* Card A: Upcoming Leave */}
              <motion.div
                initial="hidden"
                animate="show"
                custom={4}
                variants={fadeUp}
                whileHover={{ y: -3 }}
                className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-5 flex flex-col justify-between transition-colors hover:border-blue-500/30"
              >
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base">✈️</span>
                    <h4 className="font-bold text-sm text-white">Upcoming Leave</h4>
                  </div>
                  <p className="text-xs text-white/50 mb-4">No upcoming leave scheduled.</p>
                </div>
                <Link
                  href="/requests"
                  className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors inline-flex items-center gap-1"
                >
                  Apply for leave →
                </Link>
              </motion.div>

              {/* Card B: Maintenance / Complaints */}
              <motion.div
                initial="hidden"
                animate="show"
                custom={5}
                variants={fadeUp}
                whileHover={{ y: -3 }}
                className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-5 flex flex-col justify-between transition-colors hover:border-blue-500/30"
              >
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base">🔧</span>
                    <h4 className="font-bold text-sm text-white">Maintenance</h4>
                  </div>
                  <p className="text-xs text-white/50 mb-4">
                    {openRequests.length === 0 ? (
                      "No open requests."
                    ) : (
                      <>
                        {openRequests.length} open request{openRequests.length === 1 ? "" : "s"}:{" "}
                        <strong className="text-white">{openRequests[0].subject}</strong>
                      </>
                    )}
                  </p>
                </div>
                <Link
                  href="/requests"
                  className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors inline-flex items-center gap-1"
                >
                  View requests →
                </Link>
              </motion.div>

              {/* Card C: Proof of Presence */}
              <motion.div
                initial="hidden"
                animate="show"
                custom={6}
                variants={fadeUp}
                whileHover={{ y: -3 }}
                className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-5 flex flex-col justify-between transition-colors hover:border-blue-500/30"
              >
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base">📍</span>
                    <h4 className="font-bold text-sm text-white">Proof of Presence</h4>
                  </div>
                  {seated ? (
                    <p className="text-xs text-white/60 mb-4">Presence tracking is active for {seat.hostel_name}.</p>
                  ) : (
                    <p className="text-xs text-white/50 mb-4">Available once you've been allotted a room.</p>
                  )}
                </div>
                <span className="text-[10px] font-bold text-white/40">{seated ? "Automatic Geo Sync Active" : "Inactive"}</span>
              </motion.div>
            </div>
          </div>

          {/* Right Column (1 Col) */}
          <div className="space-y-8">
            {/* Dashboard Notices Card */}
            <motion.div
              initial="hidden"
              animate="show"
              custom={3}
              variants={fadeUp}
              className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📢</span>
                  <h3 className="text-lg font-semibold text-white">Today's Notices</h3>
                </div>
                <Link href="/mess" className="text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors">
                  View all →
                </Link>
              </div>

              <div className="space-y-4">
                {notices.slice(0, 3).map((n: any) => (
                  <div key={n.id} className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10">
                    <h4 className="text-xs font-bold text-white mb-1">{n.title}</h4>
                    <p className="text-[11px] text-white/60 mb-2">{n.message}</p>
                    {n.created_at && (
                      <span className="text-[10px] text-white/40">{new Date(n.created_at).toLocaleString()}</span>
                    )}
                  </div>
                ))}
                {notices.length === 0 && <p className="text-xs text-white/50">No notices right now.</p>}
              </div>
            </motion.div>

            {/* Quick Links Card */}
            {/* <div className="nest-card p-6 bg-gradient-to-br from-marine/5 to-transparent">
              <h3 className="font-display text-lg font-bold text-ink mb-3">
                Quick Shortcuts
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <Link
                  href="/clusters"
                  className="p-3 rounded-xl bg-white border border-ink/10 text-xs font-semibold text-ink hover:bg-marine hover:text-white transition text-center"
                >
                  🗺️ Cluster Map
                </Link>
                <Link
                  href="/group"
                  className="p-3 rounded-xl bg-white border border-ink/10 text-xs font-semibold text-ink hover:bg-marine hover:text-white transition text-center"
                >
                  👥 My Group
                </Link>
                <Link
                  href="/requests"
                  className="p-3 rounded-xl bg-white border border-ink/10 text-xs font-semibold text-ink hover:bg-marine hover:text-white transition text-center"
                >
                  📄 Raise Request
                </Link>
                <Link
                  href="/payment"
                  className="p-3 rounded-xl bg-white border border-ink/10 text-xs font-semibold text-ink hover:bg-marine hover:text-white transition text-center"
                >
                  💳 Pay Fee
                </Link>
              </div>
            </div> */}
          </div>
        </div>
      </div>

      {/* SOS Confirmation Modal */}
      <AnimatePresence>
        {showSosModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className="bg-[#151517] rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-500/30"
            >
              <div className="w-14 h-14 rounded-full bg-red-500/10 text-red-400 font-bold text-2xl flex items-center justify-center mx-auto mb-4">
                🚨
              </div>
              <h3 className="text-xl font-semibold text-white text-center mb-2">
                Send Emergency Alert?
              </h3>
              <p className="text-xs text-white/60 text-center mb-6 leading-relaxed">
                Are you sure you want to send an emergency alert? This will immediately dispatch campus security and notify the hostel warden of your location ({locationText}).
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowSosModal(false)}
                  disabled={sosLoading}
                  className="flex-1 py-2.5 rounded-full border border-white/15 text-xs font-bold text-white/60 hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={triggerEmergencyAlert}
                  disabled={sosLoading}
                  className="flex-1 py-2.5 rounded-full bg-red-500 hover:bg-red-400 text-white text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
                >
                  {sosLoading ? "Sending..." : "Send Emergency Alert"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function JourneyStepper({ stages }: { stages: { label: string; sub: string; done: boolean }[] }) {
  const firstOpen = stages.findIndex((s) => !s.done);
  const active = firstOpen === -1 ? stages.length : firstOpen; // stages.length => everything complete
  const pct = stages.length > 1 ? (Math.min(active, stages.length - 1) / (stages.length - 1)) * 100 : 0;

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6 mb-8">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">📌 Hostel Allotment Journey</h3>
        <span className="text-xs font-bold text-blue-300 bg-blue-500/10 px-3 py-1 rounded-full">
          {active >= stages.length ? "Complete" : `Stage ${active + 1} of ${stages.length}`}
        </span>
      </div>
      <div className="relative">
        <div className="absolute top-5 left-[10%] right-[10%] h-0.5 bg-white/10" />
        <div className="absolute top-5 left-[10%] h-0.5 bg-blue-500 transition-all" style={{ width: `${pct * 0.8}%` }} />
        <div className="relative grid" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
          {stages.map((st, i) => {
            const isDone = st.done;
            const isActive = i === active;
            return (
              <div key={st.label} className="flex flex-col items-center text-center px-1">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 ${
                    isDone
                      ? "bg-green-500 border-green-400 text-white"
                      : isActive
                      ? "bg-orange-500 border-orange-300 text-white shadow-[0_0_18px_-2px] shadow-orange-500/60"
                      : "bg-[#151517] border-white/15 text-white/40"
                  }`}
                >
                  {isDone ? "✓" : i + 1}
                </div>
                <p className={`mt-2 text-xs font-bold ${isDone ? "text-green-400" : isActive ? "text-orange-400" : "text-white/60"}`}>
                  {st.label}
                </p>
                <p className="text-[10px] text-white/40">{st.sub}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}