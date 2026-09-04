"use client";

import { create } from "zustand";
import { timing, type SceneState } from "@/lib/theme";

interface SceneStore {
  /** Current high-level scene state driving all reactive visuals. */
  state: SceneState;
  /** Number of detection bounding boxes currently shown on the scan patch. */
  activeBoxCount: number;
  /** True while the pointer hovers the satellite mesh. */
  satelliteHovered: boolean;
  /** The last query text submitted through the demo input, if any. */
  lastQuery: string | null;

  runQueryDemo: (query: string) => void;
  setSatelliteHovered: (hovered: boolean) => void;
}

let revertTimer: ReturnType<typeof setTimeout> | null = null;

export const useSceneStore = create<SceneStore>((set) => ({
  state: "idle",
  activeBoxCount: 2,
  satelliteHovered: false,
  lastQuery: null,

  runQueryDemo: (query: string) => {
    if (revertTimer) clearTimeout(revertTimer);
    set({ state: "query-active", activeBoxCount: 4, lastQuery: query });
    revertTimer = setTimeout(() => {
      set({ state: "idle", activeBoxCount: 2 });
    }, timing.queryActiveDurationMs);
  },

  setSatelliteHovered: (hovered: boolean) =>
    set((s) => ({
      satelliteHovered: hovered,
      state: hovered && s.state === "idle" ? "hover-satellite" : s.state === "hover-satellite" && !hovered ? "idle" : s.state,
    })),
}));
