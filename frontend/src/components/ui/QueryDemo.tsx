"use client";

import { useEffect, useRef, useState } from "react";
import { useSceneStore } from "@/hooks/useSceneStore";
import { palette } from "@/lib/theme";

const SAMPLE_QUERIES = [
  "What changed in this region between 2022 and 2026?",
  "Find all built-up areas near the coastline.",
  "Compare optical and SAR — which changes look significant?",
  "What is visible in this image?",
];

const PIPELINE_STEPS = [
  "Intent",
  "Plan",
  "Route",
  "Ground",
  "Synthesise",
];

export default function QueryDemo() {
  const [value, setValue] = useState("");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [stepIndex, setStepIndex] = useState(-1);

  const runQueryDemo = useSceneStore((s) => s.runQueryDemo);
  const state = useSceneStore((s) => s.state);
  const isActive = state === "query-active";

  const inputRef = useRef<HTMLInputElement>(null);

  // Rotating typewriter placeholder — stops once the user types.
  useEffect(() => {
    if (value.length > 0) return;
    const full = SAMPLE_QUERIES[placeholderIndex];
    let char = 0;
    let holdTimer: ReturnType<typeof setTimeout>;

    const typeTimer = setInterval(() => {
      char += 1;
      setTyped(full.slice(0, char));
      if (char >= full.length) {
        clearInterval(typeTimer);
        holdTimer = setTimeout(() => {
          setPlaceholderIndex((i) => (i + 1) % SAMPLE_QUERIES.length);
        }, 2600);
      }
    }, 38);

    return () => {
      clearInterval(typeTimer);
      clearTimeout(holdTimer);
    };
  }, [placeholderIndex, value.length]);

  // Step-through of the agent pipeline while a query is "running".
  useEffect(() => {
    if (!isActive) {
      setStepIndex(-1);
      return;
    }
    let i = 0;
    setStepIndex(0);
    const timer = setInterval(() => {
      i += 1;
      if (i >= PIPELINE_STEPS.length) {
        clearInterval(timer);
        return;
      }
      setStepIndex(i);
    }, 950);
    return () => clearInterval(timer);
  }, [isActive]);

  const submit = () => {
    const q = value.trim() || SAMPLE_QUERIES[placeholderIndex];
    runQueryDemo(q);
    setValue("");
    inputRef.current?.blur();
  };

  return (
    <div className="w-full max-w-xl">
      <div
        className="group relative flex items-center gap-3 rounded-xl border px-4 py-3 backdrop-blur-xl transition-all duration-300"
        style={{
          background: "rgba(8, 14, 26, 0.62)",
          borderColor: isActive
            ? "rgba(61, 219, 224, 0.65)"
            : "rgba(61, 219, 224, 0.24)",
          boxShadow: isActive
            ? "0 0 40px rgba(61,219,224,0.18)"
            : "0 8px 32px rgba(0,0,0,0.45)",
        }}
      >
        <span
          className="font-mono text-xs"
          style={{ color: isActive ? palette.cyan : palette.textMuted }}
        >
          &gt;
        </span>

        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          aria-label="Ask a question about satellite imagery"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-transparent"
          style={{ color: palette.textPrimary }}
        />

        {value.length === 0 && (
          <span
            className="pointer-events-none absolute left-10 text-sm"
            style={{ color: "rgba(159,180,194,0.62)" }}
          >
            {typed}
            <span className="ml-0.5 inline-block animate-pulse">▍</span>
          </span>
        )}

        <button
          onClick={submit}
          className="shrink-0 rounded-lg px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-all duration-200 hover:brightness-125"
          style={{
            background: "rgba(61,219,224,0.14)",
            border: "1px solid rgba(61,219,224,0.4)",
            color: palette.cyanSoft,
          }}
        >
          Analyse
        </button>
      </div>

      {/* Agent pipeline readout — the PRD's "human-readable step summary" */}
      <div
        className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] transition-opacity duration-500"
        style={{ opacity: isActive ? 1 : 0.55 }}
      >
        {PIPELINE_STEPS.map((step, i) => (
          <span key={step} className="flex items-center gap-2">
            <span
              className="transition-colors duration-300"
              style={{
                color:
                  isActive && i <= stepIndex ? palette.cyanDeep : palette.inkFaint,
              }}
            >
              {step}
            </span>
            {i < PIPELINE_STEPS.length - 1 && (
              <span style={{ color: "rgba(76,92,104,0.35)" }}>→</span>
            )}
          </span>
        ))}
      </div>

      {/* Concrete scientific-query examples pulled from the PRD's demo
          scenario (VQA, grounding, bi-temporal change, optical+SAR) —
          clicking one runs it, so the capability is discoverable, not
          just a rotating placeholder the visitor has to wait out. */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span
          className="font-mono text-[9px] uppercase tracking-[0.14em]"
          style={{ color: palette.inkFaint }}
        >
          Try:
        </span>
        {SAMPLE_QUERIES.slice(0, 3).map((q) => (
          <button
            key={q}
            onClick={() => runQueryDemo(q)}
            className="rounded-full border px-2.5 py-1 text-left font-mono text-[9.5px] leading-none transition-colors duration-200 hover:border-cyan-400/60"
            style={{
              borderColor: "rgba(12,28,38,0.16)",
              background: "rgba(255,255,255,0.5)",
              color: palette.inkMuted,
            }}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
