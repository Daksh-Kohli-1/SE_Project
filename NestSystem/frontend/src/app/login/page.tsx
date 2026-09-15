"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import api, { setToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Official pre-registered university student roster
  const registeredRoster = [
    { name: "Avleen Kaur (Female · 2nd Yr · Pavani Hall)", email: "avleen.kaur@thapar.edu", roll: "2023CS1045", hostel: "Pavani Hall (Girls)" },
    { name: "Student 2 (Male · 1st Yr)", email: "student2@thapar.edu", roll: "2023CS1102", hostel: "Agira Hall (Boys)" },
    { name: "Student 3 (Female · 1st Yr)", email: "student3@thapar.edu", roll: "2023CS1103", hostel: "Unallotted" },
    { name: "Student 4 (Male · 1st Yr · Agira Hall)", email: "student4@thapar.edu", roll: "2023CS1104", hostel: "Agira Hall (Boys) - Solo Booking" },
    { name: "Student 10 (Male · 1st Yr · Trio Group)", email: "student10@thapar.edu", roll: "2023CS1110", hostel: "Agira Hall (Boys)" },
    { name: "Student 16 (Male · 1st Yr · Quad Group)", email: "student16@thapar.edu", roll: "2023CS1116", hostel: "Agira Hall (Boys)" },
    { name: "System Admin (Administration)", email: "admin@thapar.edu", roll: "ADMIN001", hostel: "Central Admin" },
];

  async function performLogin(loginIdentifier: string, loginPass: string) {
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/api/auth/login", { identifier: loginIdentifier, password: loginPass });
      setToken(res.data.access_token);
      if (res.data.role === "admin") {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (Array.isArray(detail)) {
        // Pydantic v2 validation error — extract human-readable message
        setError(detail.map((d: any) => d.msg ?? JSON.stringify(d)).join("; "));
      } else if (typeof detail === "string") {
        setError(detail);
      } else {
        setError("Access Denied: Invalid credentials. Please check your Email / Roll Number and password.");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    performLogin(identifier, password);
  }

  function selectFromRoster(selectedEmail: string) {
    setIdentifier(selectedEmail);
    const isAdm = selectedEmail === "admin@thapar.edu";
    const pass = isAdm ? "Admin@123" : "Pass@123";
    setPassword(pass);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-[#0B0B0C] py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md bg-white/[0.03] backdrop-blur-sm rounded-2xl shadow-lg border border-white/10 p-8"
      >
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 mb-6 group">
          <div className="w-9 h-9 rounded-lg bg-blue-600 text-white font-bold text-xl flex items-center justify-center shadow-[0_0_20px_-4px] shadow-blue-500/60">
            N
          </div>
          <span className="text-2xl font-semibold tracking-tight text-white">
            NEST
          </span>
        </Link>

        <h1 className="text-2xl font-semibold text-white mb-1">
          Registered Student Login
        </h1>
        <p className="text-white/60 text-xs mb-6">
          Authorized portal login for official pre-registered university students only.
        </p>

        {/* Database Roster Selector Banner */}
        <div className="mb-6 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-bold text-blue-300 flex items-center gap-1">
              <span>🏛️</span> Pre-Registered Student Database
            </p>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-600 text-white">
              Official Roster
            </span>
          </div>
          <p className="text-[11px] text-white/60 mb-2">
            Select a student from the university database to test logging in:
          </p>

          <select
            onChange={(e) => selectFromRoster(e.target.value)}
            className="w-full border border-blue-500/30 rounded-xl px-3 py-2 text-xs text-white font-semibold bg-[#151517] focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">-- Select Registered Student --</option>
            {registeredRoster.map((r) => (
              <option key={r.email} value={r.email}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-white/70 block mb-1">Email or Roll Number</label>
            <input
              type="text"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full border border-white/15 bg-white/[0.03] rounded-xl px-4 py-2.5 text-xs text-white placeholder-white/30 focus:ring-2 focus:ring-blue-500 focus:outline-none font-semibold"
              placeholder="e.g. avleen.kaur@thapar.edu or 2023CS1045"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-white/70 block mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-white/15 bg-white/[0.03] rounded-xl px-4 py-2.5 text-xs text-white placeholder-white/30 focus:ring-2 focus:ring-blue-500 focus:outline-none font-semibold"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs font-bold text-red-400"
            >
              ⚠️ {error}
            </motion.div>
          )}

          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-400 text-white rounded-full py-3 font-bold text-xs shadow-[0_0_24px_-6px] shadow-orange-500/60 transition-colors disabled:opacity-60"
          >
            {loading ? "Verifying Database Record..." : "Log in to Portal"}
          </motion.button>
        </form>

        {/* Restricted Access Note */}
        <div className="mt-6 text-[11px] text-white/60 bg-white/[0.03] rounded-xl p-3.5 leading-relaxed border border-white/10 text-center">
          🔒 <strong className="text-white/80">Access Restricted:</strong> Registration option is disabled. Only pre-verified student records existing in the university database are authorized to log in.
        </div>
      </motion.div>
    </main>
  );
}