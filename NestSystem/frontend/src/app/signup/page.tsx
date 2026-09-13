import Link from "next/link";

export default function SignupPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-sand py-12">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-ink/10 p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-marine/10 text-marine font-bold text-2xl flex items-center justify-center mx-auto mb-4">
          🏛️
        </div>

        <h1 className="font-display text-2xl font-bold text-ink mb-2">
          Registration Disabled
        </h1>
        
        <p className="text-xs text-slate mb-6 leading-relaxed">
          Self-registration is disabled for this portal. Access is strictly restricted to official pre-registered student records stored in the university database.
        </p>

        <div className="p-4 rounded-xl bg-sand border border-ink/10 text-xs text-slate text-left mb-6">
          <p className="font-bold text-ink mb-1">🔑 Need Access?</p>
          <p className="text-[11px]">
            Please log in using your pre-assigned institute email ID and password (`Pass@123`). If you are a new student, contact the Hostel Administration to add your student record to the database.
          </p>
        </div>

        <Link
          href="/login"
          className="inline-block w-full py-3 bg-marine hover:bg-ink text-white font-bold text-xs rounded-full shadow-md transition"
        >
          Go to Student Login →
        </Link>
      </div>
    </main>
  );
}
