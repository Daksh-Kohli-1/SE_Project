"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import Navbar from "@/components/Navbar";

type Tab = "requests" | "visitors" | "leaves" | "amenities";

export default function RequestsPage() {
  const [tab, setTab] = useState<Tab>("requests");

  return (
    <main className="min-h-screen pb-20 bg-sand">
      <Navbar active="/requests" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink mb-1">
            Requests & Services
          </h1>
          <p className="text-slate text-sm sm:text-base">
            Raise maintenance requests, register visitors, apply for leave, and book amenities.
          </p>
        </div>

        <div className="flex gap-2 border-b border-ink/10 mb-8 overflow-x-auto pb-1">
          {[
            { id: "requests", label: "Maintenance", icon: "🔧" },
            { id: "visitors", label: "Visitors", icon: "🧑‍🤝‍🧑" },
            { id: "leaves", label: "Leave / Day-out", icon: "✈️" },
            { id: "amenities", label: "Amenities", icon: "📍" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as Tab)}
              className={`px-5 py-3 font-bold text-xs rounded-t-xl transition flex items-center gap-2 shrink-0 ${
                tab === t.id
                  ? "bg-white text-marine border-t-2 border-x border-marine shadow-xs"
                  : "text-slate hover:text-ink"
              }`}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {tab === "requests" && <MaintenanceTab />}
        {tab === "visitors" && <VisitorsTab />}
        {tab === "leaves" && <LeavesTab />}
        {tab === "amenities" && <AmenitiesTab />}
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
      <div className="lg:col-span-2 nest-card p-6">
        <h3 className="font-display text-lg font-bold text-ink mb-4">Your requests</h3>
        {loading && <p className="text-xs text-slate">Loading…</p>}
        <div className="space-y-3">
          {items.map((r) => (
            <div key={r.id} className="p-4 rounded-xl bg-sand/60 border border-ink/5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold text-ink">{r.subject}</span>
                <StatusPill status={r.status} />
              </div>
              <p className="text-xs text-slate mb-1">{r.description}</p>
              <div className="flex items-center gap-3 text-[10px] text-slate/80">
                <span>{r.category}</span>
                <span>•</span>
                <span>Priority: {r.priority}</span>
              </div>
            </div>
          ))}
          {!loading && items.length === 0 && (
            <p className="text-xs text-slate text-center py-6">No requests raised yet.</p>
          )}
        </div>
      </div>

      <div className="nest-card p-6">
        <h3 className="font-display text-lg font-bold text-ink mb-4">Raise a request</h3>
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
            <label className="block text-xs font-bold text-slate mb-1">Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border border-ink/15 rounded-xl px-3.5 py-2.5 text-xs text-ink focus:ring-2 focus:ring-marine"
              placeholder="Add any relevant details"
            />
          </div>
          <FieldSelect
            label="Priority"
            value={form.priority}
            onChange={(v) => setForm({ ...form, priority: v })}
            options={["Low", "Medium", "High"]}
          />
          {error && <p className="text-xs text-coral font-semibold">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-marine hover:bg-ink text-white font-bold text-xs rounded-full shadow-md transition disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit request"}
          </button>
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
      <div className="lg:col-span-2 nest-card p-6">
        <h3 className="font-display text-lg font-bold text-ink mb-4">Registered visitors</h3>
        {loading && <p className="text-xs text-slate">Loading…</p>}
        <div className="space-y-3">
          {items.map((v) => (
            <div key={v.id} className="p-4 rounded-xl bg-sand/60 border border-ink/5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold text-ink">{v.visitor_name}</span>
                <StatusPill status={v.status} />
              </div>
              <p className="text-xs text-slate">
                {v.relationship} · {v.phone}
              </p>
              <p className="text-[10px] text-slate/80 mt-1">
                {v.visit_date} · {v.expected_arrival} – {v.expected_departure}
              </p>
            </div>
          ))}
          {!loading && items.length === 0 && (
            <p className="text-xs text-slate text-center py-6">No visitors registered yet.</p>
          )}
        </div>
      </div>

      <div className="nest-card p-6">
        <h3 className="font-display text-lg font-bold text-ink mb-4">Register a visitor</h3>
        <form onSubmit={submit} className="space-y-4">
          <FieldInput label="Visitor name" value={form.visitor_name} onChange={(v) => setForm({ ...form, visitor_name: v })} placeholder="e.g. Gurpreet Singh" />
          <FieldInput label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="+91 …" />
          <FieldInput label="Relationship" value={form.relationship} onChange={(v) => setForm({ ...form, relationship: v })} placeholder="e.g. Father" />
          <FieldInput label="Visit date" type="date" value={form.visit_date} onChange={(v) => setForm({ ...form, visit_date: v })} />
          <div className="grid grid-cols-2 gap-3">
            <FieldInput label="Arrival" type="time" value={form.expected_arrival} onChange={(v) => setForm({ ...form, expected_arrival: v })} />
            <FieldInput label="Departure" type="time" value={form.expected_departure} onChange={(v) => setForm({ ...form, expected_departure: v })} />
          </div>
          {error && <p className="text-xs text-coral font-semibold">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-marine hover:bg-ink text-white font-bold text-xs rounded-full shadow-md transition disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Register visitor"}
          </button>
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
      <div className="lg:col-span-2 nest-card p-6">
        <h3 className="font-display text-lg font-bold text-ink mb-4">Leave history</h3>
        {loading && <p className="text-xs text-slate">Loading…</p>}
        <div className="space-y-3">
          {items.map((l) => (
            <div key={l.id} className="p-4 rounded-xl bg-sand/60 border border-ink/5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold text-ink">{l.request_type} — {l.destination}</span>
                <StatusPill status={l.status} />
              </div>
              <p className="text-xs text-slate">{l.reason}</p>
              <p className="text-[10px] text-slate/80 mt-1">
                {l.start_date} → {l.end_date} · Return by {l.expected_return}
              </p>
            </div>
          ))}
          {!loading && items.length === 0 && (
            <p className="text-xs text-slate text-center py-6">No leave requests yet.</p>
          )}
        </div>
      </div>

      <div className="nest-card p-6">
        <h3 className="font-display text-lg font-bold text-ink mb-4">Apply for leave</h3>
        <form onSubmit={submit} className="space-y-4">
          <FieldSelect
            label="Type"
            value={form.request_type}
            onChange={(v) => setForm({ ...form, request_type: v })}
            options={["Day Out", "Overnight", "Home Visit", "Other"]}
          />
          <FieldInput label="Destination" value={form.destination} onChange={(v) => setForm({ ...form, destination: v })} placeholder="e.g. Sector 17, Chandigarh" />
          <div>
            <label className="block text-xs font-bold text-slate mb-1">Reason</label>
            <textarea
              rows={2}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="w-full border border-ink/15 rounded-xl px-3.5 py-2.5 text-xs text-ink focus:ring-2 focus:ring-marine"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldInput label="Start date" type="date" value={form.start_date} onChange={(v) => setForm({ ...form, start_date: v })} />
            <FieldInput label="End date" type="date" value={form.end_date} onChange={(v) => setForm({ ...form, end_date: v })} />
          </div>
          <FieldInput label="Expected return" type="time" value={form.expected_return} onChange={(v) => setForm({ ...form, expected_return: v })} />
          <FieldInput label="Emergency contact" value={form.emergency_contact} onChange={(v) => setForm({ ...form, emergency_contact: v })} placeholder="+91 …" />
          {error && <p className="text-xs text-coral font-semibold">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-marine hover:bg-ink text-white font-bold text-xs rounded-full shadow-md transition disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit leave request"}
          </button>
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
      <div className="lg:col-span-2 nest-card p-6">
        <h3 className="font-display text-lg font-bold text-ink mb-4">Your amenity bookings</h3>
        {loading && <p className="text-xs text-slate">Loading…</p>}
        <div className="space-y-3">
          {items.map((a) => (
            <div key={a.id} className="p-4 rounded-xl bg-sand/60 border border-ink/5 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-ink">{a.amenity_name}</p>
                <p className="text-[11px] text-slate">{a.booking_date} · {a.time_slot}</p>
              </div>
              <StatusPill status={a.status} />
            </div>
          ))}
          {!loading && items.length === 0 && (
            <p className="text-xs text-slate text-center py-6">No amenity bookings yet.</p>
          )}
        </div>
      </div>

      <div className="nest-card p-6">
        <h3 className="font-display text-lg font-bold text-ink mb-4">Book an amenity</h3>
        <form onSubmit={submit} className="space-y-4">
          <FieldSelect
            label="Amenity"
            value={form.amenity_name}
            onChange={(v) => setForm({ ...form, amenity_name: v })}
            options={["Study Room 3B", "Common Room TV", "Gym Slot", "Laundry Machine"]}
          />
          <FieldInput label="Date" type="date" value={form.booking_date} onChange={(v) => setForm({ ...form, booking_date: v })} />
          <FieldInput label="Time slot" value={form.time_slot} onChange={(v) => setForm({ ...form, time_slot: v })} placeholder="e.g. 06:00 PM - 08:00 PM" />
          {error && <p className="text-xs text-coral font-semibold">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-marine hover:bg-ink text-white font-bold text-xs rounded-full shadow-md transition disabled:opacity-50"
          >
            {submitting ? "Booking…" : "Book amenity"}
          </button>
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
      ? "bg-moss/10 text-moss"
      : s.includes("reject") || s.includes("cancel")
      ? "bg-coral/10 text-coral"
      : "bg-amber/10 text-amber";
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
      <label className="block text-xs font-bold text-slate mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-ink/15 rounded-xl px-3.5 py-2.5 text-xs text-ink focus:ring-2 focus:ring-marine"
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
      <label className="block text-xs font-bold text-slate mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-ink/15 rounded-xl px-3.5 py-2.5 text-xs text-ink bg-white focus:ring-2 focus:ring-marine"
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