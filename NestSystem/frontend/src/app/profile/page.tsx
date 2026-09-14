"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import Navbar from "@/components/Navbar";

const EDITABLE_FIELDS = [
  { key: "contact", label: "Contact number" },
  { key: "address", label: "Address" },
  { key: "father_name", label: "Father's name" },
  { key: "mother_name", label: "Mother's name" },
  { key: "emergency_contact_name", label: "Emergency contact name" },
  { key: "emergency_contact_phone", label: "Emergency contact phone" },
  { key: "vehicle_type", label: "Vehicle type" },
  { key: "vehicle_model", label: "Vehicle model" },
  { key: "vehicle_reg_no", label: "Vehicle registration no." },
];

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/api/auth/me")
      .then((r) => {
        setUser(r.data);
        const initial: Record<string, string> = {};
        EDITABLE_FIELDS.forEach((f) => (initial[f.key] = r.data[f.key] || ""));
        setForm(initial);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await api.put("/api/services/profile", form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Could not update profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen pb-20 bg-sand">
      <Navbar active="/profile" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink mb-1">
            My profile
          </h1>
          <p className="text-slate text-sm sm:text-base">
            Keep your personal and emergency details up to date.
          </p>
        </div>

        {loading && <p className="text-xs text-slate">Loading…</p>}

        {user && (
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Read-only identity card */}
            <div className="nest-card p-6">
              <div className="w-16 h-16 rounded-full bg-marine/10 text-marine font-bold text-xl flex items-center justify-center border border-marine/20 mb-4">
                {user.name?.substring(0, 2).toUpperCase()}
              </div>
              <h3 className="font-display text-lg font-bold text-ink mb-1">{user.name}</h3>
              <p className="text-xs text-slate mb-4">{user.roll_no}</p>

              <dl className="space-y-2 text-xs">
                <ReadRow label="Email" value={user.email} />
                <ReadRow label="Program" value={user.program} />
                <ReadRow label="Department" value={user.department} />
                <ReadRow label="Section" value={user.section} />
                <ReadRow label="Year" value={user.year} />
                <ReadRow label="CGPA" value={user.cgpa} />
                <ReadRow label="Hostel" value={user.hostel_name} />
                <ReadRow label="Room" value={user.room_no} />
              </dl>
              <p className="text-[10px] text-slate/70 mt-4">
                Academic details are managed by administration and can't be edited here.
              </p>
            </div>

            {/* Editable form */}
            <div className="lg:col-span-2 nest-card p-6">
              <h3 className="font-display text-lg font-bold text-ink mb-4">Editable details</h3>
              <form onSubmit={save} className="grid sm:grid-cols-2 gap-4">
                {EDITABLE_FIELDS.map((f) => (
                  <div key={f.key}>
                    <label className="block text-xs font-bold text-slate mb-1">{f.label}</label>
                    <input
                      value={form[f.key] || ""}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      className="w-full border border-ink/15 rounded-xl px-3.5 py-2.5 text-xs text-ink focus:ring-2 focus:ring-marine"
                    />
                  </div>
                ))}

                <div className="sm:col-span-2 flex items-center justify-between mt-2">
                  <div>
                    {error && <p className="text-xs text-coral font-semibold">{error}</p>}
                    {saved && <p className="text-xs text-moss font-semibold">✓ Profile updated</p>}
                  </div>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-2.5 bg-marine hover:bg-ink text-white font-bold text-xs rounded-full shadow-md transition disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function ReadRow({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-center justify-between border-b border-ink/5 pb-2">
      <dt className="text-slate">{label}</dt>
      <dd className="font-semibold text-ink">{value ?? "—"}</dd>
    </div>
  );
}