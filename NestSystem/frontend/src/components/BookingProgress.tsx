"use client";

interface BookingProgressProps {
  currentStage: 1 | 2 | 3 | 4;
}

export default function BookingProgress({ currentStage }: BookingProgressProps) {
  const stages = [
    { id: 1, label: "Account", sub: "Profile verified" },
    { id: 2, label: "Group", sub: "Solo or 1-4 team" },
    { id: 3, label: "Preferences", sub: "Cluster ranking" },
    { id: 4, label: "Payment", sub: "₹60,000 fee" },
  ];

  return (
    <div className="bg-white rounded-2xl p-6 border border-ink/10 shadow-xs mb-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-base font-bold text-ink flex items-center gap-2">
          <span>📌</span> Hostel Allotment Journey
        </h3>
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-marine/10 text-marine">
          Stage {currentStage} of 4
        </span>
      </div>

      <div className="relative flex items-center justify-between">
        {/* Background Connecting Line */}
        <div className="absolute left-6 right-6 top-5 h-1 bg-ink/10 -z-0" />
        
        {/* Active Connecting Line */}
        <div
          className="absolute left-6 top-5 h-1 bg-marine transition-all duration-500 -z-0"
          style={{
            width: `${((currentStage - 1) / (stages.length - 1)) * 100}%`,
          }}
        />

        {stages.map((stage) => {
          const isCompleted = stage.id < currentStage;
          const isCurrent = stage.id === currentStage;
          const isPending = stage.id > currentStage;

          return (
            <div key={stage.id} className="relative z-10 flex flex-col items-center group">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${
                  isCompleted
                    ? "bg-moss text-white shadow-xs"
                    : isCurrent
                    ? "bg-marine text-white ring-4 ring-marine/20 shadow-md scale-110"
                    : "bg-sand text-slate border border-ink/20"
                }`}
              >
                {isCompleted ? "✓" : stage.id}
              </div>
              <span
                className={`text-xs font-semibold mt-2.5 ${
                  isCurrent ? "text-marine font-bold" : isCompleted ? "text-moss" : "text-slate"
                }`}
              >
                {stage.label}
              </span>
              <span className="text-[10px] text-slate/70 hidden sm:block">
                {stage.sub}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
