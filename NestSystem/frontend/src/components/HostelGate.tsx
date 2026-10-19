"use client";

import Link from "next/link";
import { motion } from "framer-motion";

/**
 * Shown instead of a page's content when the student hasn't been allotted a hostel.
 * windowState comes from useHostelAssignment().
 */
export default function HostelGate({
  title = "Hostel not allotted yet",
  what = "This section",
  windowState,
}: {
  title?: string;
  what?: string;
  windowState: string | null;
}) {
  const message =
    windowState === "open"
      ? "Hostel selection is open right now. Form your group and rank your preferred hostels to get allotted."
      : windowState === "not_started"
      ? "Hostel selection hasn't opened yet. Create or join a group in the meantime."
      : windowState === "closed"
      ? "Hostel selection has closed. Allotments will be published once the admin runs them."
      : "Choose your hostel preferences first — allotment is based on CGPA.";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="max-w-xl mx-auto mt-16 bg-white/[0.03] border border-white/10 rounded-2xl p-8 text-center"
    >
      <div className="w-14 h-14 rounded-2xl bg-orange-500/10 text-orange-400 flex items-center justify-center text-2xl mx-auto mb-4">
        🏠
      </div>
      <h2 className="text-2xl font-semibold text-white mb-2">{title}</h2>
      <p className="text-sm text-white/60 mb-1">{what} unlocks after you've been allotted a hostel.</p>
      <p className="text-sm text-white/60 mb-6">{message}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {windowState !== "closed" && (
          <Link href="/hostels" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-full transition-colors">
            Choose hostels
          </Link>
        )}
        <Link href="/group" className="px-5 py-2.5 bg-white/[0.05] border border-white/15 hover:bg-white/10 text-white font-bold text-xs rounded-full transition-colors">
          My group
        </Link>
      </div>
    </motion.div>
  );
}