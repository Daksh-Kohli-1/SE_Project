"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "@/lib/api";
import Navbar from "@/components/Navbar";

type Tab = "requests" | "visitors" | "leaves" | "amenities";

export default function RequestsPage() {
  const [tab, setTab] = useState<Tab>("requests");

  return (
    <main className="min-h-screen pb-20 bg-[#0B0B0C]">
      <Navbar active="/requests" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="mb-8"
        >
          <h1 className="text-3xl sm:text-4xl font-semibold text-white mb-1">
            Requests & Services
          </h1>
          <p className="text-white/60 text-sm sm:text-base">
            Raise maintenance requests, register visitors, apply for leave, and book amenities.
          </p>
        </motion.div>

        <div className="flex gap-2 border-b border-white/10 mb-8 overflow-x-auto pb-1">
          {[
            { id: "requests", label: "Maintenance", icon: "🔧" },
            { id: "visitors", label: "Visitors", icon: "🧑‍🤝‍🧑" },
            { id: "leaves", label: "Leave / Day-out", icon: "✈️" },
            { id: "amenities", label: "Amenities", icon: "📍" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as Tab)}
              className={`relative px-5 py-3 font-bold text-xs rounded-t-xl transition-colors flex items-center gap-2 shrink-0 ${
                tab === t.id
                  ? "bg-white/[0.04] text-blue-300 border-t-2 border-x border-blue-500/40 shadow-sm"
                  : "text-white/50 hover:text-white"
              }`}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {tab === "requests" && <MaintenanceTab />}
            {tab === "visitors" && <VisitorsTab />}
            {tab === "leaves" && <LeavesTab />}
            {tab === "amenities" && <AmenitiesTab />}
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  );
}

/* ---------------- Maintenance requests ---------------- */

function MaintenanceTab() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ category: "Maintenance", subject: "", description: "", priority: "Medium" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    api
      .get("/api/services/requests")
      .then((r) => setItems(r.data))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.subject.trim()) {
      setError("Please add a subject");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await api.post("/api/services/requests", form);
      setForm({ category: "Maintenance", subject: "", description: "", priority: "Medium" });
      load();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Could not submit request");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Your requests</h3>
        {loading && <p className="text-xs text-white/50">Loading…</p>}
        <div className="space-y-3">
          {items.map((r, i) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className="p-4 rounded-xl bg-white/[0.02] border border-white/10"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold text-white">{r.subject}</span>
                <StatusPill status={r.status} />
              </div>
              <p className="text-xs text-white/60 mb-1">{r.description}</p>
              <div className="flex items-center gap-3 text-[10px] text-white/40">
                <span>{r.category}</span>
                <span>•</span>
                <span>Priority: {r.priority}</span>
              </div>
            </motion.div>
          ))}
          {!loading && items.length === 0 && (
            <p className="text-xs text-white/50 text-center py-6">No requests raised yet.</p>
          )}
        </div>
      </div>

      <div className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Raise a request</h3>
        <form onSubmit={submit} className="space-y-4">
          <FieldSelect
            label="Category"
            value={form.category}
            onChange={(v) => setForm({ ...form, category: v })}
            options={["Maintenance", "Electrical", "Plumbing", "Housekeeping", "Other"]}
          />
          <FieldInput
            label="Subject"
            value={form.subject}
            onChange={(v) => setForm({ ...form, subject: v })}
            placeholder="e.g. Fan not working"
          />
          <div>
            <label className="block text-xs font-bold text-white/60 mb-1">Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border border-white/15 bg-white/[0.03] text-white placeholder-white/30 rounded-xl px-3.5 py-2.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="Add any relevant details"
            />
          </div>
          <FieldSelect
            label="Priority"
            value={form.priority}
            onChange={(v) => setForm({ ...form, priority: v })}
            options={["Low", "Medium", "High"]}
          />
          {error && <p className="text-xs text-orange-400 font-semibold">{error}</p>}
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-full shadow-sm transition-colors disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit request"}
          </motion.button>
        </form>
      </div>
    </div>
  );
}

/* ---------------- Visitors ---------------- */

