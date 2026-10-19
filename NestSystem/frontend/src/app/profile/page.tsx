"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  const [hostelName, setHostelName] = useState<string | null>(null);
  const [seat, setSeat] = useState<any>(null);

  useEffect(() => {
    // Real allotment data (not whatever happens to be cached on the user object)
    api.get("/api/hostels/my-assignment").then((r) => setHostelName(r.data?.assigned_hostel_name ?? null)).catch(() => {});
    api.get("/api/booking/my-seat").then((r) => setSeat(r.data)).catch(() => setSeat(null));
  }, []);

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
    <main className="min-h-screen pb-20 bg-[#0B0B0C]">
      <Navbar active="/profile" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="mb-8"
        >
          <h1 className="text-3xl sm:text-4xl font-semibold text-white mb-1">
            My profile
          </h1>
          <p className="text-white/60 text-sm sm:text-base">
            Keep your personal and emergency details up to date.
          </p>
        </motion.div>

        {loading && <p className="text-xs text-white/50">Loading…</p>}

        {user && (
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Read-only identity card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05, ease: "easeOut" }}
              className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6"
            >
              <div className="w-16 h-16 rounded-full bg-blue-500/10 text-blue-300 font-bold text-xl flex items-center justify-center border border-blue-500/20 mb-4">
                {user.name?.substring(0, 2).toUpperCase()}
              </div>
              <h3 className="text-lg font-semibold text-white mb-1">{user.name}</h3>
              <p className="text-xs text-white/50 mb-4">{user.roll_no}</p>

              <dl className="space-y-2 text-xs">
                <ReadRow label="Email" value={user.email} />
                <ReadRow label="Program" value={user.program} />
                <ReadRow label="Department" value={user.department} />
                <ReadRow label="Section" value={user.section} />
                <ReadRow label="Year" value={user.year} />
                <ReadRow label="CGPA" value={user.cgpa} />
                <ReadRow label="Hostel" value={hostelName ?? "Not allotted yet"} />
                <ReadRow label="Room" value={seat?.allocated ? seat.room_numbers?.join(" / ") : "Not allotted yet"} />
              </dl>
              <p className="text-[10px] text-white/40 mt-4">
                Academic details are managed by administration and can't be edited here.
              </p>
            </motion.div>

            {/* Editable form */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
              className="lg:col-span-2 bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-6"
            >
              <h3 className="text-lg font-semibold text-white mb-4">Editable details</h3>
              <form onSubmit={save} className="grid sm:grid-cols-2 gap-4">
                {EDITABLE_FIELDS.map((f) => (
                  <div key={f.key}>
                    <label className="block text-xs font-bold text-white/60 mb-1">{f.label}</label>
                    <input
                      value={form[f.key] || ""}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      className="w-full border border-white/15 bg-white/[0.03] text-white rounded-xl px-3.5 py-2.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                ))}

                <div className="sm:col-span-2 flex items-center justify-between mt-2">
                  <div>
                    {error && <p className="text-xs text-orange-400 font-semibold">{error}</p>}
                    <AnimatePresence>
                      {saved && (
                        <motion.p
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="text-xs text-green-400 font-semibold"
                        >
                          ✓ Profile updated
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={saving}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-full shadow-sm transition-colors disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </div>
    </main>
  );
}

function ReadRow({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 pb-2">
      <dt className="text-white/50">{label}</dt>
      <dd className="font-semibold text-white">{value ?? "—"}</dd>
    </div>
  );
}