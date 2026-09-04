"use client";

import QueryDemo from "./QueryDemo";
import SceneHUD from "./SceneHUD";
import ThemeControls from "./ThemeControls";
import { palette } from "@/lib/theme";

const CAPABILITIES = [
  "Visual QA",
  "Text-guided grounding",
  "Bi-temporal change",
  "Optical + SAR",
];

export default function HeroOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col">
      {/* top bar */}
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="pointer-events-auto flex items-center gap-2.5">
          <div
            className="grid h-7 w-7 place-items-center rounded-md border"
            style={{
              borderColor: "rgba(61,219,224,0.45)",
              background: "rgba(61,219,224,0.1)",
            }}
          >
            <div
              className="h-2 w-2 rounded-full"
              style={{ background: palette.cyan, boxShadow: `0 0 10px ${palette.cyan}` }}
            />
          </div>
          <span
            className="font-mono text-xs tracking-[0.22em]"
            style={{ color: "var(--ink-primary)" }}
          >
            SATQUERY<span style={{ color: "var(--accent)" }}>·AI</span>
          </span>
        </div>

        <div
          className="hidden font-mono text-[10px] tracking-[0.18em] sm:block"
          style={{ color: "var(--ink-faint)" }}
        >
          SIH 2026 · SIH26167 · SPACE TECHNOLOGY
        </div>
      </header>

      {/* main copy block, right-weighted so the globe owns the left */}
      <div className="flex flex-1 items-center">
        <div className="ml-auto w-full max-w-2xl px-6 pb-16 sm:px-10 lg:pr-16">
          <div
            className="pointer-events-auto mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1"
            style={{
              borderColor: "rgba(184,99,26,0.4)",
              background: "rgba(184,99,26,0.09)",
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--accent-warm)" }}
            />
            <span
              className="font-mono text-[10px] uppercase tracking-[0.16em]"
              style={{ color: "var(--accent-warm)" }}
            >
              Agentic vision-language assistant
            </span>
          </div>

          <h1
            className="text-balance text-4xl font-normal leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl"
            style={{ color: "var(--ink-primary)", fontFamily: "var(--font-serif-display)" }}
          >
            What if Earth
            <br />
            <span
              className="italic"
              style={{
                background: "linear-gradient(100deg, var(--accent), var(--accent-warm))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              could answer back?
            </span>
          </h1>

          <div className="pointer-events-auto mt-8">
            <QueryDemo />
          </div>

          <p
            className="mt-4 max-w-lg text-pretty text-sm leading-relaxed sm:text-base"
            style={{ color: "var(--ink-muted)", fontFamily: "var(--font-serif-display)" }}
          >
            SatQuery — The Earth is speaking. We&rsquo;re making it queryable.
          </p>

          <div className="mt-7 flex flex-wrap gap-2">
            {CAPABILITIES.map((cap) => (
              <span
                key={cap}
                className="pointer-events-auto rounded-md border px-2.5 py-1 font-mono text-[10px] tracking-wide transition-colors duration-200 hover:border-cyan-400/50"
                style={{
                  borderColor: "rgba(61,219,224,0.3)",
                  background: "var(--chip-bg)",
                  color: "var(--chip-text)",
                }}
              >
                {cap}
              </span>
            ))}
          </div>
        </div>
      </div>

      <SceneHUD />
      <ThemeControls />

      {/* bottom status strip */}
      <footer
        className="flex items-center justify-between border-t px-6 py-3 font-mono text-[10px] sm:px-10"
        style={{
          borderColor: "var(--hairline)",
          background:
            "var(--footer-wash)",
          color: "var(--ink-faint)",
        }}
      >
        <span>EVIDENCE-GROUNDED · MODEL PROVENANCE EXPOSED</span>
        <span className="hidden sm:inline">
          DRAG TO SPIN THE GLOBE · SCROLL TO ZOOM · PRESS ENTER TO RUN A QUERY
        </span>
      </footer>
    </div>
  );
}