function VisitorsTab() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    visitor_name: "",
    phone: "",
    relationship: "",
    visit_date: "",
    expected_arrival: "",
    expected_departure: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    api
      .get("/api/services/visitors")
      .then((r) => setItems(r.data))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.visitor_name.trim() || !form.visit_date) {
      setError("Visitor name and visit date are required");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await api.post("/api/services/visitors", form);
      setForm({ visitor_name: "", phone: "", relationship: "", visit_date: "", expected_arrival: "", expected_departure: "" });
      load();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Could not register visitor");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Registered visitors</h3>
        {loading && <p className="text-xs text-white/50">Loading…</p>}
        <div className="space-y-3">
          {items.map((v, i) => (
            <motion.div
              key={v.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className="p-4 rounded-xl bg-white/[0.02] border border-white/10"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold text-white">{v.visitor_name}</span>
                <StatusPill status={v.status} />
              </div>
              <p className="text-xs text-white/60">
                {v.relationship} · {v.phone}
              </p>
              <p className="text-[10px] text-white/40 mt-1">
                {v.visit_date} · {v.expected_arrival} – {v.expected_departure}
              </p>
            </motion.div>
          ))}
          {!loading && items.length === 0 && (
            <p className="text-xs text-white/50 text-center py-6">No visitors registered yet.</p>
          )}
        </div>
      </div>

      <div className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Register a visitor</h3>
        <form onSubmit={submit} className="space-y-4">
          <FieldInput label="Visitor name" value={form.visitor_name} onChange={(v) => setForm({ ...form, visitor_name: v })} placeholder="e.g. Gurpreet Singh" />
          <FieldInput label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="+91 …" />
          <FieldInput label="Relationship" value={form.relationship} onChange={(v) => setForm({ ...form, relationship: v })} placeholder="e.g. Father" />
          <FieldInput label="Visit date" type="date" value={form.visit_date} onChange={(v) => setForm({ ...form, visit_date: v })} />
          <div className="grid grid-cols-2 gap-3">
            <FieldInput label="Arrival" type="time" value={form.expected_arrival} onChange={(v) => setForm({ ...form, expected_arrival: v })} />
            <FieldInput label="Departure" type="time" value={form.expected_departure} onChange={(v) => setForm({ ...form, expected_departure: v })} />
          </div>
          {error && <p className="text-xs text-orange-400 font-semibold">{error}</p>}
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-full shadow-sm transition-colors disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Register visitor"}
          </motion.button>
        </form>
      </div>
    </div>
  );
}

/* ---------------- Leaves ---------------- */

function LeavesTab() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    request_type: "Day Out",
    destination: "",
    reason: "",
    start_date: "",
    end_date: "",
    expected_return: "",
    emergency_contact: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    api
      .get("/api/services/leaves")
      .then((r) => setItems(r.data))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.destination.trim() || !form.start_date) {
      setError("Destination and start date are required");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await api.post("/api/services/leaves", form);
      setForm({ request_type: "Day Out", destination: "", reason: "", start_date: "", end_date: "", expected_return: "", emergency_contact: "" });
      load();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Could not submit leave request");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Leave history</h3>
        {loading && <p className="text-xs text-white/50">Loading…</p>}
        <div className="space-y-3">
          {items.map((l, i) => (
            <motion.div
              key={l.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className="p-4 rounded-xl bg-white/[0.02] border border-white/10"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold text-white">{l.request_type} — {l.destination}</span>
                <StatusPill status={l.status} />
              </div>
              <p className="text-xs text-white/60">{l.reason}</p>
              <p className="text-[10px] text-white/40 mt-1">
                {l.start_date} → {l.end_date} · Return by {l.expected_return}
              </p>
            </motion.div>
          ))}
          {!loading && items.length === 0 && (
            <p className="text-xs text-white/50 text-center py-6">No leave requests yet.</p>
          )}
        </div>
      </div>

      <div className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Apply for leave</h3>
        <form onSubmit={submit} className="space-y-4">
          <FieldSelect
            label="Type"
            value={form.request_type}
            onChange={(v) => setForm({ ...form, request_type: v })}
            options={["Day Out", "Overnight", "Home Visit", "Other"]}
          />
          <FieldInput label="Destination" value={form.destination} onChange={(v) => setForm({ ...form, destination: v })} placeholder="e.g. Sector 17, Chandigarh" />
          <div>
            <label className="block text-xs font-bold text-white/60 mb-1">Reason</label>
            <textarea
              rows={2}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="w-full border border-white/15 bg-white/[0.03] text-white placeholder-white/30 rounded-xl px-3.5 py-2.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldInput label="Start date" type="date" value={form.start_date} onChange={(v) => setForm({ ...form, start_date: v })} />
            <FieldInput label="End date" type="date" value={form.end_date} onChange={(v) => setForm({ ...form, end_date: v })} />
          </div>
          <FieldInput label="Expected return" type="time" value={form.expected_return} onChange={(v) => setForm({ ...form, expected_return: v })} />
          <FieldInput label="Emergency contact" value={form.emergency_contact} onChange={(v) => setForm({ ...form, emergency_contact: v })} placeholder="+91 …" />
          {error && <p className="text-xs text-orange-400 font-semibold">{error}</p>}
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-full shadow-sm transition-colors disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit leave request"}
          </motion.button>
        </form>
      </div>
    </div>
  );
}

