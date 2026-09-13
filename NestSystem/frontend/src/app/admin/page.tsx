"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api, { clearToken } from "@/lib/api";

export default function AdminPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [tab, setTab] = useState<"bookings" | "payments">("bookings");

  useEffect(() => {
    api.get("/api/admin/overview").then((r) => setOverview(r.data)).catch(() => router.push("/login"));
    api.get("/api/admin/bookings").then((r) => setBookings(r.data)).catch(() => {});
    api.get("/api/admin/payments").then((r) => setPayments(r.data)).catch(() => {});
  }, []);

  function logout() {
    clearToken();
    router.push("/login");
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-ink/10 bg-ink text-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="font-display text-xl font-semibold">Nest · Admin</span>
          <button onClick={logout} className="text-sm text-white/70 hover:text-white">
            Log out
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10">
        <h1 className="font-display text-3xl font-semibold mb-8">System overview</h1>

        {overview && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-10">
            <MetricCard label="Occupancy" value={`${overview.occupancy_pct}%`} />
            <MetricCard label="Rooms filled" value={`${overview.total_occupied}/${overview.total_capacity}`} />
            <MetricCard label="Total students" value={overview.total_students} />
            <MetricCard label="Confirmed groups" value={`${overview.confirmed_groups}/${overview.total_groups}`} />
          </div>
        )}

        <div className="flex gap-2 mb-6">
          <TabButton active={tab === "bookings"} onClick={() => setTab("bookings")}>
            Bookings
          </TabButton>
          <TabButton active={tab === "payments"} onClick={() => setTab("payments")}>
            Payments
          </TabButton>
        </div>

        {tab === "bookings" && (
          <div className="bg-white rounded-xl2 border border-ink/5 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-sand text-left">
                <tr>
                  <th className="px-4 py-3">Group</th>
                  <th className="px-4 py-3">Cluster</th>
                  <th className="px-4 py-3">Members</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Booked at</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.booking_id} className="border-t border-ink/5">
                    <td className="px-4 py-3 font-medium">{b.group_code}</td>
                    <td className="px-4 py-3">Cluster {b.cluster_number}</td>
                    <td className="px-4 py-3">{b.members.map((m: any) => m.name).join(", ")}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded-full bg-marine/10 text-marine text-xs font-semibold capitalize">
                        {b.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate">{new Date(b.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {bookings.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate">
                      No bookings yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "payments" && (
          <div className="bg-white rounded-xl2 border border-ink/5 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-sand text-left">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Roll no</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Transaction ref</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.payment_id} className="border-t border-ink/5">
                    <td className="px-4 py-3 font-medium">{p.user_name}</td>
                    <td className="px-4 py-3">{p.roll_no}</td>
                    <td className="px-4 py-3">₹{p.amount}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          p.status === "paid" ? "bg-moss/10 text-moss" : "bg-coral/10 text-coral"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate">{p.transaction_ref}</td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate">
                      No payments yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: any }) {
  return (
    <div className="bg-white rounded-xl2 p-5 border border-ink/5 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate font-semibold mb-1">{label}</p>
      <p className="font-display text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-2 rounded-full text-sm font-medium ${
        active ? "bg-ink text-white" : "bg-white border border-ink/15 text-slate"
      }`}
    >
      {children}
    </button>
  );
}
