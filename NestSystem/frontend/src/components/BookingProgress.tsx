"use client";

import { motion } from "framer-motion";

interface BookingProgressProps {
  currentStage: 1 | 2 | 3 | 4;
}

export default function BookingProgress({ currentStage }: BookingProgressProps) {
  const stages = [
    { id: 1, label: "Group Formation", sub: "Solo or 2-4 team" },
    { id: 2, label: "Preferences", sub: "Cluster ranking" },
    { id: 3, label: "Payment", sub: "₹60,000 fee" },
    { id: 4, label: "Allotment", sub: "Alloted" },
  ];

  return (
    <div className="bg-white/[0.03] rounded-2xl p-6 border border-white/10 shadow-sm mb-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <span>📌</span> Hostel Allotment Journey
        </h3>
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-500/10 text-blue-300">
          Stage {currentStage} of 4
        </span>
      </div>

      <div className="relative flex items-center justify-between">
        {/* Background Connecting Line */}
        <div className="absolute left-6 right-6 top-5 h-1 bg-white/10 -z-0" />

        {/* Active Connecting Line */}
        <motion.div
          className="absolute left-6 top-5 h-1 bg-blue-500 -z-0"
          initial={{ width: 0 }}
          animate={{
            width: `${((currentStage - 1) / (stages.length - 1)) * 100}%`,
          }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />

        {stages.map((stage, i) => {
          const isCompleted = stage.id < currentStage;
          const isCurrent = stage.id === currentStage;

          return (
            <motion.div
              key={stage.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.08, ease: "easeOut" }}
              className="relative z-10 flex flex-col items-center group"
            >
              <motion.div
                animate={isCurrent ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                transition={isCurrent ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" } : {}}
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors duration-300 ${
                  isCompleted
                    ? "bg-green-500 text-white shadow-sm"
                    : isCurrent
                    ? "bg-orange-500 text-white ring-4 ring-orange-500/25 shadow-[0_0_20px_-4px] shadow-orange-500/60"
                    : "bg-white/5 text-white/40 border border-white/15"
                }`}
              >
                {isCompleted ? "✓" : stage.id}
              </motion.div>
              <span
                className={`text-xs font-semibold mt-2.5 ${
                  isCurrent ? "text-orange-400 font-bold" : isCompleted ? "text-green-400" : "text-white/50"
                }`}
              >
                {stage.label}
              </span>
              <span className="text-[10px] text-white/40 hidden sm:block">
                {stage.sub}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}