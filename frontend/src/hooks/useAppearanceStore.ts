"use client";

import { create } from "zustand";

export type ThemeMode = "light" | "dark";

/** The three treatments the team is choosing between before launch. */
export type GlobeStyle = "blue-marble" | "terrain" | "analytic";

export const GLOBE_STYLES: {
  id: GlobeStyle;
  label: string;
  blurb: string;
  /** Matches uVariant in the Earth fragment shader. */
  variant: number;
}[] = [
  {
    id: "blue-marble",
    label: "Blue Marble",
    blurb: "Photoreal NASA imagery with live cloud layer",
    variant: 0,
  },
  {
    id: "terrain",
    label: "Terrain",
    blurb: "Bathymetry-forward relief, cloud-free",
    variant: 1,
  },
  {
    id: "analytic",
    label: "Analytic",
    blurb: "EO data surface — graticule and lit coastlines",
    variant: 2,
  },
];

const STORAGE_KEY = "satquery.appearance";

interface AppearanceStore {
  mode: ThemeMode;
  globeStyle: GlobeStyle;
  /** False until the persisted choice has been read, to avoid SSR mismatch. */
  hydrated: boolean;

  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  setGlobeStyle: (style: GlobeStyle) => void;
  hydrate: () => void;
}

function persist(mode: ThemeMode, globeStyle: GlobeStyle) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, globeStyle }));
  } catch {
    // Private browsing / blocked storage — the app works fine without it.
  }
}

export const useAppearanceStore = create<AppearanceStore>((set, get) => ({
  // Light is the server-rendered default; hydrate() may switch it on mount.
  mode: "light",
  globeStyle: "blue-marble",
  hydrated: false,

  setMode: (mode) => {
    set({ mode });
    persist(mode, get().globeStyle);
  },

  toggleMode: () => {
    const mode = get().mode === "light" ? "dark" : "light";
    set({ mode });
    persist(mode, get().globeStyle);
  },

  setGlobeStyle: (globeStyle) => {
    set({ globeStyle });
    persist(get().mode, globeStyle);
  },

  hydrate: () => {
    if (get().hydrated) return;
    let mode = get().mode;
    let globeStyle = get().globeStyle;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<{
          mode: ThemeMode;
          globeStyle: GlobeStyle;
        }>;
        if (saved.mode === "light" || saved.mode === "dark") mode = saved.mode;
        if (GLOBE_STYLES.some((s) => s.id === saved.globeStyle)) {
          globeStyle = saved.globeStyle as GlobeStyle;
        }
      } else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
        mode = "dark";
      }
    } catch {
      // Fall through to defaults.
    }
    set({ mode, globeStyle, hydrated: true });
  },
}));
