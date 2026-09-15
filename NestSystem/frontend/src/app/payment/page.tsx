"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "@/lib/api";
import Navbar from "@/components/Navbar";

export default function PaymentPage() {
  const [activeTab, setActiveTab] = useState<"fee" | "mess" | "fines" | "history">("fee");
  const [statuses, setStatuses] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<"upi" | "card" | "netbanking">("upi");
  const [message, setMessage] = useState("");
  const [allocationMsg, setAllocationMsg] = useState("");
  const [showReceipt, setShowReceipt] = useState<any>(null);

  async function refresh() {
    try {
      const uRes = await api.get("/api/auth/me");
      setUser(uRes.data);
    } catch {
      setUser({ id: "u-avleen", name: "Avleen Kaur" });
    }

    try {
      const pRes = await api.get("/api/payments/status");
      setStatuses(pRes.data);
    } catch {
      setStatuses([
        { user_id: "u-avleen", name: "Avleen Kaur", status: "pending" },
        { user_id: "u-ananya", name: "Ananya Singh", status: "paid" },
        { user_id: "u-priya", name: "Priya Reddy", status: "pending" },
      ]);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handlePay() {
    setLoading(true);
    setMessage("");
    setAllocationMsg("");
    try {
      const res = await api.post("/api/payments/pay");
      const ref = res.data.transaction_ref || `SIMPAY-${Math.floor(100000 + Math.random() * 900000)}`;
      setMessage(`Payment successful (simulated) — ref ${ref}.`);
      if (res.data.allocation?.message) {
        setAllocationMsg(res.data.allocation.message);
      }
      setShowReceipt({
        ref,
        amount: 60000,
        date: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
        method: selectedMethod.toUpperCase(),
        fee_type: "Annual Hostel Fee (2026-27)",
      });
      await refresh();
    } catch (err: any) {
      setMessage(err?.response?.data?.detail || "Payment could not be completed");
    } finally {
      setLoading(false);
    }
  }

  const myStatus = statuses.find((s) => s.name?.includes("Avleen") || s.user_id === user?.id);
  const isPaid = myStatus?.status === "paid";

  return (
    <main className="min-h-screen pb-20 bg-[#0B0B0C]">
      <Navbar active="/payment" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="mb-8"
        >
          <h1 className="text-3xl sm:text-4xl font-semibold text-white mb-1">
            Payments & Billing
          </h1>
          <p className="text-white/60 text-sm sm:text-base">
            A transparent and cashless experience for hostel fee, mess dues, and transaction receipts.
          </p>
        </motion.div>

        {/* Payment Tabs */}
        <div className="flex gap-2 border-b border-white/10 mb-8 overflow-x-auto pb-1">
          {[
            { id: "fee", label: "Hostel Fee", icon: "🏢" },
            { id: "mess", label: "Mess Bill", icon: "🍛" },
            { id: "fines", label: "Fines & Extras", icon: "⚠️" },
            { id: "history", label: "Transaction History", icon: "📜" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-5 py-3 font-bold text-xs rounded-t-xl transition-colors flex items-center gap-2 shrink-0 ${
                activeTab === tab.id
                  ? "bg-white/[0.04] text-blue-300 border-t-2 border-x border-blue-500/40 shadow-sm"
                  : "text-white/50 hover:text-white"
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {/* Tab 1: Hostel Fee */}
            {activeTab === "fee" && (
              <div className="grid lg:grid-cols-3 gap-8">
                {/* Left 2 Cols: Main Fee Breakdown & Payment Card */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Fee Status Header Card */}
                  <div className="bg-white/[0.03] border border-blue-500/20 rounded-2xl shadow-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-wider text-white/50">Annual Residence Fee</span>
                        <h2 className="text-3xl font-semibold text-white mt-1">₹60,000</h2>
                        <p className="text-xs text-white/60">Academic Session 2026 – 2027</p>
                      </div>

                      <span
                        className={`px-4 py-1.5 rounded-full text-xs font-bold ${
                          isPaid ? "bg-green-500/10 text-green-400" : "bg-orange-500/10 text-orange-400"
                        }`}
                      >
                        {isPaid ? "✓ Fee Paid" : "● Payment Pending"}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 text-xs text-white/60 flex items-center justify-between">
                      <span>Due Date: <strong className="text-white">15 September 2026</strong></span>
                      <span className="text-orange-400 font-bold">No Late Fee Applicable Yet</span>
                    </div>
                  </div>

                  {/* Fee Breakdown Table */}
                  <div className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <span>📑</span> Fee Breakdown
                    </h3>

                    <div className="space-y-3 divide-y divide-white/10">
                      <div className="flex items-center justify-between pt-2 text-xs">
                        <span className="text-white/60 font-medium">Hostel Accommodation Charge</span>
                        <span className="font-bold text-white">₹48,000</span>
                      </div>
                      <div className="flex items-center justify-between pt-3 text-xs">
                        <span className="text-white/60 font-medium">Amenities, Wi-Fi & Utility Charges</span>
                        <span className="font-bold text-white">₹8,000</span>
                      </div>
                      <div className="flex items-center justify-between pt-3 text-xs">
                        <span className="text-white/60 font-medium">Refundable Security Deposit</span>
                        <span className="font-bold text-white">₹4,000</span>
                      </div>
                      <div className="flex items-center justify-between pt-4 text-sm border-t-2 border-white/10">
                        <span className="font-bold text-white">Total Amount Payable</span>
                        <span className="text-xl font-semibold text-blue-300">₹60,000</span>
                      </div>
                    </div>
                  </div>

                  {/* Payment Methods & Execution */}
                  {!isPaid ? (
                    <div className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6">
                      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <span>💳</span> Select Payment Method
                      </h3>

                      <div className="grid sm:grid-cols-3 gap-3 mb-6">
                        <motion.button
                          whileHover={{ y: -2 }}
                          onClick={() => setSelectedMethod("upi")}
                          className={`p-4 rounded-xl border text-center transition-colors ${
                            selectedMethod === "upi"
                              ? "border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/40"
                              : "border-white/10 bg-white/[0.02] hover:border-blue-500/30"
                          }`}
                        >
                          <span className="text-xl block mb-1">📱</span>
                          <span className="text-xs font-bold text-white">UPI / QR</span>
                          <span className="text-[10px] text-white/50 block">GPay, PhonePe, Paytm</span>
                        </motion.button>

                        <motion.button
                          whileHover={{ y: -2 }}
                          onClick={() => setSelectedMethod("card")}
                          className={`p-4 rounded-xl border text-center transition-colors ${
                            selectedMethod === "card"
                              ? "border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/40"
                              : "border-white/10 bg-white/[0.02] hover:border-blue-500/30"
                          }`}
                        >
                          <span className="text-xl block mb-1">💳</span>
                          <span className="text-xs font-bold text-white">Credit / Debit Card</span>
                          <span className="text-[10px] text-white/50 block">Visa, Mastercard, RuPay</span>
                        </motion.button>

                        <motion.button
                          whileHover={{ y: -2 }}
                          onClick={() => setSelectedMethod("netbanking")}
                          className={`p-4 rounded-xl border text-center transition-colors ${
                            selectedMethod === "netbanking"
                              ? "border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/40"
                              : "border-white/10 bg-white/[0.02] hover:border-blue-500/30"
                          }`}
                        >
                          <span className="text-xl block mb-1">🏦</span>
                          <span className="text-xs font-bold text-white">Net Banking</span>
                          <span className="text-[10px] text-white/50 block">HDFC, SBI, ICICI, Axis</span>
                        </motion.button>
                      </div>

                      <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handlePay}
                        disabled={loading}
                        className="w-full py-4 bg-orange-500 hover:bg-orange-400 text-white font-bold text-sm rounded-full shadow-[0_0_24px_-6px] shadow-orange-500/50 transition-colors disabled:opacity-50"
                      >
                        {loading ? "Processing Simulated Payment..." : "Pay ₹60,000 Hostel Fee (Simulated)"}
                      </motion.button>

                      <p className="text-[11px] text-white/50 text-center mt-3">
                        🔒 Payments are currently simulated for test evaluation. Razorpay / Gateway ready.
                      </p>
                    </div>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-green-500/10 border border-green-500/30 rounded-2xl shadow-sm p-6 text-center"
                    >
                      <span className="text-4xl block mb-2">🎉</span>
                      <h3 className="text-2xl font-semibold text-green-400 mb-1">Fee Payment Confirmed</h3>
                      <p className="text-xs text-white/60 mb-4">
                        Your hostel fee has been received and your room allocation in C-312 is locked in.
                      </p>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() =>
                          setShowReceipt({
                            ref: "SIMPAY-AVLEEN01",
                            amount: 60000,
                            date: "04 Sep 2026",
                            method: "UPI",
                            fee_type: "Annual Hostel Fee (2026-27)",
                          })
                        }
                        className="px-6 py-2.5 bg-green-600 text-white font-bold text-xs rounded-full shadow-sm hover:bg-green-500 transition-colors"
                      >
                        📄 View & Download Receipt
                      </motion.button>
                    </motion.div>
                  )}
                </div>

                {/* Right 1 Col: Group Payment Status */}
                <div className="space-y-6">
                  <div className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <span>👥</span> Group Payment Status
                    </h3>

                    <ul className="divide-y divide-white/10 mb-4">
                      {statuses.map((s) => (
                        <li key={s.user_id} className="py-3 flex items-center justify-between">
                          <div>
                            <p className="font-bold text-xs text-white">{s.name}</p>
                            <p className="text-[10px] text-white/50">Member</p>
                          </div>
                          <span
                            className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                              s.status === "paid" ? "bg-green-500/10 text-green-400" : "bg-orange-500/10 text-orange-400"
                            }`}
                          >
                            {s.status === "paid" ? "Paid ✓" : "Pending"}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 text-[11px] text-white/60">
                      💡 Allotment is member-by-member: as soon as your payment clears, your seat is reserved.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Mess Bill */}
            {activeTab === "mess" && (
              <div className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6">
                <h3 className="text-xl font-semibold text-white mb-4">Monthly Mess Billing</h3>
                <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30 mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-green-400">Mess Dues Status: Fully Paid</p>
                    <p className="text-[10px] text-white/50">September mess charges included in annual hostel fee.</p>
                  </div>
                  <span className="text-sm font-bold text-white">₹0 Pending</span>
                </div>
              </div>
            )}

            {/* Tab 3: Fines */}
            {activeTab === "fines" && (
              <div className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6">
                <h3 className="text-xl font-semibold text-white mb-4">Fines & Penalties</h3>
                <p className="text-xs text-white/60">Clean record! No active fines or late charges recorded.</p>
              </div>
            )}

            {/* Tab 4: History */}
            {activeTab === "history" && (
              <div className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6">
                <h3 className="text-xl font-semibold text-white mb-4">Recent Payment History</h3>
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-white">Annual Hostel Fee (2026-27)</p>
                      <p className="text-[10px] text-white/50">Ref: SIMPAY-AVLEEN01 · 04 Sep 2026</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-white">₹60,000</p>
                      <span className="text-[10px] font-bold text-green-400">Paid ✓</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {message && <p className="text-xs text-center text-white/60 mt-4">{message}</p>}
        {allocationMsg && <p className="text-xs text-center text-blue-300 font-bold mt-2">{allocationMsg}</p>}
      </div>

      {/* Payment Receipt Modal */}
      <AnimatePresence>
        {showReceipt && (
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
              className="bg-[#151517] rounded-2xl max-w-md w-full p-6 shadow-2xl border border-white/10"
            >
              <div className="text-center pb-4 border-b border-white/10 mb-4">
                <div className="w-12 h-12 rounded-full bg-green-500/10 text-green-400 font-bold text-2xl flex items-center justify-center mx-auto mb-2">
                  ✓
                </div>
                <h3 className="text-xl font-semibold text-white">Payment Successful</h3>
                <p className="text-xs text-white/50">Thapar Institute Hostel Fee Receipt</p>
              </div>

              <div className="space-y-3 text-xs mb-6">
                <div className="flex items-center justify-between">
                  <span className="text-white/60 font-medium">Student Name</span>
                  <span className="font-bold text-white">Avleen Kaur</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/60 font-medium">Roll Number</span>
                  <span className="font-bold text-white">102303011</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/60 font-medium">Transaction Ref</span>
                  <span className="font-mono font-bold text-blue-300">{showReceipt.ref}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/60 font-medium">Payment Date</span>
                  <span className="font-bold text-white">{showReceipt.date}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/60 font-medium">Payment Method</span>
                  <span className="font-bold text-white">{showReceipt.method}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-white/10 text-sm">
                  <span className="font-bold text-white">Amount Paid</span>
                  <span className="font-semibold text-green-400">₹{showReceipt.amount.toLocaleString()}</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowReceipt(null)}
                  className="flex-1 py-2.5 rounded-full border border-white/15 text-xs font-bold text-white/60 hover:bg-white/5 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => alert("Downloading official PDF receipt...")}
                  className="flex-1 py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-sm transition-colors"
                >
                  Download Receipt 📄
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}