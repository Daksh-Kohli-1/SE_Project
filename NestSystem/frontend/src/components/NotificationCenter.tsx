"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  category: string;
  is_read: boolean;
  created_at: string;
}

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdateCount?: (count: number) => void;
}

export default function NotificationCenter({ isOpen, onClose, onUpdateCount }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function fetchNotifications() {
    try {
      setLoading(true);
      const res = await api.get("/api/services/notifications");
      setNotifications(res.data);
      const unread = res.data.filter((n: NotificationItem) => !n.is_read).length;
      if (onUpdateCount) onUpdateCount(unread);
    } catch {
      // Fallback demo notifications if backend is offline
      const demoNotifs: NotificationItem[] = [
        {
          id: "n1",
          title: "Mess Menu Updated",
          message: "The mess menu for this week has been published.",
          category: "Notice",
          is_read: false,
          created_at: new Date().toISOString(),
        },
        {
          id: "n2",
          title: "Hostel Fee Reminder",
          message: "Hostel fee payment of ₹60,000 is pending.",
          category: "Payment",
          is_read: false,
          created_at: new Date().toISOString(),
        },
        {
          id: "n3",
          title: "Room Allocated",
          message: "Your allocation in Room C-312 (Pavani Hall) is confirmed.",
          category: "System",
          is_read: true,
          created_at: new Date().toISOString(),
        },
      ];
      setNotifications(demoNotifs);
      if (onUpdateCount) onUpdateCount(2);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  async function markAllAsRead() {
    try {
      await api.post("/api/services/notifications/read-all");
    } catch {
      // client update
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    if (onUpdateCount) onUpdateCount(0);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-ink/40 backdrop-blur-xs transition-opacity animate-fadeIn">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-ink/10 flex items-center justify-between bg-sand/50">
            <div className="flex items-center gap-2">
              <span className="text-xl">🔔</span>
              <h2 className="font-display text-xl font-bold text-ink">Notifications</h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-ink/5 hover:bg-ink/10 flex items-center justify-center text-ink text-sm font-bold"
            >
              ✕
            </button>
          </div>

          {/* Action Bar */}
          <div className="px-6 py-3 border-b border-ink/5 flex items-center justify-between text-xs text-slate">
            <span>{notifications.filter((n) => !n.is_read).length} unread</span>
            <button
              onClick={markAllAsRead}
              className="text-marine font-semibold hover:underline"
            >
              Mark all as read
            </button>
          </div>

          {/* Notifications List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {notifications.length === 0 ? (
              <div className="text-center py-12 text-slate">
                <p className="text-3xl mb-2">🎉</p>
                <p className="font-medium text-ink">All caught up!</p>
                <p className="text-xs">No new notifications right now.</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-4 rounded-xl border transition ${
                    n.is_read
                      ? "bg-white border-ink/10 opacity-75"
                      : "bg-marine/5 border-marine/20 shadow-xs"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="font-semibold text-sm text-ink">{n.title}</span>
                    <span
                      className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                        n.category === "Payment"
                          ? "bg-amber-100 text-amber-800"
                          : n.category === "Notice"
                          ? "bg-blue-100 text-blue-800"
                          : n.category === "Maintenance"
                          ? "bg-orange-100 text-orange-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {n.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate leading-relaxed mb-2">{n.message}</p>
                  <span className="text-[10px] text-slate/70">
                    {new Date(n.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
