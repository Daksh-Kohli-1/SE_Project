"use client";

import { useEffect, useState } from "react";
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
    <main className="min-h-screen pb-20 bg-sand">
      <Navbar active="/notifications" />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink mb-1">
              Notifications
            </h1>
            <p className="text-slate text-sm sm:text-base">
              {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}` : "You're all caught up."}
            </p>
          </div>
          <button
            onClick={markAllRead}
            disabled={markingAll || unreadCount === 0}
            className="px-5 py-2.5 bg-marine hover:bg-ink text-white font-bold text-xs rounded-full shadow-xs transition disabled:opacity-50"
          >
            {markingAll ? "Marking…" : "Mark all as read"}
          </button>
        </div>

        {loading && <p className="text-xs text-slate">Loading…</p>}

        <div className="space-y-3">
          {items.map((n) => (
            <div
              key={n.id}
              className={`nest-card p-4 flex items-start gap-3 ${!n.is_read ? "border-marine/30 bg-marine/5" : ""}`}
            >
              <span className="text-xl shrink-0">{categoryIcon[n.category] || "🔔"}</span>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="text-sm font-bold text-ink">{n.title}</h3>
                  {!n.is_read && <span className="w-2 h-2 rounded-full bg-marine shrink-0" />}
                </div>
                <p className="text-xs text-slate">{n.message}</p>
                <span className="text-[10px] text-slate/70 mt-1 block">{n.category}</span>
              </div>
            </div>
          ))}
          {!loading && items.length === 0 && (
            <div className="nest-card p-8 text-center">
              <p className="text-2xl mb-2">🔔</p>
              <p className="text-sm font-semibold text-ink">No notifications yet</p>
              <p className="text-xs text-slate mt-1">You'll see updates about payments, allocations, and notices here.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}