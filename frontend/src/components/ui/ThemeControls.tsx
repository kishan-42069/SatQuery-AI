"use client";

import { useEffect } from "react";

import {
  GLOBE_STYLES,
  useAppearanceStore,
} from "@/hooks/useAppearanceStore";

/**
 * Appearance controls: light/dark, plus the three globe treatments the
 * team is choosing between. Kept on-screen (rather than behind a settings
 * panel) precisely so the choice can be made by looking at it.
 */
export default function ThemeControls() {
  const mode = useAppearanceStore((s) => s.mode);
  const globeStyle = useAppearanceStore((s) => s.globeStyle);
  const toggleMode = useAppearanceStore((s) => s.toggleMode);
  const setGlobeStyle = useAppearanceStore((s) => s.setGlobeStyle);
  const hydrate = useAppearanceStore((s) => s.hydrate);

  // Read the saved choice after mount, never during render — the server
  // has no localStorage, so reading it earlier would desync hydration.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // One attribute on <html> drives every CSS variable in globals.css.
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme = mode;
  }, [mode]);

  return (
    <div className="pointer-events-auto absolute right-4 top-16 z-20 flex w-[172px] flex-col gap-2 sm:right-6 sm:top-20">
      <button
        onClick={toggleMode}
        className="flex items-center justify-between rounded-md border px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] transition-colors duration-200"
        style={{
          borderColor: "var(--control-border)",
          background: "var(--control-bg)",
          color: "var(--ink-muted)",
        }}
      >
        <span>{mode === "dark" ? "Dark" : "Light"}</span>
        <span style={{ color: "var(--accent)" }}>
          {mode === "dark" ? "◐" : "◑"}
        </span>
      </button>

      <div
        className="rounded-md border p-1.5"
        style={{
          borderColor: "var(--control-border)",
          background: "var(--control-bg)",
        }}
      >
        <div
          className="mb-1 px-1 font-mono text-[8px] uppercase tracking-[0.16em]"
          style={{ color: "var(--ink-faint)" }}
        >
          Globe style
        </div>
        <div className="flex flex-col gap-0.5">
          {GLOBE_STYLES.map((style) => {
            const active = style.id === globeStyle;
            return (
              <button
                key={style.id}
                onClick={() => setGlobeStyle(style.id)}
                title={style.blurb}
                className="rounded px-1.5 py-1 text-left font-mono text-[9px] tracking-wide transition-colors duration-150"
                style={{
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "#04121a" : "var(--ink-muted)",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {style.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
