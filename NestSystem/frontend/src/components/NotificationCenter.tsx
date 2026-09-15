"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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

  const categoryStyle: Record<string, string> = {
    Payment: "bg-orange-500/15 text-orange-300",
    Notice: "bg-blue-500/15 text-blue-300",
    Maintenance: "bg-purple-500/15 text-purple-300",
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-screen max-w-md bg-[#111113] shadow-2xl flex flex-col border-l border-white/10"
            >
              {/* Header */}
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🔔</span>
                  <h2 className="text-xl font-bold text-white">Notifications</h2>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white text-sm font-bold transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Action Bar */}
              <div className="px-6 py-3 border-b border-white/10 flex items-center justify-between text-xs text-white/50">
                <span>{notifications.filter((n) => !n.is_read).length} unread</span>
                <button
                  onClick={markAllAsRead}
                  className="text-blue-400 font-semibold hover:text-blue-300 transition-colors"
                >
                  Mark all as read
                </button>
              </div>

              {/* Notifications List */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {notifications.length === 0 ? (
                  <div className="text-center py-12 text-white/50">
                    <p className="text-3xl mb-2">🎉</p>
                    <p className="font-medium text-white">All caught up!</p>
                    <p className="text-xs">No new notifications right now.</p>
                  </div>
                ) : (
                  notifications.map((n, i) => (
                    <motion.div
                      key={n.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.05, ease: "easeOut" }}
                      className={`p-4 rounded-xl border transition-colors ${
                        n.is_read
                          ? "bg-white/[0.02] border-white/10 opacity-60"
                          : "bg-blue-500/[0.06] border-blue-500/20 shadow-sm"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="font-semibold text-sm text-white">{n.title}</span>
                        <span
                          className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                            categoryStyle[n.category] || "bg-green-500/15 text-green-300"
                          }`}
                        >
                          {n.category}
                        </span>
                      </div>
                      <p className="text-xs text-white/60 leading-relaxed mb-2">{n.message}</p>
                      <span className="text-[10px] text-white/40">
                        {new Date(n.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}