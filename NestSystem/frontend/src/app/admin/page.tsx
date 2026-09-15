"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import api, { clearToken } from "@/lib/api";

type Tab = "overview" | "bookings" | "payments" | "students" | "hostels" | "reassign" | "settings" | "mess";

export default function AdminPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [hostels, setHostels] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  // Reassign form state
  const [reassignUserId, setReassignUserId] = useState("");
  const [reassignGroupCode, setReassignGroupCode] = useState("");
  const [reassignSubmitting, setReassignSubmitting] = useState(false);

  // Settings form state
  const [settingsForm, setSettingsForm] = useState<any>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [runningAllocation, setRunningAllocation] = useState(false);

  // Mess menu + live poll state
  const [weekMenu, setWeekMenu] = useState<any[]>([]);
  const [messLoading, setMessLoading] = useState(false);
  const [livePoll, setLivePoll] = useState<any>(null);

  function loadMessMenu() {
    setMessLoading(true);
    const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const skeleton = DAY_NAMES.map((name, i) => ({ day_of_week: i, day_name: name, breakfast: [], lunch: [], dinner: [] }));
    api
      .get("/api/admin/mess/menu")
      .then((r) => {
        setWeekMenu(Array.isArray(r.data) && r.data.length === 7 ? r.data : skeleton);
      })
      .catch(() => setWeekMenu(skeleton))
      .finally(() => setMessLoading(false));
  }

  function loadLivePoll() {
    api
      .get("/api/admin/mess/live-poll/today")
      .then((r) => setLivePoll(r.data))
      .catch(() => setLivePoll(null));
  }

  useEffect(() => {
    if (tab === "mess") {
      loadMessMenu();
      loadLivePoll();
      const interval = setInterval(loadLivePoll, 6000);
      return () => clearInterval(interval);
    }
  }, [tab]);

  async function saveMenuSlot(dayOfWeek: number, mealType: string, items: string[]) {
    try {
      await api.put(`/api/admin/mess/menu/${dayOfWeek}/${mealType}`, { items });
      showToast("ok", "Menu updated — students will see this immediately");
      loadMessMenu();
    } catch {
      showToast("err", "Failed to update menu");
    }
  }

  function showToast(type: "ok" | "err", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }

  function loadAll() {
    setLoading(true);
    Promise.allSettled([
      api.get("/api/admin/overview"),
      api.get("/api/admin/bookings"),
      api.get("/api/admin/payments"),
      api.get("/api/admin/students"),
      api.get("/api/admin/settings"),
    ]).then(([ov, bk, pay, st, se]) => {
      if (ov.status === "fulfilled") setOverview(ov.value.data);
      else router.push("/login");
      if (bk.status === "fulfilled") setBookings(bk.value.data);
      if (pay.status === "fulfilled") setPayments(pay.value.data);
      if (st.status === "fulfilled") setStudents(st.value.data);
      if (se.status === "fulfilled") {
        setSettings(se.value.data);
        setSettingsForm(se.value.data);
      }
      setLoading(false);
    });
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (overview?.hostels) setHostels(overview.hostels);
  }, [overview]);

  function logout() {
    clearToken();
    router.push("/login");
  }

  async function updateCgpa(userId: string, cgpa: string) {
    const value = parseFloat(cgpa);
    if (Number.isNaN(value)) {
      showToast("err", "Enter a valid CGPA");
      return;
    }
    try {
      await api.put(`/api/admin/students/${userId}/cgpa`, { cgpa: value });
      showToast("ok", "CGPA updated");
      setStudents((prev) => prev.map((s) => (s.user_id === userId ? { ...s, cgpa: value } : s)));
    } catch {
      showToast("err", "Failed to update CGPA");
    }
  }

  async function updateHostelCapacity(hostelId: string, capacity: string) {
    const value = parseInt(capacity, 10);
    if (Number.isNaN(value)) {
      showToast("err", "Enter a valid capacity");
      return;
    }
    try {
      await api.put(`/api/admin/hostels/${hostelId}/capacity`, { capacity: value });
      showToast("ok", "Hostel capacity updated");
      setHostels((prev) => prev.map((h) => (h.hostel_id === hostelId ? { ...h, capacity: value } : h)));
      loadAll();
    } catch {
      showToast("err", "Failed to update capacity");
    }
  }

  async function submitReassign(e: React.FormEvent) {
    e.preventDefault();
    if (!reassignUserId || !reassignGroupCode) {
      showToast("err", "Fill in both fields");
      return;
    }
    setReassignSubmitting(true);
    try {
      await api.post("/api/admin/reassign", {
        user_id: reassignUserId,
        group_code: reassignGroupCode,
      });
      showToast("ok", "Student reassigned");
      setReassignUserId("");
      setReassignGroupCode("");
      loadAll();
    } catch {
      showToast("err", "Reassignment failed");
    } finally {
      setReassignSubmitting(false);
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await api.put("/api/admin/settings", settingsForm);
      setSettings(settingsForm);
      showToast("ok", "Settings saved");
    } catch {
      showToast("err", "Failed to save settings");
    } finally {
      setSavingSettings(false);
    }
  }

  async function runAllocation() {
    if (!confirm("Run the hostel allocation pass now? This will allocate rooms for all confirmed, paid groups.")) {
      return;
    }
    setRunningAllocation(true);
    try {
      const res = await api.post("/api/admin/hostel-allocation/run");
      showToast("ok", res?.data?.message || "Allocation pass completed");
      loadAll();
    } catch {
      showToast("err", "Allocation run failed");
    } finally {
      setRunningAllocation(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0B0B0C]">
      <header className="border-b border-white/10 bg-[#151517] text-white sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="text-xl font-semibold">NEST · Admin</span>
          <div className="flex items-center gap-4">
            <button onClick={loadAll} className="text-sm text-white/60 hover:text-blue-300 transition-colors">
              Refresh
            </button>
            <button onClick={logout} className="text-sm text-white/60 hover:text-orange-400 transition-colors">
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-semibold text-white mb-8">System overview</h1>

        {overview && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-10">
            <MetricCard label="Occupancy" value={`${overview.occupancy_pct}%`} />
            <MetricCard label="Rooms filled" value={`${overview.total_occupied}/${overview.total_capacity}`} />
            <MetricCard label="Total students" value={overview.total_students} />
            <MetricCard label="Confirmed groups" value={`${overview.confirmed_groups}/${overview.total_groups}`} />
          </div>
        )}

        <nav className="flex flex-wrap gap-2 mb-6">
          <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>Overview</TabButton>
          <TabButton active={tab === "bookings"} onClick={() => setTab("bookings")}>Bookings</TabButton>
          <TabButton active={tab === "payments"} onClick={() => setTab("payments")}>Payments</TabButton>
          <TabButton active={tab === "students"} onClick={() => setTab("students")}>Students</TabButton>
          <TabButton active={tab === "hostels"} onClick={() => setTab("hostels")}>Hostels</TabButton>
          <TabButton active={tab === "reassign"} onClick={() => setTab("reassign")}>Reassign</TabButton>
          <TabButton active={tab === "settings"} onClick={() => setTab("settings")}>Settings</TabButton>
          <TabButton active={tab === "mess"} onClick={() => setTab("mess")}>Mess</TabButton>
        </nav>

        {loading && <p className="text-white/50 text-sm mb-4">Loading data…</p>}

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {tab === "overview" && overview && (
              <div className="bg-white/[0.03] rounded-xl border border-white/10 shadow-sm p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <SummaryRow label="Total students" value={overview.total_students} />
                <SummaryRow label="Total capacity" value={overview.total_capacity} />
                <SummaryRow label="Total occupied" value={overview.total_occupied} />
                <SummaryRow label="Occupancy %" value={`${overview.occupancy_pct}%`} />
                <SummaryRow label="Total groups" value={overview.total_groups} />
                <SummaryRow label="Confirmed groups" value={overview.confirmed_groups} />
              </div>
            )}

            {tab === "bookings" && (
              <Table
                headers={["Group", "Cluster", "Members", "Status", "Booked at"]}
                emptyLabel="No bookings yet."
                rows={bookings}
                renderRow={(b) => (
                  <tr key={b.booking_id} className="border-t border-white/10">
                    <td className="px-4 py-3 font-medium text-white">{b.group_code}</td>
                    <td className="px-4 py-3 text-white/80">Cluster {b.cluster_number}</td>
                    <td className="px-4 py-3 text-white/80">{b.members.map((m: any) => m.name).join(", ")}</td>
                    <td className="px-4 py-3">
                      <Badge color="blue">{b.status.replace("_", " ")}</Badge>
                    </td>
                    <td className="px-4 py-3 text-white/50">{new Date(b.created_at).toLocaleString()}</td>
                  </tr>
                )}
              />
            )}

            {tab === "payments" && (
              <Table
                headers={["Student", "Roll no", "Amount", "Status", "Transaction ref"]}
                emptyLabel="No payments yet."
                rows={payments}
                renderRow={(p) => (
                  <tr key={p.payment_id} className="border-t border-white/10">
                    <td className="px-4 py-3 font-medium text-white">{p.user_name}</td>
                    <td className="px-4 py-3 text-white/80">{p.roll_no}</td>
                    <td className="px-4 py-3 text-white/80">₹{p.amount}</td>
                    <td className="px-4 py-3">
                      <Badge color={p.status === "paid" ? "green" : "orange"}>{p.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-white/50">{p.transaction_ref}</td>
                  </tr>
                )}
              />
            )}

            {tab === "students" && (
              <div className="bg-white/[0.03] rounded-xl border border-white/10 shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white/[0.05] text-left">
                    <tr>
                      <th className="px-4 py-3 text-white/70">Name</th>
                      <th className="px-4 py-3 text-white/70">Roll no</th>
                      <th className="px-4 py-3 text-white/70">CGPA</th>
                      <th className="px-4 py-3 w-56 text-white/70">Update CGPA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <StudentRow key={s.user_id} student={s} onUpdate={updateCgpa} />
                    ))}
                    {students.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-white/50">
                          No students found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {tab === "hostels" && (
              <div className="bg-white/[0.03] rounded-xl border border-white/10 shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white/[0.05] text-left">
                    <tr>
                      <th className="px-4 py-3 text-white/70">Hostel</th>
                      <th className="px-4 py-3 text-white/70">Current capacity</th>
                      <th className="px-4 py-3 w-56 text-white/70">Update capacity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hostels.map((h) => (
                      <HostelRow key={h.hostel_id} hostel={h} onUpdate={updateHostelCapacity} />
                    ))}
                    {hostels.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-white/50">
                          No hostel data available.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {tab === "reassign" && (
              <div className="bg-white/[0.03] rounded-xl border border-white/10 shadow-sm p-6 max-w-md">
                <h2 className="text-xl font-semibold text-white mb-4">Reassign group</h2>
                <form onSubmit={submitReassign} className="space-y-4">
                  <div>
                    <label className="block text-xs uppercase tracking-wide text-white/50 font-semibold mb-1">
                      Student user ID
                    </label>
                    <input
                      value={reassignUserId}
                      onChange={(e) => setReassignUserId(e.target.value)}
                      className="w-full border border-white/15 bg-white/[0.03] text-white placeholder-white/30 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      placeholder="e.g. usr_1234"
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wide text-white/50 font-semibold mb-1">
                      Target group code
                    </label>
                    <input
                      value={reassignGroupCode}
                      onChange={(e) => setReassignGroupCode(e.target.value)}
                      className="w-full border border-white/15 bg-white/[0.03] text-white placeholder-white/30 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      placeholder="e.g. GRP-042"
                    />
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={reassignSubmitting}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {reassignSubmitting ? "Reassigning…" : "Reassign student"}
                  </motion.button>
                </form>
              </div>
            )}

            {tab === "settings" && (
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white/[0.03] rounded-xl border border-white/10 shadow-sm p-6">
                  <h2 className="text-xl font-semibold text-white mb-4">Allocation window settings</h2>
                  {settingsForm ? (
                    <form onSubmit={saveSettings} className="space-y-4">
                      <div>
                        <label className="block text-xs uppercase tracking-wide text-white/50 font-semibold mb-1">
                          Allotment date
                        </label>
                        <input
                          type="date"
                          value={settingsForm.allotment_date || ""}
                          onChange={(e) => setSettingsForm({ ...settingsForm, allotment_date: e.target.value })}
                          className="w-full border border-white/15 bg-white/[0.03] text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs uppercase tracking-wide text-white/50 font-semibold mb-1">
                            Window start
                          </label>
                          <input
                            type="time"
                            value={settingsForm.window_start_time || ""}
                            onChange={(e) => setSettingsForm({ ...settingsForm, window_start_time: e.target.value })}
                            className="w-full border border-white/15 bg-white/[0.03] text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs uppercase tracking-wide text-white/50 font-semibold mb-1">
                            Window end
                          </label>
                          <input
                            type="time"
                            value={settingsForm.window_end_time || ""}
                            onChange={(e) => setSettingsForm({ ...settingsForm, window_end_time: e.target.value })}
                            className="w-full border border-white/15 bg-white/[0.03] text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          />
                        </div>
                      </div>
                      <ToggleRow
                        label="Manual override: force window open"
                        checked={!!settingsForm.manual_override_open}
                        onChange={(v) => setSettingsForm({ ...settingsForm, manual_override_open: v })}
                      />
                      <ToggleRow
                        label="Manual override: force window closed"
                        checked={!!settingsForm.manual_override_closed}
                        onChange={(v) => setSettingsForm({ ...settingsForm, manual_override_closed: v })}
                      />
                      <ToggleRow
                        label="Hostel preferences open to students"
                        checked={!!settingsForm.hostel_preferences_open}
                        onChange={(v) => setSettingsForm({ ...settingsForm, hostel_preferences_open: v })}
                      />
                      <div className="flex items-center gap-2 pt-1">
                        <span className={`w-2.5 h-2.5 rounded-full ${settingsForm.hostel_allocation_run ? "bg-green-500" : "bg-orange-400"}`} />
                        <span className="text-xs text-white/60">
                          Allocation pass {settingsForm.hostel_allocation_run ? "has already been run" : "has not been run yet"}.
                        </span>
                      </div>
                      <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        type="submit"
                        disabled={savingSettings}
                        className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        {savingSettings ? "Saving…" : "Save settings"}
                      </motion.button>
                    </form>
                  ) : (
                    <p className="text-sm text-white/50">Loading settings…</p>
                  )}
                </div>

                <div className="bg-white/[0.03] rounded-xl border border-white/10 shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-white mb-2">Run allocation</h2>
                  <p className="text-xs text-white/60 mb-4">
                    Triggers the hostel allocation engine for all confirmed groups with cleared payments. This action is
                    irreversible for the current cycle — use with care.
                  </p>
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={runAllocation}
                    disabled={runningAllocation}
                    className="w-full bg-orange-500 hover:bg-orange-400 text-white rounded-lg py-2.5 text-sm font-bold shadow-[0_0_20px_-6px] shadow-orange-500/50 transition-colors disabled:opacity-50"
                  >
                    {runningAllocation ? "Running allocation…" : "Run hostel allocation pass"}
                  </motion.button>
                </div>
              </div>
            )}
            {tab === "mess" && (
              <div className="space-y-8">
                {/* Live poll dashboard */}
                <div>
                  <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                    Live meal poll — today
                    <span className="text-[10px] font-bold text-blue-300 bg-blue-500/10 px-2.5 py-1 rounded-full animate-pulse">
                      ● Live
                    </span>
                  </h2>
                  <div className="grid md:grid-cols-3 gap-5">
                    {["breakfast", "lunch", "dinner"].map((meal) => {
                      const r = livePoll?.[meal];
                      return (
                        <div key={meal} className="bg-white/[0.03] rounded-xl border border-white/10 shadow-sm p-5">
                          <div className="flex items-center justify-between mb-1">
                            <h3 className="text-base font-semibold text-white capitalize">{meal}</h3>
                            {r && (
                              <span
                                className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                                  r.is_open ? "bg-green-500/10 text-green-400" : "bg-white/10 text-white/50"
                                }`}
                              >
                                {r.is_open ? "● Open" : "Closed"}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-white/50 mb-3">
                            {r ? `${r.total_votes} votes · ${r.window_start}–${r.window_end}` : "Loading…"}
                          </p>
                          <div className="space-y-2">
                            {r?.options?.map((label: string, idx: number) => {
                              const votes = r.tally[idx] || 0;
                              const pct = r.total_votes > 0 ? Math.round((votes / r.total_votes) * 100) : 0;
                              return (
                                <div key={idx} className="relative overflow-hidden rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                                  <div
                                    className="absolute left-0 top-0 bottom-0 bg-blue-500/15"
                                    style={{ width: `${pct}%` }}
                                  />
                                  <div className="relative z-10 flex items-center justify-between text-xs">
                                    <span className="font-semibold text-white">{label}</span>
                                    <span className="font-bold text-blue-300">{pct}% ({votes})</span>
                                  </div>
                                </div>
                              );
                            })}
                            {!r && <p className="text-xs text-white/50 text-center py-4">No votes yet.</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Weekly menu editor */}
                <div>
                  <h2 className="text-xl font-semibold text-white mb-4">Weekly mess menu</h2>
                  <p className="text-xs text-white/50 mb-4">
                    Static weekly cycle (not tied to calendar dates). Edits apply immediately — students see the latest
                    version as soon as you save.
                  </p>
                  {messLoading && <p className="text-sm text-white/50">Loading menu…</p>}
                  <div className="space-y-4">
                    {weekMenu.map((day) => (
                      <MenuDayCard key={day.day_of_week} day={day} onSave={saveMenuSlot} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg text-sm font-medium shadow-lg text-white ${
              toast.type === "ok" ? "bg-green-600" : "bg-orange-500"
            }`}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function MenuDayCard({
  day,
  onSave,
}: {
  day: any;
  onSave: (dayOfWeek: number, mealType: string, items: string[]) => void;
}) {
  const [breakfast, setBreakfast] = useState((day.breakfast || []).join(", "));
  const [lunch, setLunch] = useState((day.lunch || []).join(", "));
  const [dinner, setDinner] = useState((day.dinner || []).join(", "));

  function save(mealType: string, value: string) {
    const items = value.split(",").map((s) => s.trim()).filter(Boolean);
    onSave(day.day_of_week, mealType, items);
  }

  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/10 shadow-sm p-5">
      <h3 className="text-base font-semibold text-white mb-3">{day.day_name}</h3>
      <div className="grid md:grid-cols-3 gap-4">
        <MealField label="Breakfast" value={breakfast} onChange={setBreakfast} onSave={() => save("breakfast", breakfast)} />
        <MealField label="Lunch" value={lunch} onChange={setLunch} onSave={() => save("lunch", lunch)} />
        <MealField label="Dinner" value={dinner} onChange={setDinner} onSave={() => save("dinner", dinner)} />
      </div>
    </div>
  );
}

function MealField({
  label,
  value,
  onChange,
  onSave,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
}) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wide text-white/50 font-semibold mb-1">{label}</label>
      <textarea
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Comma-separated dish names"
        className="w-full border border-white/15 bg-white/[0.03] text-white placeholder-white/30 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
      />
      <button
        onClick={onSave}
        className="mt-2 w-full bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-1.5 text-xs font-medium transition-colors"
      >
        Save {label}
      </button>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/10 cursor-pointer">
      <span className="text-xs font-semibold text-white">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-blue-600" />
    </label>
  );
}

function StudentRow({ student, onUpdate }: { student: any; onUpdate: (userId: string, cgpa: string) => void }) {
  const [value, setValue] = useState(String(student.cgpa ?? ""));
  return (
    <tr className="border-t border-white/10">
      <td className="px-4 py-3 font-medium text-white">{student.name}</td>
      <td className="px-4 py-3 text-white/80">{student.roll_no}</td>
      <td className="px-4 py-3 text-white/80">{student.cgpa ?? "—"}</td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-24 border border-white/15 bg-white/[0.03] text-white rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="CGPA"
          />
          <button
            onClick={() => onUpdate(student.user_id, value)}
            className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
          >
            Save
          </button>
        </div>
      </td>
    </tr>
  );
}

function HostelRow({ hostel, onUpdate }: { hostel: any; onUpdate: (hostelId: string, capacity: string) => void }) {
  const [value, setValue] = useState(String(hostel.capacity ?? ""));
  return (
    <tr className="border-t border-white/10">
      <td className="px-4 py-3 font-medium text-white">{hostel.name}</td>
      <td className="px-4 py-3 text-white/80">{hostel.capacity}</td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-24 border border-white/15 bg-white/[0.03] text-white rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="Capacity"
          />
          <button
            onClick={() => onUpdate(hostel.hostel_id, value)}
            className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
          >
            Save
          </button>
        </div>
      </td>
    </tr>
  );
}

function Table({
  headers,
  rows,
  renderRow,
  emptyLabel,
}: {
  headers: string[];
  rows: any[];
  renderRow: (row: any) => React.ReactNode;
  emptyLabel: string;
}) {
  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/10 shadow-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-white/[0.05] text-left">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 text-white/70">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(renderRow)}
          {rows.length === 0 && (
            <tr>
              <td colSpan={headers.length} className="px-4 py-6 text-center text-white/50">
                {emptyLabel}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: "blue" | "green" | "orange" }) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-500/10 text-blue-300",
    green: "bg-green-500/10 text-green-400",
    orange: "bg-orange-500/10 text-orange-400",
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-semibold capitalize ${colorMap[color]}`}>
      {children}
    </span>
  );
}

function SummaryRow({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 pb-3">
      <span className="text-white/60 text-sm">{label}</span>
      <span className="text-lg font-semibold text-white">{value}</span>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: any }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3, borderColor: "rgba(96,165,250,0.4)" }}
      transition={{ duration: 0.3 }}
      className="bg-white/[0.03] rounded-xl p-5 border border-white/10 shadow-sm transition-colors"
    >
      <p className="text-xs uppercase tracking-wide text-white/50 font-semibold mb-1">{label}</p>
      <p className="text-2xl font-semibold text-white">{value}</p>
    </motion.div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={`px-5 py-2 rounded-full text-sm font-medium transition-colors ${
        active
          ? "bg-blue-600 text-white"
          : "bg-white/[0.03] border border-white/15 text-white/60 hover:border-blue-500/40 hover:text-white"
      }`}
    >
      {children}
    </motion.button>
  );
}