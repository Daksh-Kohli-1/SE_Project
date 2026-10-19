"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import api, { clearToken } from "@/lib/api";

type Tab =
  | "overview"
  | "hostel-allotment"
  | "students"
  | "hostels"
  | "bookings"
  | "payments"
  | "reassign"
  | "settings"
  | "test-lab"
  | "mess";

const PAGE_SIZE = 50;
const DAY_MS = 86400000;

function toLocalInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fromLocalInput(v: string) {
  return v ? new Date(v).toISOString() : null;
}
function fmt(iso?: string | null) {
  return iso ? new Date(iso).toLocaleString() : "—";
}
function errMsg(err: any, fallback: string) {
  const d = err?.response?.data?.detail;
  return typeof d === "string" ? d : fallback;
}

const STATE_META: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-green-500/10 text-green-400" },
  not_started: { label: "Not started", cls: "bg-blue-500/10 text-blue-300" },
  closed: { label: "Closed — ready to allot", cls: "bg-orange-500/10 text-orange-400" },
  allotted: { label: "Hostels allotted", cls: "bg-purple-500/10 text-purple-300" },
};

export default function AdminPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [hostels, setHostels] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [demand, setDemand] = useState<any>(null);
  const [allocResult, setAllocResult] = useState<any>(null);
  const [runSummary, setRunSummary] = useState<any>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  // Students (server-side paging)
  const [students, setStudents] = useState<any[]>([]);
  const [studentTotal, setStudentTotal] = useState(0);
  const [studentPage, setStudentPage] = useState(1);
  const [studentQuery, setStudentQuery] = useState("");
  const [genderFilter, setGenderFilter] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");

  // Reassign form (moves one booking row of a group to another cluster)
  const [reassignGroupId, setReassignGroupId] = useState("");
  const [reassignClusterId, setReassignClusterId] = useState("");
  const [reassignSubmitting, setReassignSubmitting] = useState(false);

  // Hostel preference window form
  const [windowForm, setWindowForm] = useState({ opens: "", closes: "" });
  const [openDays, setOpenDays] = useState(4);
  const [savingWindow, setSavingWindow] = useState(false);
  const [runningAllotment, setRunningAllotment] = useState(false);

  // Room allotment ("billing day") window form
  const [roomForm, setRoomForm] = useState<any>(null);
  const [savingRoomSettings, setSavingRoomSettings] = useState(false);

  // Mess menu + live poll state
  const [weekMenu, setWeekMenu] = useState<any[]>([]);
  const [messLoading, setMessLoading] = useState(false);
  const [livePoll, setLivePoll] = useState<any>(null);

  function showToast(type: "ok" | "err", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }

  /* ---------------- Mess ---------------- */
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

  /* ---------------- Data loading ---------------- */
  function applySettings(s: any) {
    setSettings(s);
    setWindowForm({ opens: toLocalInput(s.hostel_pref_opens_at), closes: toLocalInput(s.hostel_pref_closes_at) });
    setRoomForm({
      allotment_date: s.allotment_date || "",
      window_start_time: s.window_start_time || "",
      window_end_time: s.window_end_time || "",
      manual_override_open: !!s.manual_override_open,
      manual_override_closed: !!s.manual_override_closed,
    });
  }

  function loadAll() {
    setLoading(true);
    Promise.allSettled([
      api.get("/api/admin/overview"),
      api.get("/api/admin/bookings"),
      api.get("/api/admin/payments"),
      api.get("/api/admin/hostels"),
      api.get("/api/admin/settings"),
      api.get("/api/admin/hostel-allocation/demand"),
      api.get("/api/admin/hostel-allocation/result"),
    ]).then(([ov, bk, pay, ho, se, de, re]) => {
      if (ov.status === "fulfilled") setOverview(ov.value.data);
      else router.push("/login");
      if (bk.status === "fulfilled") setBookings(bk.value.data);
      if (pay.status === "fulfilled") setPayments(pay.value.data);
      if (ho.status === "fulfilled") setHostels(ho.value.data);
      if (se.status === "fulfilled") applySettings(se.value.data);
      if (de.status === "fulfilled") setDemand(de.value.data);
      if (re.status === "fulfilled") setAllocResult(re.value.data);
      setLoading(false);
    });
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadStudents() {
    api
      .get("/api/admin/students", {
        params: {
          page: studentPage,
          page_size: PAGE_SIZE,
          q: studentQuery,
          gender: genderFilter,
          assigned: assignedFilter,
        },
      })
      .then((r) => {
        setStudents(r.data.items);
        setStudentTotal(r.data.total);
      })
      .catch(() => showToast("err", "Could not load students"));
  }

  useEffect(() => {
    if (tab !== "students") return;
    const t = setTimeout(loadStudents, 300); // debounce typing in the search box
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, studentPage, studentQuery, genderFilter, assignedFilter]);

  function logout() {
    clearToken();
    router.push("/login");
  }

  /* ---------------- Students / hostels ---------------- */
  async function updateCgpa(userId: string, cgpa: string) {
    const value = parseFloat(cgpa);
    if (Number.isNaN(value) || value < 0 || value > 10) {
      showToast("err", "Enter a CGPA between 0 and 10");
      return;
    }
    try {
      await api.put(`/api/admin/students/${userId}/cgpa`, { cgpa: value });
      showToast("ok", "CGPA updated");
      setStudents((prev) => prev.map((s) => (s.id === userId ? { ...s, cgpa: value } : s)));
    } catch (err) {
      showToast("err", errMsg(err, "Failed to update CGPA"));
    }
  }

  async function updateHostelCapacity(hostelId: string, capacity: string) {
    const value = parseInt(capacity, 10);
    if (Number.isNaN(value) || value < 0) {
      showToast("err", "Enter a valid capacity");
      return;
    }
    try {
      await api.put(`/api/admin/hostels/${hostelId}/capacity`, { capacity: value });
      showToast("ok", "Hostel capacity updated");
      loadAll();
    } catch (err) {
      showToast("err", errMsg(err, "Failed to update capacity"));
    }
  }

  async function submitReassign(e: React.FormEvent) {
    e.preventDefault();
    if (!reassignGroupId || !reassignClusterId) {
      showToast("err", "Fill in both fields");
      return;
    }
    setReassignSubmitting(true);
    try {
      await api.post("/api/admin/reassign", { group_id: reassignGroupId, new_cluster_id: reassignClusterId });
      showToast("ok", "Group reassigned");
      setReassignGroupId("");
      setReassignClusterId("");
      loadAll();
    } catch (err) {
      showToast("err", errMsg(err, "Reassignment failed"));
    } finally {
      setReassignSubmitting(false);
    }
  }

  /* ---------------- Hostel preference window ---------------- */
  async function saveWindow(patch: any, okMsg = "Hostel window updated") {
    setSavingWindow(true);
    try {
      const r = await api.put("/api/admin/settings", patch);
      applySettings(r.data);
      showToast("ok", okMsg);
      api.get("/api/admin/overview").then((o) => setOverview(o.data)).catch(() => {});
      api.get("/api/admin/hostel-allocation/demand").then((d) => setDemand(d.data)).catch(() => {});
    } catch (err) {
      showToast("err", errMsg(err, "Could not update the window"));
    } finally {
      setSavingWindow(false);
    }
  }

  function saveWindowForm(e: React.FormEvent) {
    e.preventDefault();
    saveWindow({
      hostel_pref_opens_at: fromLocalInput(windowForm.opens),
      hostel_pref_closes_at: fromLocalInput(windowForm.closes),
    });
  }

  function openNow() {
    const now = Date.now();
    saveWindow(
      {
        hostel_pref_opens_at: new Date(now).toISOString(),
        hostel_pref_closes_at: new Date(now + Math.max(1, openDays) * DAY_MS).toISOString(),
        hostel_pref_manual_override_open: false,
        hostel_pref_manual_override_closed: false,
      },
      `Window opened for ${openDays} day${openDays === 1 ? "" : "s"}`
    );
  }

  function shiftClose(days: number) {
    const base = settings?.hostel_pref_closes_at ? new Date(settings.hostel_pref_closes_at).getTime() : Date.now();
    saveWindow(
      { hostel_pref_closes_at: new Date(base + days * DAY_MS).toISOString() },
      days > 0 ? `Closing time extended by ${days} day` : `Closing time moved ${-days} day earlier`
    );
  }

  function closeNow() {
    if (!confirm("Close the hostel preference window now? Students will no longer be able to change rankings or groups.")) return;
    const now = Date.now();
    const opens = settings?.hostel_pref_opens_at ? new Date(settings.hostel_pref_opens_at).getTime() : null;
    saveWindow(
      {
        hostel_pref_closes_at: new Date(now).toISOString(),
        // the window must close after it opens
        ...(opens === null || opens >= now ? { hostel_pref_opens_at: new Date(now - 60000).toISOString() } : {}),
        hostel_pref_manual_override_open: false,
        hostel_pref_manual_override_closed: false,
      },
      "Window closed"
    );
  }

  async function runHostelAllotment() {
    const rerun = !!settings?.hostel_allocation_run;
    const msg = rerun
      ? "Hostels were already allotted. Re-running recomputes EVERY assignment from the current data. Continue?"
      : "Allot hostels now? Every student and group will be assigned a hostel based on CGPA and their ranking.";
    if (!confirm(msg)) return;
    setRunningAllotment(true);
    try {
      const r = await api.post("/api/admin/hostel-allocation/run");
      setRunSummary(r.data);
      showToast("ok", r.data?.message || "Hostel allotment complete");
      loadAll();
    } catch (err) {
      showToast("err", errMsg(err, "Allotment failed"));
    } finally {
      setRunningAllotment(false);
    }
  }

  /* ---------------- Room allotment window ---------------- */
  async function saveRoomSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingRoomSettings(true);
    try {
      const r = await api.put("/api/admin/settings", {
        allotment_date: roomForm.allotment_date || null,
        window_start_time: roomForm.window_start_time,
        window_end_time: roomForm.window_end_time,
        manual_override_open: roomForm.manual_override_open,
        manual_override_closed: roomForm.manual_override_closed,
      });
      applySettings(r.data);
      showToast("ok", "Room allotment settings saved");
    } catch (err) {
      showToast("err", errMsg(err, "Failed to save settings"));
    } finally {
      setSavingRoomSettings(false);
    }
  }

  /* ---------------- Derived: demand + result per hostel ---------------- */
  const hostelRows = useMemo(() => {
    const resultById: Record<string, any> = {};
    (allocResult?.hostels || []).forEach((h: any) => (resultById[h.hostel_id] = h));
    const rows = (demand?.hostels || []).map((d: any) => ({ ...d, result: resultById[d.hostel_id] }));
    return rows.sort(
      (a: any, b: any) => a.gender.localeCompare(b.gender) || (b.pressure ?? 0) - (a.pressure ?? 0)
    );
  }, [demand, allocResult]);

  const windowState: string = settings?.hostel_window?.state || "closed";
  const stateMeta = STATE_META[windowState] || STATE_META.closed;
  const totalPages = Math.max(1, Math.ceil(studentTotal / PAGE_SIZE));
  const summary = demand?.summary;

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
            <MetricCard label="Total students" value={overview.total_students} />
            <MetricCard label="Hostel allotted" value={`${overview.students_with_hostel}/${overview.total_students}`} />
            <MetricCard label="Rooms filled" value={`${overview.total_occupied}/${overview.total_capacity}`} />
            <MetricCard label="Confirmed groups" value={`${overview.confirmed_groups}/${overview.total_groups}`} />
          </div>
        )}

        <nav className="flex flex-wrap gap-2 mb-6">
          <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>Overview</TabButton>
          <TabButton active={tab === "hostel-allotment"} onClick={() => setTab("hostel-allotment")}>Hostel allotment</TabButton>
          <TabButton active={tab === "students"} onClick={() => setTab("students")}>Students</TabButton>
          <TabButton active={tab === "hostels"} onClick={() => setTab("hostels")}>Hostels</TabButton>
          <TabButton active={tab === "bookings"} onClick={() => setTab("bookings")}>Bookings</TabButton>
          <TabButton active={tab === "payments"} onClick={() => setTab("payments")}>Payments</TabButton>
          <TabButton active={tab === "reassign"} onClick={() => setTab("reassign")}>Reassign</TabButton>
          <TabButton active={tab === "settings"} onClick={() => setTab("settings")}>Room window</TabButton>
          <TabButton active={tab === "test-lab"} onClick={() => setTab("test-lab")}>🧪 Test lab</TabButton>
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
              <div className="space-y-6">
                <div className="bg-white/[0.03] rounded-xl border border-white/10 shadow-sm p-6 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-white/50 font-semibold mb-1">Current stage</p>
                    <p className="text-sm text-white/80">
                      Hostel preference window:{" "}
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${stateMeta.cls}`}>{stateMeta.label}</span>
                    </p>
                  </div>
                  <button onClick={() => setTab("hostel-allotment")} className="text-xs font-bold text-blue-300 hover:text-blue-200">
                    Manage hostel allotment →
                  </button>
                </div>
                <div className="bg-white/[0.03] rounded-xl border border-white/10 shadow-sm p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <SummaryRow label="Total students" value={overview.total_students} />
                  <SummaryRow label="Students with a hostel" value={overview.students_with_hostel} />
                  <SummaryRow label="Total hostels" value={overview.total_hostels} />
                  <SummaryRow label="Total seats" value={overview.total_capacity} />
                  <SummaryRow label="Seats occupied" value={overview.total_occupied} />
                  <SummaryRow label="Occupancy %" value={`${overview.occupancy_pct}%`} />
                  <SummaryRow label="Total groups" value={overview.total_groups} />
                  <SummaryRow label="Confirmed groups" value={overview.confirmed_groups} />
                </div>
              </div>
            )}

            {tab === "hostel-allotment" && (
              <div className="space-y-6">
                {/* ---- 1. Preference window ---- */}
                <div className="bg-white/[0.03] rounded-xl border border-white/10 shadow-sm p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h2 className="text-xl font-semibold text-white">1 · Hostel preference window</h2>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${stateMeta.cls}`}>{stateMeta.label}</span>
                  </div>
                  <p className="text-xs text-white/60 mb-5">
                    Students create/join groups and group leaders rank hostels while this window is open (normally 3–4
                    days). Once it closes, groups are frozen until you allot hostels. You can extend or shorten the
                    window at any time.
                  </p>

                  {settings ? (
                    <>
                      <div className="grid md:grid-cols-2 gap-4 mb-4">
                        <ReadOnlyField label="Opens" value={fmt(settings.hostel_pref_opens_at)} />
                        <ReadOnlyField label="Closes" value={fmt(settings.hostel_pref_closes_at)} />
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mb-6">
                        <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5">
                          <span className="text-xs text-white/60">Open now for</span>
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={openDays}
                            onChange={(e) => setOpenDays(parseInt(e.target.value, 10) || 1)}
                            className="w-14 border border-white/15 bg-white/[0.03] text-white rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <span className="text-xs text-white/60">days</span>
                          <button
                            onClick={openNow}
                            disabled={savingWindow}
                            className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium disabled:opacity-50"
                          >
                            Open
                          </button>
                        </div>
                        <button onClick={() => shiftClose(1)} disabled={savingWindow} className="px-3 py-2 rounded-lg bg-white/[0.05] border border-white/15 text-white/80 hover:text-white text-xs font-medium disabled:opacity-50">
                          +1 day
                        </button>
                        <button onClick={() => shiftClose(-1)} disabled={savingWindow} className="px-3 py-2 rounded-lg bg-white/[0.05] border border-white/15 text-white/80 hover:text-white text-xs font-medium disabled:opacity-50">
                          −1 day
                        </button>
                        <button onClick={closeNow} disabled={savingWindow || windowState === "closed" || windowState === "allotted"} className="px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500 hover:text-white text-xs font-medium disabled:opacity-40">
                          Close now
                        </button>
                      </div>

                      <form onSubmit={saveWindowForm} className="space-y-4 border-t border-white/10 pt-5">
                        <p className="text-xs text-white/50">Or set exact times (your local time):</p>
                        <div className="grid md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs uppercase tracking-wide text-white/50 font-semibold mb-1">Opens at</label>
                            <input
                              type="datetime-local"
                              value={windowForm.opens}
                              onChange={(e) => setWindowForm({ ...windowForm, opens: e.target.value })}
                              className="w-full border border-white/15 bg-white/[0.03] text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs uppercase tracking-wide text-white/50 font-semibold mb-1">Closes at</label>
                            <input
                              type="datetime-local"
                              value={windowForm.closes}
                              onChange={(e) => setWindowForm({ ...windowForm, closes: e.target.value })}
                              className="w-full border border-white/15 bg-white/[0.03] text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                          </div>
                        </div>
                        <ToggleRow
                          label="Emergency override: force window open"
                          checked={!!settings.hostel_pref_manual_override_open}
                          onChange={(v) => saveWindow({ hostel_pref_manual_override_open: v, ...(v ? { hostel_pref_manual_override_closed: false } : {}) }, "Override updated")}
                        />
                        <ToggleRow
                          label="Emergency override: force window closed"
                          checked={!!settings.hostel_pref_manual_override_closed}
                          onChange={(v) => saveWindow({ hostel_pref_manual_override_closed: v, ...(v ? { hostel_pref_manual_override_open: false } : {}) }, "Override updated")}
                        />
                        <motion.button
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.98 }}
                          type="submit"
                          disabled={savingWindow}
                          className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                        >
                          {savingWindow ? "Saving…" : "Save window"}
                        </motion.button>
                      </form>
                    </>
                  ) : (
                    <p className="text-sm text-white/50">Loading settings…</p>
                  )}
                </div>

                {/* ---- 2. Allot ---- */}
                <div className="bg-white/[0.03] rounded-xl border border-white/10 shadow-sm p-6">
                  <h2 className="text-xl font-semibold text-white mb-1">2 · Allot hostels</h2>
                  <p className="text-xs text-white/60 mb-5">
                    Highest (group-average) CGPA picks first; each unit gets its best-ranked hostel that still has room,
                    so popular hostels end up with a higher CGPA cutoff. Groups stay together where possible. Students
                    who never ranked hostels get whatever space is left.
                  </p>

                  {summary && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                      <MetricCard label="Students" value={summary.total_students} />
                      <MetricCard label="Ranked hostels" value={summary.applied_students} />
                      <MetricCard label="Not applied" value={summary.not_applied_students} />
                      <MetricCard label="Groups (2+)" value={summary.group_units} />
                    </div>
                  )}

                  {summary && (
                    <div className="grid md:grid-cols-2 gap-3 mb-5">
                      {["male", "female"].map((g) => {
                        const need = summary.students_by_gender?.[g] ?? 0;
                        const have = summary.capacity_by_gender?.[g] ?? 0;
                        const short = need > have;
                        return (
                          <div key={g} className={`rounded-lg border px-4 py-3 text-xs ${short ? "border-orange-500/30 bg-orange-500/10 text-orange-400" : "border-white/10 bg-white/[0.02] text-white/70"}`}>
                            <span className="capitalize font-semibold">{g === "male" ? "Boys" : "Girls"}:</span> {need} students · {have} seats
                            {short && ` — ${need - have} students will be left without a hostel. Increase capacity first.`}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {windowState === "open" && (
                    <p className="text-xs text-orange-400 mb-3">Close the preference window before allotting.</p>
                  )}
                  {windowState === "not_started" && (
                    <p className="text-xs text-orange-400 mb-3">The preference window hasn't opened yet.</p>
                  )}

                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={runHostelAllotment}
                    disabled={runningAllotment || windowState === "open" || windowState === "not_started"}
                    className="bg-orange-500 hover:bg-orange-400 text-white rounded-lg px-6 py-2.5 text-sm font-bold shadow-[0_0_20px_-6px] shadow-orange-500/50 transition-colors disabled:opacity-40"
                  >
                    {runningAllotment ? "Allotting hostels…" : settings?.hostel_allocation_run ? "Re-run hostel allotment" : "Allot hostels"}
                  </motion.button>
                  {settings?.hostel_allocation_run && (
                    <p className="text-[11px] text-white/50 mt-2">
                      Last run: {fmt(settings.hostel_allocation_run_at)}. Re-running is blocked once room bookings exist.
                    </p>
                  )}

                  {runSummary && (
                    <div className="mt-6 border-t border-white/10 pt-5">
                      <p className="text-sm text-white mb-3">
                        {runSummary.assigned_count}/{runSummary.total_students} students allotted
                        {runSummary.unassigned_count > 0 && (
                          <span className="text-orange-400"> · {runSummary.unassigned_count} without a hostel</span>
                        )}
                      </p>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {Object.entries(runSummary.rank_breakdown || {})
                          .sort(([a], [b]) => (a === "fallback" ? 1 : b === "fallback" ? -1 : Number(a) - Number(b)))
                          .map(([k, v]) => (
                            <span key={k} className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-300 text-xs font-semibold">
                              {k === "fallback" ? "Fallback hostel" : `Choice #${k}`}: {v as number}
                            </span>
                          ))}
                      </div>
                      {runSummary.unassigned_roll_nos?.length > 0 && (
                        <details className="text-xs text-white/60">
                          <summary className="cursor-pointer text-orange-400">Unplaced roll numbers ({runSummary.unassigned_roll_nos.length})</summary>
                          <p className="mt-2 break-words">{runSummary.unassigned_roll_nos.join(", ")}</p>
                        </details>
                      )}
                    </div>
                  )}
                </div>

                {/* ---- 3. Demand + results ---- */}
                <div>
                  <h2 className="text-xl font-semibold text-white mb-1">3 · Demand &amp; cutoffs</h2>
                  <p className="text-xs text-white/60 mb-3">
                    “1st-choice demand” counts students ranking the hostel first; pressure is that divided by capacity.
                    After allotment, “Min CGPA” is the lowest CGPA admitted — the effective cutoff.
                  </p>
                  <div className="bg-white/[0.03] rounded-xl border border-white/10 shadow-sm overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-white/[0.05] text-left">
                        <tr>
                          {["Hostel", "Seats", "1st-choice demand", "Any-rank demand", "Pressure", "Allotted", "Min CGPA", "Avg CGPA"].map((h) => (
                            <th key={h} className="px-4 py-3 text-white/70 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {hostelRows.map((r: any) => (
                          <tr key={r.hostel_id} className="border-t border-white/10">
                            <td className="px-4 py-3 font-medium text-white whitespace-nowrap">
                              {r.name} <span className="text-[10px] text-white/40 uppercase ml-1">{r.gender === "male" ? "boys" : "girls"}</span>
                            </td>
                            <td className="px-4 py-3 text-white/80">{r.capacity}</td>
                            <td className="px-4 py-3 text-white/80">{r.first_choice_students}</td>
                            <td className="px-4 py-3 text-white/80">{r.any_choice_students}</td>
                            <td className="px-4 py-3">
                              {r.pressure == null ? "—" : (
                                <Badge color={r.pressure > 1 ? "orange" : "green"}>{r.pressure}×</Badge>
                              )}
                            </td>
                            <td className="px-4 py-3 text-white/80">{r.result ? `${r.result.allotted}/${r.capacity}` : "—"}</td>
                            <td className="px-4 py-3 font-semibold text-blue-300">{r.result?.min_cgpa ?? "—"}</td>
                            <td className="px-4 py-3 text-white/80">{r.result?.avg_cgpa ?? "—"}</td>
                          </tr>
                        ))}
                        {hostelRows.length === 0 && (
                          <tr>
                            <td colSpan={8} className="px-4 py-6 text-center text-white/50">No hostel data yet.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {tab === "students" && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-3">
                  <input
                    value={studentQuery}
                    onChange={(e) => { setStudentQuery(e.target.value); setStudentPage(1); }}
                    placeholder="Search name, roll no or email"
                    className="flex-1 min-w-[220px] border border-white/15 bg-white/[0.03] text-white placeholder-white/30 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <select
                    value={genderFilter}
                    onChange={(e) => { setGenderFilter(e.target.value); setStudentPage(1); }}
                    className="border border-white/15 bg-[#151517] text-white rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">All genders</option>
                    <option value="male">Boys</option>
                    <option value="female">Girls</option>
                  </select>
                  <select
                    value={assignedFilter}
                    onChange={(e) => { setAssignedFilter(e.target.value); setStudentPage(1); }}
                    className="border border-white/15 bg-[#151517] text-white rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Any hostel status</option>
                    <option value="yes">Hostel allotted</option>
                    <option value="no">No hostel yet</option>
                  </select>
                </div>

                <div className="bg-white/[0.03] rounded-xl border border-white/10 shadow-sm overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white/[0.05] text-left">
                      <tr>
                        <th className="px-4 py-3 text-white/70">Name</th>
                        <th className="px-4 py-3 text-white/70">Roll no</th>
                        <th className="px-4 py-3 text-white/70">Group</th>
                        <th className="px-4 py-3 text-white/70">CGPA</th>
                        <th className="px-4 py-3 text-white/70">Hostel</th>
                        <th className="px-4 py-3 w-56 text-white/70">Update CGPA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s) => (
                        <StudentRow key={s.id} student={s} onUpdate={updateCgpa} />
                      ))}
                      {students.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-6 text-center text-white/50">No students found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between text-xs text-white/60">
                  <span>{studentTotal} students · page {studentPage} of {totalPages}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setStudentPage((p) => Math.max(1, p - 1))}
                      disabled={studentPage <= 1}
                      className="px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/15 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setStudentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={studentPage >= totalPages}
                      className="px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/15 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}

            {tab === "hostels" && (
              <div className="bg-white/[0.03] rounded-xl border border-white/10 shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white/[0.05] text-left">
                    <tr>
                      <th className="px-4 py-3 text-white/70">Hostel</th>
                      <th className="px-4 py-3 text-white/70">Type</th>
                      <th className="px-4 py-3 text-white/70">Capacity (used by allotment)</th>
                      <th className="px-4 py-3 text-white/70">Seats built</th>
                      <th className="px-4 py-3 text-white/70">Allotted</th>
                      <th className="px-4 py-3 w-56 text-white/70">Update capacity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hostels.map((h) => (
                      <HostelRow key={`${h.hostel_id}-${h.capacity}`} hostel={h} onUpdate={updateHostelCapacity} />
                    ))}
                    {hostels.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-white/50">No hostel data available.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
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

            {tab === "reassign" && (
              <div className="bg-white/[0.03] rounded-xl border border-white/10 shadow-sm p-6 max-w-md">
                <h2 className="text-xl font-semibold text-white mb-1">Reassign group to another cluster</h2>
                <p className="text-xs text-white/50 mb-4">Moves the group's (first) booking row. Room-stage tool — use after rooms are booked.</p>
                <form onSubmit={submitReassign} className="space-y-4">
                  <div>
                    <label className="block text-xs uppercase tracking-wide text-white/50 font-semibold mb-1">Group ID</label>
                    <input
                      value={reassignGroupId}
                      onChange={(e) => setReassignGroupId(e.target.value)}
                      className="w-full border border-white/15 bg-white/[0.03] text-white placeholder-white/30 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      placeholder="group id"
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wide text-white/50 font-semibold mb-1">Target cluster ID</label>
                    <input
                      value={reassignClusterId}
                      onChange={(e) => setReassignClusterId(e.target.value)}
                      className="w-full border border-white/15 bg-white/[0.03] text-white placeholder-white/30 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      placeholder="cluster id"
                    />
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={reassignSubmitting}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {reassignSubmitting ? "Reassigning…" : "Reassign group"}
                  </motion.button>
                </form>
              </div>
            )}

            {tab === "settings" && (
              <div className="bg-white/[0.03] rounded-xl border border-white/10 shadow-sm p-6 max-w-2xl">
                <h2 className="text-xl font-semibold text-white mb-1">Room allotment &amp; payment window</h2>
                <p className="text-xs text-white/60 mb-4">
                  The single “billing day” when students rank clusters, pay the fee and get rooms. Open it a few days
                  after hostels have been allotted.
                </p>
                {roomForm ? (
                  <form onSubmit={saveRoomSettings} className="space-y-4">
                    <div>
                      <label className="block text-xs uppercase tracking-wide text-white/50 font-semibold mb-1">Allotment date</label>
                      <input
                        type="date"
                        value={roomForm.allotment_date}
                        onChange={(e) => setRoomForm({ ...roomForm, allotment_date: e.target.value })}
                        className="w-full border border-white/15 bg-white/[0.03] text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs uppercase tracking-wide text-white/50 font-semibold mb-1">Window start</label>
                        <input
                          type="time"
                          value={roomForm.window_start_time}
                          onChange={(e) => setRoomForm({ ...roomForm, window_start_time: e.target.value })}
                          className="w-full border border-white/15 bg-white/[0.03] text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs uppercase tracking-wide text-white/50 font-semibold mb-1">Window end</label>
                        <input
                          type="time"
                          value={roomForm.window_end_time}
                          onChange={(e) => setRoomForm({ ...roomForm, window_end_time: e.target.value })}
                          className="w-full border border-white/15 bg-white/[0.03] text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>
                    <ToggleRow
                      label="Manual override: force window open"
                      checked={!!roomForm.manual_override_open}
                      onChange={(v) => setRoomForm({ ...roomForm, manual_override_open: v })}
                    />
                    <ToggleRow
                      label="Manual override: force window closed"
                      checked={!!roomForm.manual_override_closed}
                      onChange={(v) => setRoomForm({ ...roomForm, manual_override_closed: v })}
                    />
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      type="submit"
                      disabled={savingRoomSettings}
                      className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {savingRoomSettings ? "Saving…" : "Save settings"}
                    </motion.button>
                  </form>
                ) : (
                  <p className="text-sm text-white/50">Loading settings…</p>
                )}
              </div>
            )}

            {tab === "test-lab" && <TestLab showToast={showToast} onChanged={loadAll} />}

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

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
      <p className="text-[10px] uppercase tracking-wide text-white/50 font-semibold mb-0.5">{label}</p>
      <p className="text-sm text-white">{value}</p>
    </div>
  );
}

function StudentRow({ student, onUpdate }: { student: any; onUpdate: (userId: string, cgpa: string) => void }) {
  const [value, setValue] = useState(String(student.cgpa ?? ""));
  return (
    <tr className="border-t border-white/10">
      <td className="px-4 py-3 font-medium text-white">{student.name}</td>
      <td className="px-4 py-3 text-white/80">{student.roll_no}</td>
      <td className="px-4 py-3 text-white/60 font-mono text-xs">{student.group_code || "—"}</td>
      <td className="px-4 py-3 text-white/80">{student.cgpa ?? "—"}</td>
      <td className="px-4 py-3 text-white/80">{student.assigned_hostel_name || "—"}</td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-24 border border-white/15 bg-white/[0.03] text-white rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="CGPA"
          />
          <button
            onClick={() => onUpdate(student.id, value)}
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
      <td className="px-4 py-3 text-white/60 text-xs uppercase">{hostel.gender === "male" ? "Boys" : "Girls"}</td>
      <td className="px-4 py-3 text-white/80">{hostel.capacity}</td>
      <td className="px-4 py-3 text-white/60">{hostel.seats_built}</td>
      <td className="px-4 py-3 text-white/80">{hostel.allotted}</td>
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

/* ======================================================================
   TEST LAB - drive the whole pipeline with synthetic students.
   Backend: /api/admin/test-lab/*  (disable with ENABLE_TEST_LAB=false)
   ====================================================================== */
function TestLab({ showToast, onChanged }: { showToast: (t: "ok" | "err", m: string) => void; onChanged: () => void }) {
  const [stats, setStats] = useState<any>(null);
  const [job, setJob] = useState<any>(null);
  const [disabled, setDisabled] = useState(false);

  // parameters
  const [hostelMode, setHostelMode] = useState<"cgpa" | "random">("cgpa");
  const [hostelPrefsPct, setHostelPrefsPct] = useState(100);
  const [roomPrefsPct, setRoomPrefsPct] = useState(100);
  const [payPct, setPayPct] = useState(60);
  const [scope, setScope] = useState<"students" | "groups">("students");
  const [allocate, setAllocate] = useState(true);
  const [resetFirst, setResetFirst] = useState(true);
  const [allotAfter, setAllotAfter] = useState(true);
  const [seed, setSeed] = useState("");

  const running = job?.state === "running";

  async function poll() {
    try {
      const [s, j] = await Promise.all([
        api.get("/api/admin/test-lab/stats"),
        api.get("/api/admin/test-lab/job"),
      ]);
      setStats(s.data);
      setJob((prev: any) => {
        if (prev?.state === "running" && j.data.state !== "running") onChanged(); // refresh the rest of the admin page
        return j.data;
      });
    } catch (err: any) {
      if (err?.response?.status === 404) setDisabled(true);
    }
  }

  useEffect(() => {
    poll();
    const t = setInterval(poll, running ? 1200 : 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  async function run(body: any, label: string) {
    try {
      await api.post("/api/admin/test-lab/run", {
        ...body,
        seed: seed.trim() === "" ? null : parseInt(seed, 10),
      });
      showToast("ok", `${label} started`);
      poll();
    } catch (err: any) {
      showToast("err", errMsg(err, `Could not start ${label}`));
    }
  }

  function confirmReset(level: "rooms" | "hostels" | "everything", text: string) {
    if (confirm(text)) run({ step: "reset", level }, "Reset");
  }

  if (disabled) {
    return (
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 text-sm text-white/60">
        The test lab is disabled on this server (<code>ENABLE_TEST_LAB=false</code>).
      </div>
    );
  }

  const occPct = stats && stats.seats_total ? Math.round((stats.seats_occupied / stats.seats_total) * 100) : 0;
  const pct = job && job.total ? Math.round((job.progress / job.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-xs text-orange-300">
        ⚠ The test lab rewrites real data (rankings, hostel assignments, payments, bookings, room occupancy). Use it on a
        development database only. Run one job at a time; use a single server worker.
      </div>

      {/* Live stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Students" value={stats.students} />
          <MetricCard label="Hostel allotted" value={`${stats.students_with_hostel}/${stats.students}`} />
          <MetricCard label="Hostel rankings filed" value={stats.hostel_rankings} />
          <MetricCard label="Groups with room prefs" value={stats.groups_with_room_prefs} />
          <MetricCard label="Paid" value={stats.students_paid} />
          <MetricCard label="Seated" value={stats.students_seated} />
          <MetricCard label="Paid but no seat" value={stats.paid_but_unseated} />
          <MetricCard label="Seat occupancy" value={`${stats.seats_occupied}/${stats.seats_total} (${occPct}%)`} />
          <MetricCard label="Booking rows" value={stats.booking_rows} />
          <MetricCard label="Split (fragmented) groups" value={stats.fragmented_groups} />
        </div>
      )}

      {/* Job monitor */}
      <div className="bg-white/[0.03] rounded-xl border border-white/10 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">Job monitor</h3>
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold ${
              job?.state === "running" ? "bg-blue-500/10 text-blue-300"
              : job?.state === "done" ? "bg-green-500/10 text-green-400"
              : job?.state === "error" ? "bg-orange-500/10 text-orange-400"
              : "bg-white/10 text-white/50"
            }`}
          >
            {job?.state === "running" ? `Running: ${job.name}` : job?.state === "done" ? `Done: ${job.name}` : job?.state === "error" ? "Failed" : "Idle"}
          </span>
        </div>
        {job?.state === "running" && job.total > 0 && (
          <div className="mb-3">
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[11px] text-white/50 mt-1">{job.progress}/{job.total} ({pct}%)</p>
          </div>
        )}
        {job?.error && <p className="text-xs text-orange-400 mb-2">{job.error}</p>}
        {job?.log?.length > 0 && (
          <pre className="text-[11px] leading-relaxed text-white/60 bg-black/30 rounded-lg p-3 max-h-48 overflow-auto whitespace-pre-wrap">
            {job.log.join("\n")}
          </pre>
        )}
        {job?.result && job.state === "done" && (
          <details className="mt-2 text-xs text-white/60">
            <summary className="cursor-pointer text-blue-300">Result</summary>
            <pre className="mt-2 bg-black/30 rounded-lg p-3 overflow-auto">{JSON.stringify(job.result, null, 2)}</pre>
          </details>
        )}
      </div>

      {/* Parameters */}
      <div className="bg-white/[0.03] rounded-xl border border-white/10 p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Scenario parameters</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <LabField label="Hostel allotment method">
            <select value={hostelMode} onChange={(e) => setHostelMode(e.target.value as any)} className="w-full border border-white/15 bg-[#151517] text-white rounded-lg px-3 py-2 text-sm">
              <option value="cgpa">Real algorithm (CGPA + rankings)</option>
              <option value="random">Random (ignore CGPA — test only)</option>
            </select>
          </LabField>
          <LabField label="Auto-fill missing hostel rankings (%)">
            <LabNumber value={hostelPrefsPct} onChange={setHostelPrefsPct} />
          </LabField>
          <LabField label="Auto-fill room preferences (%)">
            <LabNumber value={roomPrefsPct} onChange={setRoomPrefsPct} />
          </LabField>
          <LabField label={`Fee paid by (${payPct}%)`}>
            <input type="range" min={0} max={100} value={payPct} onChange={(e) => setPayPct(parseInt(e.target.value, 10))} className="w-full accent-blue-500" />
          </LabField>
          <LabField label="Who pays">
            <select value={scope} onChange={(e) => setScope(e.target.value as any)} className="w-full border border-white/15 bg-[#151517] text-white rounded-lg px-3 py-2 text-sm">
              <option value="students">Random individual students</option>
              <option value="groups">Whole groups together</option>
            </select>
          </LabField>
          <LabField label="Random seed (optional)">
            <input value={seed} onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, ""))} placeholder="repeatable runs" className="w-full border border-white/15 bg-white/[0.03] text-white placeholder-white/30 rounded-lg px-3 py-2 text-sm" />
          </LabField>
        </div>
        <div className="mt-4 space-y-2">
          <CheckRow checked={allocate} onChange={setAllocate} label="Allot rooms immediately on each payment (like the real flow). Untick to record payments only, then press “Allot rooms now”." />
          <CheckRow checked={resetFirst} onChange={setResetFirst} label="Full scenario: reset hostels & rooms first" />
          <CheckRow checked={allotAfter} onChange={setAllotAfter} label="Full scenario: run the “Allot rooms now” sweep at the end" />
        </div>
      </div>

      {/* Steps */}
      <div className="bg-white/[0.03] rounded-xl border border-white/10 p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Run step by step</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <StepBtn n={1} title="Fill hostel rankings" sub="Random rankings for units that haven't filed one" disabled={running}
            onClick={() => run({ step: "hostel_prefs", percent: hostelPrefsPct }, "Hostel rankings")} />
          <StepBtn n={2} title="Allot hostels" sub={hostelMode === "random" ? "Random assignment" : "CGPA algorithm"} disabled={running}
            onClick={() => run({ step: "hostel_allot", hostel_mode: hostelMode }, "Hostel allotment")} />
          <StepBtn n={3} title="Fill room preferences" sub="Random 3–5 clusters per allotted group" disabled={running}
            onClick={() => run({ step: "room_prefs", percent: roomPrefsPct }, "Room preferences")} />
          <StepBtn n={4} title={`Pay fee (${payPct}%)`} sub={allocate ? "Records payment + allots rooms" : "Records payment only"} disabled={running}
            onClick={() => run({ step: "payments", percent: payPct, scope, allocate }, "Payments")} />
          <StepBtn n={5} title="Allot rooms now" sub="Seat paid groups that have no room yet" disabled={running}
            onClick={() => run({ step: "allot_rooms" }, "Room allotment")} />
          <button
            disabled={running}
            onClick={() =>
              run({
                step: "scenario", hostel_mode: hostelMode, hostel_prefs_percent: hostelPrefsPct,
                room_prefs_percent: roomPrefsPct, pay_percent: payPct, scope, allocate,
                allot_rooms_after: allotAfter, reset_first: resetFirst,
              }, "Full scenario")
            }
            className="text-left rounded-xl border border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/20 p-4 transition-colors disabled:opacity-40"
          >
            <p className="text-sm font-bold text-orange-300">▶ Run full scenario</p>
            <p className="text-[11px] text-white/50 mt-1">Steps 1–5 in one go with the parameters above</p>
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-white/10">
          <span className="text-xs text-white/50 self-center mr-1">Reset:</span>
          <button disabled={running} onClick={() => confirmReset("rooms", "Delete all payments, bookings and room preferences and empty every room? Hostel allotments are kept.")}
            className="px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/15 text-xs text-white/80 hover:text-white disabled:opacity-40">Rooms &amp; payments</button>
          <button disabled={running} onClick={() => confirmReset("hostels", "Reset rooms AND remove every hostel allotment (rankings are kept)?")}
            className="px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/15 text-xs text-white/80 hover:text-white disabled:opacity-40">+ Hostel allotments</button>
          <button disabled={running} onClick={() => confirmReset("everything", "Reset EVERYTHING back to the start, including all hostel rankings (groups are kept)?")}
            className="px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/30 text-xs text-orange-400 hover:bg-orange-500 hover:text-white disabled:opacity-40">+ Hostel rankings</button>
        </div>
      </div>

      {/* Per hostel */}
      {stats?.hostels && (
        <div className="bg-white/[0.03] rounded-xl border border-white/10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.05] text-left">
              <tr>
                {["Hostel", "Allotted students", "Seats", "Occupied", "Fill"].map((h) => (
                  <th key={h} className="px-4 py-3 text-white/70 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.hostels.map((h: any) => (
                <tr key={h.hostel_id} className="border-t border-white/10">
                  <td className="px-4 py-3 font-medium text-white">
                    {h.name} <span className="text-[10px] text-white/40 uppercase ml-1">{h.gender === "male" ? "boys" : "girls"}</span>
                  </td>
                  <td className="px-4 py-3 text-white/80">{h.allotted_students}</td>
                  <td className="px-4 py-3 text-white/80">{h.seats}</td>
                  <td className="px-4 py-3 text-white/80">{h.occupied}</td>
                  <td className="px-4 py-3 w-48">
                    <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full bg-green-500" style={{ width: `${h.seats ? Math.min(100, (h.occupied / h.seats) * 100) : 0}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LabField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wide text-white/50 font-semibold mb-1">{label}</label>
      {children}
    </div>
  );
}

function LabNumber({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      min={0}
      max={100}
      value={value}
      onChange={(e) => onChange(Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)))}
      className="w-full border border-white/15 bg-white/[0.03] text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
    />
  );
}

function CheckRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-start gap-2 text-xs text-white/70 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 accent-blue-500" />
      <span>{label}</span>
    </label>
  );
}

function StepBtn({ n, title, sub, onClick, disabled }: { n: number; title: string; sub: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="text-left rounded-xl border border-white/10 bg-white/[0.02] hover:border-blue-500/40 hover:bg-blue-500/5 p-4 transition-colors disabled:opacity-40"
    >
      <p className="text-sm font-bold text-white">
        <span className="inline-flex w-5 h-5 mr-2 rounded-full bg-blue-600 text-[11px] items-center justify-center">{n}</span>
        {title}
      </p>
      <p className="text-[11px] text-white/50 mt-1">{sub}</p>
    </button>
  );
}