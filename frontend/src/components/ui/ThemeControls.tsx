"use client";

import { useEffect, useRef, useState } from "react";

import {
  GLOBE_STYLES,
  useAppearanceStore,
} from "@/hooks/useAppearanceStore";

/**
 * Appearance controls: light/dark, plus the three globe treatments the
 * team is choosing between. Globe style is a dropdown rather than an
 * always-open list — three buttons permanently on screen read as a
 * settings panel that never closes, and the choice is made rarely enough
 * that collapsing it costs nothing.
 */
export default function ThemeControls() {
  const mode = useAppearanceStore((s) => s.mode);
  const globeStyle = useAppearanceStore((s) => s.globeStyle);
  const toggleMode = useAppearanceStore((s) => s.toggleMode);
  const setGlobeStyle = useAppearanceStore((s) => s.setGlobeStyle);
  const hydrate = useAppearanceStore((s) => s.hydrate);

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Close on an outside click, same as any native dropdown.
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  const activeStyle = GLOBE_STYLES.find((s) => s.id === globeStyle);

  return (
    <div
      ref={containerRef}
      className="pointer-events-auto fixed right-4 top-20 z-20 flex w-[172px] flex-col gap-2 sm:right-6 sm:top-24"
    >
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
      </button>

      <div className="relative">
        <button
          onClick={() => setIsOpen((v) => !v)}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          className="flex w-full items-center justify-between rounded-md border px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] transition-colors duration-200"
          style={{
            borderColor: "var(--control-border)",
            background: "var(--control-bg)",
            color: "var(--ink-muted)",
          }}
        >
          <span style={{ color: "var(--ink-faint)" }}>
            Globe:{" "}
            <span style={{ color: "var(--ink-muted)", textTransform: "none", letterSpacing: 0 }}>
              {activeStyle?.label ?? "—"}
            </span>
          </span>
          <span
            className="transition-transform duration-150"
            style={{
              color: "var(--accent)",
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            }}
          >
            ▾
          </span>
        </button>

        {isOpen ? (
          <div
            role="listbox"
            className="absolute right-0 top-[calc(100%+4px)] w-full rounded-md border p-1"
            style={{
              borderColor: "var(--control-border)",
              background: "var(--control-bg)",
              backdropFilter: "blur(10px)",
            }}
          >
            {GLOBE_STYLES.map((style) => {
              const active = style.id === globeStyle;
              return (
                <button
                  key={style.id}
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setGlobeStyle(style.id);
                    setIsOpen(false);
                  }}
                  title={style.blurb}
                  className="w-full rounded px-1.5 py-1 text-left font-mono text-[9px] tracking-wide transition-colors duration-150"
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
        ) : null}
      </div>
    </div>
  );
}
