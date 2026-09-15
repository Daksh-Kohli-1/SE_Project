"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import api, { clearToken } from "@/lib/api";
import NotificationCenter from "./NotificationCenter";

export default function Navbar({ active }: { active?: string }) {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(2);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);

  useEffect(() => {
    api.get("/api/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => {
        // Fallback demo user
        setUser({
          name: "Avleen Kaur",
          email: "avleen.kaur@thapar.edu",
          gender: "female",
        });
      });
  }, []);

  function logout() {
    clearToken();
    router.push("/login");
  }

  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/clusters", label: "Cluster map" },
    { href: "/group", label: "My group" },
    { href: "/requests", label: "Requests" },
    { href: "/mess", label: "Mess & Community" },
    { href: "/payment", label: "Payments" },
    { href: "/profile", label: "Profile" },
    { href: "/mess/live", label: "Live Mess Vote" },
  ];

  const displayName = user?.name || "Avleen Kaur";
  const displayInitials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  return (
    <>
      <header className="border-b border-white/10 bg-[#0B0B0C]/90 backdrop-blur-md sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="flex items-center gap-2 group">
              <motion.div
                whileHover={{ scale: 1.05 }}
                className="w-9 h-9 rounded-lg bg-blue-600 text-white font-bold text-xl flex items-center justify-center shadow-[0_0_16px_-4px] shadow-blue-500/60"
              >
                N
              </motion.div>
              <span className="text-2xl font-semibold tracking-tight text-white">
                NEST
              </span>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-1">
              {links.map((l) => {
                const isActive = active === l.href;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors relative ${
                      isActive
                        ? "text-blue-300 font-semibold bg-blue-500/10"
                        : "text-white/60 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {l.label}
                    {isActive && (
                      <motion.span
                        layoutId="nav-underline"
                        className="absolute bottom-0 left-3 right-3 h-0.5 bg-blue-400 rounded-full"
                      />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-3">
            {/* Notification Bell */}
            <button
              onClick={() => setIsNotifOpen(true)}
              className="relative p-2 rounded-full hover:bg-white/5 text-white/60 hover:text-white transition-colors focus:outline-none"
              title="Notifications"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 bg-orange-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center border-2 border-[#0B0B0C]">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Student Avatar & Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                className="flex items-center gap-2.5 p-1.5 pl-2.5 rounded-full hover:bg-white/5 border border-white/10 transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-blue-500/10 text-blue-300 font-bold text-xs flex items-center justify-center border border-blue-500/20">
                  {displayInitials}
                </div>
                <span className="text-sm font-semibold text-white hidden sm:inline-block">
                  {displayName}
                </span>
                <motion.svg
                  animate={{ rotate: isUserDropdownOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="w-4 h-4 text-white/50"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </motion.svg>
              </button>

              {/* User Dropdown Menu */}
              <AnimatePresence>
                {isUserDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-52 bg-[#151517] rounded-xl shadow-xl border border-white/10 py-2 z-40"
                  >
                    <div className="px-4 py-2 border-b border-white/10">
                      <p className="text-sm font-semibold text-white">{displayName}</p>
                      <p className="text-xs text-white/50 truncate">{user?.email || "avleen.kaur@thapar.edu"}</p>
                    </div>
                    <Link
                      href="/profile"
                      onClick={() => setIsUserDropdownOpen(false)}
                      className="block px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      👤 My Profile
                    </Link>
                    <Link
                      href="/requests"
                      onClick={() => setIsUserDropdownOpen(false)}
                      className="block px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      🛠️ Service Requests
                    </Link>
                    <button
                      onClick={logout}
                      className="w-full text-left px-4 py-2 text-sm font-medium text-orange-400 hover:bg-orange-500/10 transition-colors border-t border-white/10"
                    >
                      🚪 Log out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Mobile Hamburger Toggle */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden border-t border-white/10 bg-[#0B0B0C] px-4 pt-2 pb-4 space-y-1 overflow-hidden"
            >
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setIsMenuOpen(false)}
                  className={`block px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    active === l.href
                      ? "bg-blue-600 text-white font-semibold"
                      : "text-white/60 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Notification Drawer */}
      <NotificationCenter
        isOpen={isNotifOpen}
        onClose={() => setIsNotifOpen(false)}
        onUpdateCount={(cnt) => setUnreadCount(cnt)}
      />
    </>
  );
}