/* ---------------- Amenities ---------------- */

function AmenitiesTab() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ amenity_name: "Study Room 3B", booking_date: "", time_slot: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    api
      .get("/api/services/amenities")
      .then((r) => setItems(r.data))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.booking_date || !form.time_slot.trim()) {
      setError("Pick a date and time slot");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await api.post("/api/services/amenities", form);
      setForm({ amenity_name: "Study Room 3B", booking_date: "", time_slot: "" });
      load();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Could not book amenity");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Your amenity bookings</h3>
        {loading && <p className="text-xs text-white/50">Loading…</p>}
        <div className="space-y-3">
          {items.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className="p-4 rounded-xl bg-white/[0.02] border border-white/10 flex items-center justify-between"
            >
              <div>
                <p className="text-sm font-bold text-white">{a.amenity_name}</p>
                <p className="text-[11px] text-white/50">{a.booking_date} · {a.time_slot}</p>
              </div>
              <StatusPill status={a.status} />
            </motion.div>
          ))}
          {!loading && items.length === 0 && (
            <p className="text-xs text-white/50 text-center py-6">No amenity bookings yet.</p>
          )}
        </div>
      </div>

      <div className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Book an amenity</h3>
        <form onSubmit={submit} className="space-y-4">
          <FieldSelect
            label="Amenity"
            value={form.amenity_name}
            onChange={(v) => setForm({ ...form, amenity_name: v })}
            options={["Study Room 3B", "Common Room TV", "Gym Slot", "Laundry Machine"]}
          />
          <FieldInput label="Date" type="date" value={form.booking_date} onChange={(v) => setForm({ ...form, booking_date: v })} />
          <FieldInput label="Time slot" value={form.time_slot} onChange={(v) => setForm({ ...form, time_slot: v })} placeholder="e.g. 06:00 PM - 08:00 PM" />
          {error && <p className="text-xs text-orange-400 font-semibold">{error}</p>}
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-full shadow-sm transition-colors disabled:opacity-50"
          >
            {submitting ? "Booking…" : "Book amenity"}
          </motion.button>
        </form>
      </div>
    </div>
  );
}

/* ---------------- Shared bits ---------------- */

function StatusPill({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  const color =
    s.includes("approve") || s.includes("confirm") || s.includes("resolve")
      ? "bg-green-500/10 text-green-400"
      : s.includes("reject") || s.includes("cancel")
      ? "bg-red-500/10 text-red-400"
      : "bg-orange-500/10 text-orange-400";
  return <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${color}`}>{status}</span>;
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-white/60 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-white/15 bg-white/[0.03] text-white placeholder-white/30 rounded-xl px-3.5 py-2.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
      />
    </div>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-white/60 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white bg-[#151517] focus:ring-2 focus:ring-blue-500 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}