"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

export type HostelAssignmentState = {
  loading: boolean;
  allotted: boolean;
  hostelName: string | null;
  /** preference window state while not allotted: open | not_started | closed | null */
  windowState: string | null;
};

/**
 * Single source of truth for "has this student been allotted a hostel yet?".
 * Pages that only make sense after allotment (cluster map, mess, payment...) use
 * this instead of guessing from the user object.
 */
export function useHostelAssignment(): HostelAssignmentState {
  const [state, setState] = useState<HostelAssignmentState>({
    loading: true,
    allotted: false,
    hostelName: null,
    windowState: null,
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api.get("/api/hostels/my-assignment");
        if (r.data?.hostel_allocation_done) {
          if (alive) setState({ loading: false, allotted: true, hostelName: r.data.assigned_hostel_name, windowState: "allotted" });
          return;
        }
      } catch {
        /* fall through: treated as not allotted */
      }
      let windowState: string | null = null;
      try {
        const p = await api.get("/api/hostels/preference-status");
        windowState = p.data?.window?.state ?? null;
      } catch {
        /* ignore */
      }
      if (alive) setState({ loading: false, allotted: false, hostelName: null, windowState });
    })();
    return () => {
      alive = false;
    };
  }, []);

  return state;
}