"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
      <header className="border-b border-ink/10 bg-white/90 backdrop-blur-md sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="flex items-center gap-2 group">
              <div className="w-9 h-9 rounded-xl bg-marine text-white font-display font-bold text-xl flex items-center justify-center shadow-xs group-hover:scale-105 transition">
                N
              </div>
              <span className="font-display text-2xl font-bold tracking-tight text-ink">
                Nest
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
                    className={`px-3.5 py-2 rounded-lg text-sm font-medium transition relative ${
                      isActive
                        ? "text-marine font-semibold bg-marine/5"
                        : "text-slate hover:text-ink hover:bg-sand/60"
                    }`}
                  >
                    {l.label}
                    {isActive && (
                      <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-marine rounded-full animate-fadeIn" />
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
              className="relative p-2 rounded-full hover:bg-sand text-slate hover:text-ink transition focus:outline-none"
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
                <span className="absolute top-1 right-1 bg-coral text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center border-2 border-white">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Student Avatar & Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                className="flex items-center gap-2.5 p-1.5 pl-2.5 rounded-full hover:bg-sand border border-ink/10 transition"
              >
                <div className="w-7 h-7 rounded-full bg-marine/10 text-marine font-bold text-xs flex items-center justify-center border border-marine/20">
                  {displayInitials}
                </div>
                <span className="text-sm font-semibold text-ink hidden sm:inline-block">
                  {displayName}
                </span>
                <svg
                  className={`w-4 h-4 text-slate transition-transform ${
                    isUserDropdownOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* User Dropdown Menu */}
              {isUserDropdownOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-xl border border-ink/10 py-2 z-40 animate-fadeIn">
                  <div className="px-4 py-2 border-b border-ink/5">
                    <p className="text-sm font-semibold text-ink">{displayName}</p>
                    <p className="text-xs text-slate truncate">{user?.email || "avleen.kaur@thapar.edu"}</p>
                  </div>
                  <Link
                    href="/profile"
                    onClick={() => setIsUserDropdownOpen(false)}
                    className="block px-4 py-2 text-sm text-slate hover:text-ink hover:bg-sand/60 transition"
                  >
                    👤 My Profile
                  </Link>
                  <Link
                    href="/requests"
                    onClick={() => setIsUserDropdownOpen(false)}
                    className="block px-4 py-2 text-sm text-slate hover:text-ink hover:bg-sand/60 transition"
                  >
                    🛠️ Service Requests
                  </Link>
                  <button
                    onClick={logout}
                    className="w-full text-left px-4 py-2 text-sm font-medium text-coral hover:bg-coral/5 transition border-t border-ink/5"
                  >
                    🚪 Log out
                  </button>
                </div>
              )}
            </div>

            {/* Mobile Hamburger Toggle */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-slate hover:text-ink hover:bg-sand transition"
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
        {isMenuOpen && (
          <div className="lg:hidden border-t border-ink/10 bg-white px-4 pt-2 pb-4 space-y-1 animate-fadeIn">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setIsMenuOpen(false)}
                className={`block px-4 py-2.5 rounded-lg text-sm font-medium ${
                  active === l.href
                    ? "bg-marine text-white font-semibold"
                    : "text-slate hover:bg-sand hover:text-ink"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        )}
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
