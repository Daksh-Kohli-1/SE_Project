"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import Navbar from "@/components/Navbar";

export default function RequestsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("Maintenance");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [submitting, setSubmitting] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);

  const categories = [
    { id: "Room cleaning", icon: "🧹", label: "Room Cleaning", desc: "Schedule room / washroom cleaning" },
    { id: "Maintenance", icon: "🔧", label: "Maintenance", desc: "Plumbing, electrical, furniture repair" },
    { id: "Leave", icon: "✈️", label: "Out-of-station Leave", desc: "Overnight & home leave pass" },
    { id: "Day out", icon: "🏙️", label: "Day Out", desc: "City outing pass until curfew" },
    { id: "Late entry", icon: "⏰", label: "Late Entry", desc: "Late permission beyond 10:00 PM" },
    { id: "Gate pass", icon: "🎫", label: "Gate Pass", desc: "Luggage / item movement gate pass" },
    { id: "Visitor", icon: "👥", label: "Visitor Pass", desc: "Register parent / guest visit" },
    { id: "Parcel", icon: "📦", label: "Parcel & Courier", desc: "Track & collect security packages" },
    { id: "Amenities", icon: "🏋️", label: "Amenities Booking", desc: "Book Gym, Laundry, Study Room" },
    { id: "Parking", icon: "🛵", label: "Vehicle Parking", desc: "Request vehicle sticker / slot" },
    { id: "Mess complaint", icon: "🍲", label: "Mess Complaint", desc: "Food quality / hygiene feedback" },
    { id: "Emergency", icon: "🚨", label: "Emergency Alert", desc: "Immediate warden & security dispatch" },
  ];

  async function fetchRequests() {
    try {
      const res = await api.get("/api/services/requests");
      setRequests(res.data);
    } catch {
      // Fallback demo requests
      setRequests([
        {
          id: "REQ-84920",
          category: "Maintenance",
          subject: "Washroom Tap Leakage",
          description: "Minor tap leak in attached washroom C-312.",
          priority: "Medium",
          status: "In progress",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "REQ-71029",
          category: "Day out",
          subject: "Sector 17 Shopping Outing",
          description: "Personal errands in Chandigarh market.",
          priority: "Low",
          status: "Approved",
          created_at: new Date(Date.now() - 86400000).toISOString(),
          updated_at: new Date(Date.now() - 86400000).toISOString(),
        },
      ]);
    }
  }

  useEffect(() => {
    fetchRequests();
  }, []);

  function handleOpenCategory(catId: string) {
    setSelectedCategory(catId);
    setSubject(`${catId} Request`);
    setIsModalOpen(true);
  }

  async function handleCreateRequest(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/api/services/requests", {
        category: selectedCategory,
        subject,
        description,
        priority,
      });
      await fetchRequests();
      setIsModalOpen(false);
      setDescription("");
      setSubject("");
    } catch {
      // fallback add
      const newReq = {
        id: `REQ-${Math.floor(10000 + Math.random() * 90000)}`,
        category: selectedCategory,
        subject,
        description,
        priority,
        status: "Submitted",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setRequests((prev) => [newReq, ...prev]);
      setIsModalOpen(false);
      setDescription("");
      setSubject("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen pb-20 bg-sand">
      <Navbar active="/requests" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink mb-1">
              Requests & Campus Services
            </h1>
            <p className="text-slate text-sm sm:text-base">
              Raise and track requests for a smooth and hassle-free hostel experience.
            </p>
          </div>

          <button
            onClick={() => {
              setSelectedCategory("Maintenance");
              setSubject("");
              setIsModalOpen(true);
            }}
            className="px-6 py-3 rounded-full bg-coral hover:bg-ink text-white font-bold text-xs shadow-md transition self-start sm:self-auto flex items-center gap-2"
          >
            <span>+</span> New Request
          </button>
        </div>

        {/* 12 Service Categories Grid */}
        <div className="mb-10">
          <h2 className="font-display text-xl font-bold text-ink mb-4">
            Select a Service Category
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleOpenCategory(cat.id)}
                className="nest-card p-4 text-left hover:border-marine/40 hover:-translate-y-0.5 transition flex flex-col justify-between group"
              >
                <div className="w-10 h-10 rounded-xl bg-sand group-hover:bg-marine/10 text-xl flex items-center justify-center mb-3 transition">
                  {cat.icon}
                </div>
                <div>
                  <h3 className="font-display font-bold text-sm text-ink mb-1 group-hover:text-marine transition">
                    {cat.label}
                  </h3>
                  <p className="text-[11px] text-slate line-clamp-2">{cat.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* My Requests Tracker List */}
        <div className="nest-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-display text-xl font-bold text-ink flex items-center gap-2">
                <span>📋</span> My Active Requests ({requests.length})
              </h2>
              <p className="text-xs text-slate">
                Track status updates and history for all your submitted hostel applications.
              </p>
            </div>

            <button
              onClick={fetchRequests}
              className="text-xs font-semibold text-marine hover:underline"
            >
              🔄 Refresh Status
            </button>
          </div>

          {requests.length === 0 ? (
            <div className="py-12 text-center text-slate">
              <p className="text-3xl mb-2">📬</p>
              <p className="font-bold text-ink text-sm">No active requests</p>
              <p className="text-xs mt-1">Select a category above to submit a new service ticket.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {requests.map((req) => {
                let statusBadge = "bg-blue-100 text-blue-800";
                if (req.status === "Approved" || req.status === "Completed") statusBadge = "bg-moss/10 text-moss";
                if (req.status === "In progress") statusBadge = "bg-amber/10 text-amber";
                if (req.status === "Emergency" || req.status === "Rejected") statusBadge = "bg-crimson/10 text-crimson";

                return (
                  <div
                    key={req.id}
                    className="p-4 rounded-2xl border border-ink/10 bg-white hover:bg-sand/40 transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-marine/10 text-marine font-bold text-xs flex items-center justify-center shrink-0">
                        {req.category.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-sm text-ink">{req.subject}</span>
                          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-sand text-slate">
                            {req.id}
                          </span>
                        </div>
                        <p className="text-xs text-slate mb-1">{req.description}</p>
                        <span className="text-[10px] text-slate/70">
                          Category: {req.category} · Submitted {new Date(req.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full ${statusBadge}`}>
                        {req.status}
                      </span>
                      <button
                        onClick={() => setSelectedRequest(req)}
                        className="px-3.5 py-1.5 rounded-xl border border-ink/10 text-xs font-semibold text-ink hover:bg-sand transition"
                      >
                        View Timeline →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* New Request Creation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-ink/10 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 border-b border-ink/10 pb-3">
              <h3 className="font-display text-xl font-bold text-ink">
                New Service Request
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-sand text-ink font-bold flex items-center justify-center hover:bg-ink/10"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRequest} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate mb-1">Category</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full border border-ink/15 rounded-xl px-4 py-2.5 text-xs text-ink bg-white font-semibold"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate mb-1">Subject / Summary</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Washroom cleaning / Water dispenser repair"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full border border-ink/15 rounded-xl px-4 py-2.5 text-xs text-ink font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate mb-1">Priority Level</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full border border-ink/15 rounded-xl px-4 py-2.5 text-xs text-ink bg-white font-semibold"
                >
                  <option value="Low">Low Priority</option>
                  <option value="Medium">Medium Priority (Standard)</option>
                  <option value="High">High Priority</option>
                  <option value="Emergency">Emergency</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate mb-1">Detailed Description</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Provide specific details, room location, or expected date & time..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full border border-ink/15 rounded-xl px-4 py-2.5 text-xs text-ink font-medium"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 rounded-full border border-ink/20 text-xs font-bold text-slate hover:bg-sand transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-full bg-coral hover:bg-ink text-white text-xs font-bold shadow-md transition disabled:opacity-50"
                >
                  {submitting ? "Submitting..." : "Submit Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Interactive Request Timeline Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-ink/10">
            <div className="flex items-center justify-between mb-4 border-b border-ink/10 pb-3">
              <div>
                <span className="text-[10px] font-mono font-bold text-marine px-2 py-0.5 bg-marine/10 rounded">
                  {selectedRequest.id}
                </span>
                <h3 className="font-display text-lg font-bold text-ink mt-1">
                  {selectedRequest.subject}
                </h3>
              </div>
              <button
                onClick={() => setSelectedRequest(null)}
                className="w-8 h-8 rounded-full bg-sand text-ink font-bold flex items-center justify-center hover:bg-ink/10"
              >
                ✕
              </button>
            </div>

            {/* Timeline */}
            <div className="space-y-4 mb-6">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-moss text-white text-xs font-bold flex items-center justify-center shrink-0">
                  ✓
                </div>
                <div>
                  <p className="text-xs font-bold text-ink">1. Request Submitted</p>
                  <p className="text-[10px] text-slate">Ticket created by Avleen Kaur</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-marine text-white text-xs font-bold flex items-center justify-center shrink-0">
                  2
                </div>
                <div>
                  <p className="text-xs font-bold text-ink">2. Assigned to Department</p>
                  <p className="text-[10px] text-slate">Hostel Maintenance & Housekeeping Staff</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-amber text-white text-xs font-bold flex items-center justify-center shrink-0">
                  3
                </div>
                <div>
                  <p className="text-xs font-bold text-ink">3. Resolution In Progress</p>
                  <p className="text-[10px] text-slate">Staff assigned to Visit Room C-312</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-ink/10">
              <button
                onClick={() => setSelectedRequest(null)}
                className="flex-1 py-2 rounded-full bg-sand text-xs font-bold text-ink hover:bg-ink/10"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
