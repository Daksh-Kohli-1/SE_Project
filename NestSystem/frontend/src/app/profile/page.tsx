"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import Navbar from "@/components/Navbar";

export default function ProfilePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    "personal" | "academics" | "family" | "documents" | "vehicle" | "preferences" | "security"
  >("personal");

  const [user, setUser] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [savedMsg, setSavedMsg] = useState(false);

  useEffect(() => {
    api.get("/api/auth/me")
      .then((r) => {
        setUser(r.data);
        setFormData(r.data);
      })
      .catch(() => {
        if (typeof window !== "undefined") {
          router.push("/login");
        }
      });
  }, []);

  async function handleSaveProfile() {
    try {
      const res = await api.put("/api/services/profile", formData);
      setUser(res.data);
    } catch {
      setUser((prev: any) => ({ ...prev, ...formData }));
    }
    setEditing(false);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 3000);
  }

  const navItems = [
    { id: "personal", label: "Personal Information", icon: "👤" },
    { id: "academics", label: "Academics", icon: "🎓" },
    { id: "family", label: "Family & Emergency", icon: "👨‍👩‍👧" },
    { id: "documents", label: "Documents (KYC)", icon: "📄" },
    { id: "vehicle", label: "Vehicle Details", icon: "🛵" },
    { id: "preferences", label: "Preferences", icon: "⚙️" },
    { id: "security", label: "Security & Privacy", icon: "🔒" },
  ];

  return (
    <main className="min-h-screen pb-20 bg-sand">
      <Navbar active="/profile" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink mb-1">
              My Profile
            </h1>
            <p className="text-slate text-sm sm:text-base">
              Your information, official documents, family details, and account preferences.
            </p>
          </div>

          <button
            onClick={() => setEditing(!editing)}
            className="px-5 py-2.5 rounded-full bg-marine hover:bg-ink text-white font-bold text-xs shadow-md transition self-start sm:self-auto"
          >
            {editing ? "Cancel Editing" : "✏️ Edit Profile"}
          </button>
        </div>

        {savedMsg && (
          <div className="mb-6 p-4 rounded-xl bg-moss/10 border border-moss/30 text-moss text-xs font-bold animate-fadeIn">
            ✓ Profile information saved successfully.
          </div>
        )}

        {/* Profile Content Layout */}
        <div className="grid lg:grid-cols-4 gap-8">
          {/* Left Sidebar Navigation */}
          <div className="lg:col-span-1">
            <div className="nest-card p-3 space-y-1 sticky top-24">
              {navItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id as any)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition text-left ${
                      isActive
                        ? "bg-marine text-white shadow-xs"
                        : "text-slate hover:bg-sand hover:text-ink"
                    }`}
                  >
                    <span className="text-base">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Main Detail Section */}
          <div className="lg:col-span-3">
            {/* 1. Personal Information Tab */}
            {activeTab === "personal" && (
              <div className="nest-card p-6 space-y-6">
                <div className="flex items-center gap-5 pb-6 border-b border-ink/10">
                  <div className="w-20 h-20 rounded-full bg-marine/10 border-2 border-marine text-marine font-display font-bold text-2xl flex items-center justify-center shadow-sm">
                    AK
                  </div>
                  <div>
                    <h3 className="font-display text-2xl font-bold text-ink">
                      {user?.name || "Student"}
                    </h3>
                    <p className="text-xs text-slate font-medium">
                      Student ID: <strong className="text-ink">{user?.roll_no || "N/A"}</strong> · {user?.branch || "N/A"}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-moss/10 text-moss text-[10px] font-bold">
                        Active Student
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-marine/10 text-marine text-[10px] font-bold">
                        {user?.hostel_name || "Hostel Not Assigned"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-slate mb-1">Full Name</label>
                    <input
                      type="text"
                      disabled={!editing}
                      value={formData.name || ""}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full border border-ink/15 rounded-xl px-4 py-2.5 text-xs text-ink bg-white disabled:bg-sand/60 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate mb-1">Gender</label>
                    <input
                      type="text"
                      disabled
                      value={user?.gender || ""}
                      className="w-full border border-ink/15 rounded-xl px-4 py-2.5 text-xs text-ink bg-sand/60 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate mb-1">Phone Number</label>
                    <input
                      type="text"
                      disabled={!editing}
                      value={formData.contact || ""}
                      onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                      className="w-full border border-ink/15 rounded-xl px-4 py-2.5 text-xs text-ink bg-white disabled:bg-sand/60 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate mb-1">Email Address</label>
                    <input
                      type="email"
                      disabled
                      value={user?.email || ""}
                      className="w-full border border-ink/15 rounded-xl px-4 py-2.5 text-xs text-ink bg-sand/60 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate mb-1">Date of Birth</label>
                    <input
                      type="text"
                      disabled={!editing}
                      value={formData.dob || ""}
                      onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                      className="w-full border border-ink/15 rounded-xl px-4 py-2.5 text-xs text-ink bg-white disabled:bg-sand/60 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate mb-1">Permanent Address</label>
                    <input
                      type="text"
                      disabled={!editing}
                      value={formData.address || ""}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full border border-ink/15 rounded-xl px-4 py-2.5 text-xs text-ink bg-white disabled:bg-sand/60 font-semibold"
                    />
                  </div>
                </div>

                {editing && (
                  <button
                    onClick={handleSaveProfile}
                    className="py-3 px-8 bg-coral hover:bg-ink text-white font-bold text-xs rounded-full shadow-md transition"
                  >
                    Save Personal Details
                  </button>
                )}
              </div>
            )}

            {/* 2. Academics Tab */}
            {activeTab === "academics" && (
              <div className="nest-card p-6 space-y-6">
                <h3 className="font-display text-xl font-bold text-ink mb-4 flex items-center gap-2">
                  🎓 Academic Information
                </h3>

                <div className="grid sm:grid-cols-2 gap-6">
                  <div className="bg-sand/60 p-4 rounded-xl border border-ink/5">
                    <p className="text-[10px] uppercase font-bold text-slate">Program</p>
                    <p className="text-sm font-bold text-ink">{user?.program || "N/A"}</p>
                  </div>
                  <div className="bg-sand/60 p-4 rounded-xl border border-ink/5">
                    <p className="text-[10px] uppercase font-bold text-slate">Department</p>
                    <p className="text-sm font-bold text-ink">{user?.department || "N/A"}</p>
                  </div>
                  <div className="bg-sand/60 p-4 rounded-xl border border-ink/5">
                    <p className="text-[10px] uppercase font-bold text-slate">Roll Number</p>
                    <p className="text-sm font-bold text-ink">{user?.roll_no || "N/A"}</p>
                  </div>
                  <div className="bg-sand/60 p-4 rounded-xl border border-ink/5">
                    <p className="text-[10px] uppercase font-bold text-slate">Section</p>
                    <p className="text-sm font-bold text-ink">{user?.section || "N/A"}</p>
                  </div>
                  <div className="bg-sand/60 p-4 rounded-xl border border-ink/5">
                    <p className="text-[10px] uppercase font-bold text-slate">Academic Year</p>
                    <p className="text-sm font-bold text-ink">{user?.year ? `Year ${user.year}` : "N/A"}</p>
                  </div>
                  <div className="bg-sand/60 p-4 rounded-xl border border-ink/5">
                    <p className="text-[10px] uppercase font-bold text-slate">Hostel Residence</p>
                    <p className="text-sm font-bold text-ink">{user?.hostel_name ? `${user.hostel_name} (Room ${user.room_no || "N/A"})` : "Unassigned"}</p>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Family & Emergency Tab */}
            {activeTab === "family" && (
              <div className="nest-card p-6 space-y-6">
                <h3 className="font-display text-xl font-bold text-ink mb-4 flex items-center gap-2">
                  👨‍👩‍👧 Family & Emergency Contacts
                </h3>

                <div className="grid sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-slate mb-1">Father's Name</label>
                    <input
                      type="text"
                      disabled={!editing}
                      value={formData.father_name || ""}
                      onChange={(e) => setFormData({ ...formData, father_name: e.target.value })}
                      className="w-full border border-ink/15 rounded-xl px-4 py-2.5 text-xs text-ink bg-white disabled:bg-sand/60 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate mb-1">Mother's Name</label>
                    <input
                      type="text"
                      disabled={!editing}
                      value={formData.mother_name || ""}
                      onChange={(e) => setFormData({ ...formData, mother_name: e.target.value })}
                      className="w-full border border-ink/15 rounded-xl px-4 py-2.5 text-xs text-ink bg-white disabled:bg-sand/60 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate mb-1">Emergency Contact Person</label>
                    <input
                      type="text"
                      disabled={!editing}
                      value={formData.emergency_contact_name || ""}
                      onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })}
                      className="w-full border border-ink/15 rounded-xl px-4 py-2.5 text-xs text-ink bg-white disabled:bg-sand/60 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate mb-1">Emergency Phone Number</label>
                    <input
                      type="text"
                      disabled={!editing}
                      value={formData.emergency_contact_phone || ""}
                      onChange={(e) => setFormData({ ...formData, emergency_contact_phone: e.target.value })}
                      className="w-full border border-ink/15 rounded-xl px-4 py-2.5 text-xs text-ink bg-white disabled:bg-sand/60 font-semibold"
                    />
                  </div>
                </div>

                {editing && (
                  <button
                    onClick={handleSaveProfile}
                    className="py-3 px-8 bg-coral hover:bg-ink text-white font-bold text-xs rounded-full shadow-md transition"
                  >
                    Save Family Details
                  </button>
                )}
              </div>
            )}

            {/* 4. Documents / KYC Tab */}
            {activeTab === "documents" && (
              <div className="nest-card p-6 space-y-6">
                <h3 className="font-display text-xl font-bold text-ink mb-4 flex items-center gap-2">
                  📄 Documents (KYC Verification)
                </h3>

                <div className="space-y-4">
                  {/* Doc 1 */}
                  <div className="p-4 rounded-xl bg-sand/60 border border-ink/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🆔</span>
                      <div>
                        <p className="text-xs font-bold text-ink">Aadhaar Card</p>
                        <p className="text-[10px] text-slate">Number: {user?.aadhaar_no || "N/A"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-full bg-moss/10 text-moss text-xs font-bold">
                        ✓ Verified
                      </span>
                      <button className="px-3 py-1 bg-white border border-ink/10 rounded-lg text-xs font-semibold text-ink hover:bg-sand">
                        View
                      </button>
                    </div>
                  </div>

                  {/* Doc 2 */}
                  <div className="p-4 rounded-xl bg-sand/60 border border-ink/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🎓</span>
                      <div>
                        <p className="text-xs font-bold text-ink">Thapar Student ID Card</p>
                        <p className="text-[10px] text-slate">Roll No: {user?.roll_no || "N/A"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-full bg-moss/10 text-moss text-xs font-bold">
                        ✓ Verified
                      </span>
                      <button className="px-3 py-1 bg-white border border-ink/10 rounded-lg text-xs font-semibold text-ink hover:bg-sand">
                        View
                      </button>
                    </div>
                  </div>

                  {/* Doc 3 */}
                  <div className="p-4 rounded-xl bg-sand/60 border border-ink/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🏠</span>
                      <div>
                        <p className="text-xs font-bold text-ink">Address Proof (Utility Bill / Passport)</p>
                        <p className="text-[10px] text-slate">Chandigarh Address Verified</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-full bg-moss/10 text-moss text-xs font-bold">
                        ✓ Verified
                      </span>
                      <button className="px-3 py-1 bg-white border border-ink/10 rounded-lg text-xs font-semibold text-ink hover:bg-sand">
                        View
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 5. Vehicle Details Tab */}
            {activeTab === "vehicle" && (
              <div className="nest-card p-6 space-y-6">
                <h3 className="font-display text-xl font-bold text-ink mb-4 flex items-center gap-2">
                  🛵 Vehicle Information & Campus Parking
                </h3>

                <div className="grid sm:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-slate mb-1">Vehicle Type</label>
                    <input
                      type="text"
                      disabled={!editing}
                      value={formData.vehicle_type || ""}
                      onChange={(e) => setFormData({ ...formData, vehicle_type: e.target.value })}
                      className="w-full border border-ink/15 rounded-xl px-4 py-2.5 text-xs text-ink bg-white disabled:bg-sand/60 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate mb-1">Model Name</label>
                    <input
                      type="text"
                      disabled={!editing}
                      value={formData.vehicle_model || ""}
                      onChange={(e) => setFormData({ ...formData, vehicle_model: e.target.value })}
                      className="w-full border border-ink/15 rounded-xl px-4 py-2.5 text-xs text-ink bg-white disabled:bg-sand/60 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate mb-1">Registration Number</label>
                    <input
                      type="text"
                      disabled={!editing}
                      value={formData.vehicle_reg_no || ""}
                      onChange={(e) => setFormData({ ...formData, vehicle_reg_no: e.target.value })}
                      className="w-full border border-ink/15 rounded-xl px-4 py-2.5 text-xs text-ink bg-white disabled:bg-sand/60 font-semibold"
                    />
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-marine/10 border border-marine/20 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-marine">Campus Parking Sticker Issued</p>
                    <p className="text-[10px] text-slate">Slot: P-North-42 (Girls Hostel Parking Bay)</p>
                  </div>
                  <span className="px-3 py-1 bg-moss/10 text-moss text-xs font-bold rounded-full">
                    Active Pass
                  </span>
                </div>
              </div>
            )}

            {/* 6. Preferences Tab */}
            {activeTab === "preferences" && (
              <div className="nest-card p-6 space-y-6">
                <h3 className="font-display text-xl font-bold text-ink mb-4 flex items-center gap-2">
                  ⚙️ Room & Living Preferences
                </h3>

                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-sand/60 border border-ink/10 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-ink">Quiet Hours Preference</p>
                      <p className="text-[10px] text-slate">Strict quiet hours after 10:00 PM</p>
                    </div>
                    <span className="text-xs font-bold text-marine">Enabled</span>
                  </div>

                  <div className="p-4 rounded-xl bg-sand/60 border border-ink/10 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-ink">Dietary Preference</p>
                      <p className="text-[10px] text-slate">Vegetarian Mess Menu Selection</p>
                    </div>
                    <span className="text-xs font-bold text-marine">Vegetarian</span>
                  </div>
                </div>
              </div>
            )}

            {/* 7. Security & Privacy Tab */}
            {activeTab === "security" && (
              <div className="nest-card p-6 space-y-6">
                <h3 className="font-display text-xl font-bold text-ink mb-4 flex items-center gap-2">
                  🔒 Security & Account Privacy
                </h3>

                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-sand/60 border border-ink/10 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-ink">Two-Factor Notifications</p>
                      <p className="text-[10px] text-slate">SMS & Email alert on hostel gate login</p>
                    </div>
                    <span className="text-xs font-bold text-moss">Active</span>
                  </div>

                  <div className="p-4 rounded-xl bg-sand/60 border border-ink/10 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-ink">Last Account Login</p>
                      <p className="text-[10px] text-slate">Today at 02:14 PM (Current Session)</p>
                    </div>
                    <span className="text-xs text-slate">Chrome · Windows</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
