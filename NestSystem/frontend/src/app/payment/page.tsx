"use client";

import { useEffect, useState } from "react";
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
    <main className="min-h-screen pb-20 bg-sand">
      <Navbar active="/payment" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink mb-1">
            Payments & Billing
          </h1>
          <p className="text-slate text-sm sm:text-base">
            A transparent and cashless experience for hostel fee, mess dues, and transaction receipts.
          </p>
        </div>

        {/* Payment Tabs */}
        <div className="flex gap-2 border-b border-ink/10 mb-8 overflow-x-auto pb-1">
          {[
            { id: "fee", label: "Hostel Fee", icon: "🏢" },
            { id: "mess", label: "Mess Bill", icon: "🍛" },
            { id: "fines", label: "Fines & Extras", icon: "⚠️" },
            { id: "history", label: "Transaction History", icon: "📜" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-5 py-3 font-bold text-xs rounded-t-xl transition flex items-center gap-2 shrink-0 ${
                activeTab === tab.id
                  ? "bg-white text-marine border-t-2 border-x border-marine shadow-xs"
                  : "text-slate hover:text-ink"
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab 1: Hostel Fee */}
        {activeTab === "fee" && (
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Left 2 Cols: Main Fee Breakdown & Payment Card */}
            <div className="lg:col-span-2 space-y-6">
              {/* Fee Status Header Card */}
              <div className="nest-card p-6 bg-gradient-to-r from-marine/5 via-white to-sand border border-marine/20">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate">Annual Residence Fee</span>
                    <h2 className="font-display text-3xl font-bold text-ink mt-1">₹60,000</h2>
                    <p className="text-xs text-slate">Academic Session 2026 – 2027</p>
                  </div>

                  <span
                    className={`px-4 py-1.5 rounded-full text-xs font-bold ${
                      isPaid ? "bg-moss/10 text-moss" : "bg-amber/10 text-amber"
                    }`}
                  >
                    {isPaid ? "✓ Fee Paid" : "● Payment Pending"}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-white border border-ink/10 text-xs text-slate flex items-center justify-between">
                  <span>Due Date: <strong>15 September 2026</strong></span>
                  <span className="text-coral font-bold">No Late Fee Applicable Yet</span>
                </div>
              </div>

              {/* Fee Breakdown Table */}
              <div className="nest-card p-6">
                <h3 className="font-display text-lg font-bold text-ink mb-4 flex items-center gap-2">
                  <span>📑</span> Fee Breakdown
                </h3>

                <div className="space-y-3 divide-y divide-ink/5">
                  <div className="flex items-center justify-between pt-2 text-xs">
                    <span className="text-slate font-medium">Hostel Accommodation Charge</span>
                    <span className="font-bold text-ink">₹48,000</span>
                  </div>
                  <div className="flex items-center justify-between pt-3 text-xs">
                    <span className="text-slate font-medium">Amenities, Wi-Fi & Utility Charges</span>
                    <span className="font-bold text-ink">₹8,000</span>
                  </div>
                  <div className="flex items-center justify-between pt-3 text-xs">
                    <span className="text-slate font-medium">Refundable Security Deposit</span>
                    <span className="font-bold text-ink">₹4,000</span>
                  </div>
                  <div className="flex items-center justify-between pt-4 text-sm border-t-2 border-ink/10">
                    <span className="font-bold text-ink">Total Amount Payable</span>
                    <span className="font-display text-xl font-bold text-marine">₹60,000</span>
                  </div>
                </div>
              </div>

              {/* Payment Methods & Execution */}
              {!isPaid ? (
                <div className="nest-card p-6">
                  <h3 className="font-display text-lg font-bold text-ink mb-4 flex items-center gap-2">
                    <span>💳</span> Select Payment Method
                  </h3>

                  <div className="grid sm:grid-cols-3 gap-3 mb-6">
                    <button
                      onClick={() => setSelectedMethod("upi")}
                      className={`p-4 rounded-xl border text-center transition ${
                        selectedMethod === "upi"
                          ? "border-marine bg-marine/10 ring-2 ring-marine"
                          : "border-ink/10 bg-white hover:border-marine/40"
                      }`}
                    >
                      <span className="text-xl block mb-1">📱</span>
                      <span className="text-xs font-bold text-ink">UPI / QR</span>
                      <span className="text-[10px] text-slate block">GPay, PhonePe, Paytm</span>
                    </button>

                    <button
                      onClick={() => setSelectedMethod("card")}
                      className={`p-4 rounded-xl border text-center transition ${
                        selectedMethod === "card"
                          ? "border-marine bg-marine/10 ring-2 ring-marine"
                          : "border-ink/10 bg-white hover:border-marine/40"
                      }`}
                    >
                      <span className="text-xl block mb-1">💳</span>
                      <span className="text-xs font-bold text-ink">Credit / Debit Card</span>
                      <span className="text-[10px] text-slate block">Visa, Mastercard, RuPay</span>
                    </button>

                    <button
                      onClick={() => setSelectedMethod("netbanking")}
                      className={`p-4 rounded-xl border text-center transition ${
                        selectedMethod === "netbanking"
                          ? "border-marine bg-marine/10 ring-2 ring-marine"
                          : "border-ink/10 bg-white hover:border-marine/40"
                      }`}
                    >
                      <span className="text-xl block mb-1">🏦</span>
                      <span className="text-xs font-bold text-ink">Net Banking</span>
                      <span className="text-[10px] text-slate block">HDFC, SBI, ICICI, Axis</span>
                    </button>
                  </div>

                  <button
                    onClick={handlePay}
                    disabled={loading}
                    className="w-full py-4 bg-coral hover:bg-ink text-white font-bold text-sm rounded-full shadow-lg transition disabled:opacity-50"
                  >
                    {loading ? "Processing Simulated Payment..." : "Pay ₹60,000 Hostel Fee (Simulated)"}
                  </button>

                  <p className="text-[11px] text-slate text-center mt-3">
                    🔒 Payments are currently simulated for test evaluation. Razorpay / Gateway ready.
                  </p>
                </div>
              ) : (
                <div className="nest-card p-6 bg-moss/10 border border-moss/30 text-center">
                  <span className="text-4xl block mb-2">🎉</span>
                  <h3 className="font-display text-2xl font-bold text-moss mb-1">Fee Payment Confirmed</h3>
                  <p className="text-xs text-slate mb-4">
                    Your hostel fee has been received and your room allocation in C-312 is locked in.
                  </p>
                  <button
                    onClick={() =>
                      setShowReceipt({
                        ref: "SIMPAY-AVLEEN01",
                        amount: 60000,
                        date: "04 Sep 2026",
                        method: "UPI",
                        fee_type: "Annual Hostel Fee (2026-27)",
                      })
                    }
                    className="px-6 py-2.5 bg-moss text-white font-bold text-xs rounded-full shadow-md hover:bg-ink transition"
                  >
                    📄 View & Download Receipt
                  </button>
                </div>
              )}
            </div>

            {/* Right 1 Col: Group Payment Status */}
            <div className="space-y-6">
              <div className="nest-card p-6">
                <h3 className="font-display text-lg font-bold text-ink mb-4 flex items-center gap-2">
                  <span>👥</span> Group Payment Status
                </h3>

                <ul className="divide-y divide-ink/10 mb-4">
                  {statuses.map((s) => (
                    <li key={s.user_id} className="py-3 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-xs text-ink">{s.name}</p>
                        <p className="text-[10px] text-slate">Member</p>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                          s.status === "paid" ? "bg-moss/10 text-moss" : "bg-amber/10 text-amber"
                        }`}
                      >
                        {s.status === "paid" ? "Paid ✓" : "Pending"}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="p-3 rounded-xl bg-sand/60 border border-ink/5 text-[11px] text-slate">
                  💡 Allotment is member-by-member: as soon as your payment clears, your seat is reserved.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Mess Bill */}
        {activeTab === "mess" && (
          <div className="nest-card p-6">
            <h3 className="font-display text-xl font-bold text-ink mb-4">Monthly Mess Billing</h3>
            <div className="p-4 rounded-xl bg-moss/10 border border-moss/30 mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-moss">Mess Dues Status: Fully Paid</p>
                <p className="text-[10px] text-slate">September mess charges included in annual hostel fee.</p>
              </div>
              <span className="text-sm font-bold text-ink">₹0 Pending</span>
            </div>
          </div>
        )}

        {/* Tab 3: Fines */}
        {activeTab === "fines" && (
          <div className="nest-card p-6">
            <h3 className="font-display text-xl font-bold text-ink mb-4">Fines & Penalties</h3>
            <p className="text-xs text-slate">Clean record! No active fines or late charges recorded.</p>
          </div>
        )}

        {/* Tab 4: History */}
        {activeTab === "history" && (
          <div className="nest-card p-6">
            <h3 className="font-display text-xl font-bold text-ink mb-4">Recent Payment History</h3>
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-sand/60 border border-ink/10 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-ink">Annual Hostel Fee (2026-27)</p>
                  <p className="text-[10px] text-slate">Ref: SIMPAY-AVLEEN01 · 04 Sep 2026</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-ink">₹60,000</p>
                  <span className="text-[10px] font-bold text-moss">Paid ✓</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {message && <p className="text-xs text-center text-slate mt-4">{message}</p>}
        {allocationMsg && <p className="text-xs text-center text-marine font-bold mt-2">{allocationMsg}</p>}
      </div>

      {/* Payment Receipt Modal */}
      {showReceipt && (
        <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-ink/10">
            <div className="text-center pb-4 border-b border-ink/10 mb-4">
              <div className="w-12 h-12 rounded-full bg-moss/10 text-moss font-bold text-2xl flex items-center justify-center mx-auto mb-2">
                ✓
              </div>
              <h3 className="font-display text-xl font-bold text-ink">Payment Successful</h3>
              <p className="text-xs text-slate">Thapar Institute Hostel Fee Receipt</p>
            </div>

            <div className="space-y-3 text-xs mb-6">
              <div className="flex items-center justify-between">
                <span className="text-slate font-medium">Student Name</span>
                <span className="font-bold text-ink">Avleen Kaur</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate font-medium">Roll Number</span>
                <span className="font-bold text-ink">102303011</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate font-medium">Transaction Ref</span>
                <span className="font-mono font-bold text-marine">{showReceipt.ref}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate font-medium">Payment Date</span>
                <span className="font-bold text-ink">{showReceipt.date}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate font-medium">Payment Method</span>
                <span className="font-bold text-ink">{showReceipt.method}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-ink/10 text-sm">
                <span className="font-bold text-ink">Amount Paid</span>
                <span className="font-display font-bold text-moss">₹{showReceipt.amount.toLocaleString()}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowReceipt(null)}
                className="flex-1 py-2.5 rounded-full border border-ink/20 text-xs font-bold text-slate hover:bg-sand transition"
              >
                Close
              </button>
              <button
                onClick={() => alert("Downloading official PDF receipt...")}
                className="flex-1 py-2.5 rounded-full bg-marine hover:bg-ink text-white text-xs font-bold shadow-md transition"
              >
                Download Receipt 📄
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
