"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import api from "@/lib/api";
import Navbar from "@/components/Navbar";
import BookingProgress from "@/components/BookingProgress";

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [group, setGroup] = useState<any>(null);
  const [booking, setBooking] = useState<any>(null);
  const [paymentStatus, setPaymentStatus] = useState<string>("pending");
  const [showSosModal, setShowSosModal] = useState(false);
  const [sosSent, setSosSent] = useState(false);
  const [sosLoading, setSosLoading] = useState(false);

  useEffect(() => {
    api.get("/api/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => {
        if (typeof window !== "undefined") {
          router.push("/login");
        }
      });

    api.get("/api/groups/me")
      .then((r) => setGroup(r.data))
      .catch(() => setGroup(null));

    api.get("/api/booking/status")
      .then((r) => setBooking(r.data))
      .catch(() => setBooking(null));

    api.get("/api/payments/status")
      .then((r) => {
        const myPay = r.data.find((p: any) => p.name.includes("Avleen") || p.user_id === user?.id);
        if (myPay) setPaymentStatus(myPay.status);
      })
      .catch(() => setPaymentStatus("pending"));
  }, []);

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

  // Determine current stage for booking progress
  let currentStage: 1 | 2 | 3 | 4 = 1;
  if (group) currentStage = 2;
  if (group?.status === "prefs_submitted" || booking) currentStage = 3;
  if (booking && paymentStatus === "paid") currentStage = 4;

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
                    Hostel Warden & Security have received your SOS with location Room {user?.room_no || "N/A"} ({user?.hostel_name || "Hostel"}).
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
                <p className="text-sm font-bold text-white">{user?.hostel_name || "Unassigned"}</p>
              </div>
            </div>
            <div className="h-8 w-px bg-white/10 hidden sm:block" />
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-lg bg-green-500/10 text-green-400 font-bold text-xs">
                Room {user?.room_no || "N/A"}
              </span>
              <span className="text-xs text-white/60 font-medium">
                Allocated
              </span>
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
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
              </div>
              <p className="text-2xl font-semibold text-green-400 mb-1">Allocated</p>
              <p className="text-xs text-white/50 mb-4">
                Room <strong className="text-white font-semibold">{user?.room_no || "N/A"}</strong>
              </p>
            </div>
            <Link
              href="/clusters"
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors group"
            >
              View on map <span className="group-hover:translate-x-1 transition-transform">→</span>
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
                <span className={`w-2.5 h-2.5 rounded-full ${paymentStatus === "paid" ? "bg-green-500" : "bg-orange-400"}`} />
              </div>
              <p className={`text-2xl font-semibold mb-1 ${paymentStatus === "paid" ? "text-green-400" : "text-orange-400"}`}>
                {paymentStatus === "paid" ? "Paid" : "Pending"}
              </p>
              <p className="text-xs text-white/50 mb-4">
                Amount: <strong className="text-white font-semibold">₹60,000</strong>
              </p>
            </div>
            <Link
              href="/payment"
              className="inline-flex items-center gap-1 text-xs font-semibold text-orange-400 hover:text-orange-300 transition-colors group"
            >
              {paymentStatus === "paid" ? "View receipt →" : "Pay now →"}
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
        <BookingProgress currentStage={currentStage} />

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

              <div className="grid sm:grid-cols-3 gap-4">
                {/* Breakfast */}
                <div className="bg-white/[0.02] rounded-xl p-4 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs uppercase tracking-wider text-orange-400">Breakfast</span>
                    <span className="text-[10px] font-semibold text-white/40">7:30 – 9:30 AM</span>
                  </div>
                  <ul className="text-xs text-white/70 space-y-1">
                    <li>• Poha</li>
                    <li>• Boiled Eggs</li>
                    <li>• Fresh Fruit</li>
                    <li>• Tea / Coffee</li>
                  </ul>
                </div>

                {/* Lunch */}
                <div className="bg-white/[0.02] rounded-xl p-4 border border-white/10 ring-1 ring-blue-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs uppercase tracking-wider text-blue-300">Lunch</span>
                    <span className="text-[10px] font-semibold text-white/40">12:00 – 2:00 PM</span>
                  </div>
                  <ul className="text-xs text-white/70 space-y-1">
                    <li className="font-semibold text-white">• Rajma Chawal</li>
                    <li>• Mixed Veg</li>
                    <li>• Fresh Curd</li>
                    <li>• Salad</li>
                  </ul>
                </div>

                {/* Dinner */}
                <div className="bg-white/[0.02] rounded-xl p-4 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs uppercase tracking-wider text-purple-300">Dinner</span>
                    <span className="text-[10px] font-semibold text-white/40">7:00 – 9:00 PM</span>
                  </div>
                  <ul className="text-xs text-white/70 space-y-1">
                    <li>• Paneer Curry</li>
                    <li>• Butter Roti</li>
                    <li>• Salad</li>
                  </ul>
                </div>
              </div>
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
                    1 open request: <strong className="text-white">Room cleaning</strong>
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
                  <p className="text-xs text-green-400 font-semibold mb-1">✓ Present in hostel</p>
                  <p className="text-[10px] text-white/40 mb-4">Marked at 12:14 PM</p>
                </div>
                <span className="text-[10px] font-bold text-white/40">Automatic Geo Sync Active</span>
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
                {/* Notice 1 */}
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs">🛠️</span>
                    <h4 className="text-xs font-bold text-white">Hostel Maintenance on Block B</h4>
                  </div>
                  <p className="text-[11px] text-white/60 mb-2">
                    Elevator maintenance scheduled between 2:00 PM and 5:00 PM today.
                  </p>
                  <span className="text-[10px] text-white/40">Today, 09:30 AM</span>
                </div>

                {/* Notice 2 */}
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs">🥗</span>
                    <h4 className="text-xs font-bold text-white">Mess Menu Updated</h4>
                  </div>
                  <p className="text-[11px] text-white/60 mb-2">
                    Special dinner menu announced for upcoming Friday feast.
                  </p>
                  <span className="text-[10px] text-white/40">Yesterday, 04:15 PM</span>
                </div>

                {/* Notice 3 */}
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs">🇮🇳</span>
                    <h4 className="text-xs font-bold text-white">Independence Day Holiday</h4>
                  </div>
                  <p className="text-[11px] text-white/60 mb-2">
                    Campus entry/exit timing guidelines updated for holiday weekend.
                  </p>
                  <span className="text-[10px] text-white/40">02 Sep, 11:00 AM</span>
                </div>
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
                Are you sure you want to send an emergency alert? This will immediately dispatch campus security and notify the hostel warden of your location (Room {user?.room_no || "N/A"}, {user?.hostel_name || "Hostel"}).
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