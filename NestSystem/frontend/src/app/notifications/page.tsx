"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import api from "@/lib/api";
import Navbar from "@/components/Navbar";

export default function NotificationsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  function load() {
    setLoading(true);
    api
      .get("/api/services/notifications")
      .then((r) => setItems(r.data))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function markAllRead() {
    setMarkingAll(true);
    try {
      await api.post("/api/services/notifications/read-all");
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      // no-op, keep prior state
    } finally {
      setMarkingAll(false);
    }
  }

  const unreadCount = items.filter((n) => !n.is_read).length;

  const categoryIcon: Record<string, string> = {
    Notice: "📢",
    Payment: "💳",
    System: "⚙️",
  };

  return (
    <main className="min-h-screen pb-20 bg-[#0B0B0C]">
      <Navbar active="/notifications" />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="mb-8 flex items-center justify-between gap-4 flex-wrap"
        >
          <div>
            <h1 className="text-3xl sm:text-4xl font-semibold text-white mb-1">
              Notifications
            </h1>
            <p className="text-white/60 text-sm sm:text-base">
              {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}` : "You're all caught up."}
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={markAllRead}
            disabled={markingAll || unreadCount === 0}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-full shadow-sm transition-colors disabled:opacity-50"
          >
            {markingAll ? "Marking…" : "Mark all as read"}
          </motion.button>
        </motion.div>

        {loading && <p className="text-xs text-white/50">Loading…</p>}

        <div className="space-y-3">
          {items.map((n, i) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.05, ease: "easeOut" }}
              className={`bg-white/[0.03] border rounded-2xl shadow-sm p-4 flex items-start gap-3 transition-colors ${
                !n.is_read ? "border-blue-500/30 bg-blue-500/[0.06]" : "border-white/10"
              }`}
            >
              <span className="text-xl shrink-0">{categoryIcon[n.category] || "🔔"}</span>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="text-sm font-bold text-white">{n.title}</h3>
                  {!n.is_read && <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />}
                </div>
                <p className="text-xs text-white/60">{n.message}</p>
                <span className="text-[10px] text-white/40 mt-1 block">{n.category}</span>
              </div>
            </motion.div>
          ))}
          {!loading && items.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm p-8 text-center"
            >
              <p className="text-2xl mb-2">🔔</p>
              <p className="text-sm font-semibold text-white">No notifications yet</p>
              <p className="text-xs text-white/50 mt-1">You'll see updates about payments, allocations, and notices here.</p>
            </motion.div>
          )}
        </div>
      </div>
    </main>
  );
}