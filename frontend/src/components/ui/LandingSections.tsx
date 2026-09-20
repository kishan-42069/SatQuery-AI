"use client";

import { useRouter } from "next/navigation";

/**
 * What the page becomes once the planet has risen out of the way.
 *
 * These sections scroll over the pinned scene, so every surface here is a
 * translucent wash rather than a solid panel — the sky and the globe's limb
 * stay faintly visible behind the copy, which is what keeps the landing
 * page reading as one continuous place rather than a second screen.
 */

/** How SatQuery works: the three core steps. */
const PIPELINE = [
  {
    step: "01",
    title: "Understand",
    body: "SatQuery understands your question and identifies what needs to be analyzed.",
  },
  {
    step: "02",
    title: "Analyze",
    body: "It selects the right satellite imagery and analysis methods.",
  },
  {
    step: "03",
    title: "Explain",
    body: "You get a clear result backed by the imagery used for the analysis.",
  },
];

/** The capabilities worth naming on a landing page. */
const CAPABILITIES = [
  { label: "Change over time", detail: "See what changed between two dates." },
  { label: "Land cover", detail: "Understand how land use has changed." },
  { label: "Object detection", detail: "Identify and count relevant objects in a scene." },
  { label: "Scene analysis", detail: "Explore what is visible in satellite imagery." },
];

export default function LandingSections() {
  const router = useRouter();

  return (
    <div className="relative z-10">
      {/* ── Pipeline ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 pb-24 pt-16 sm:px-10">
        <SectionLabel>How SatQuery AI works</SectionLabel>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {PIPELINE.map((item) => (
            <article
              key={item.step}
              className="rounded-2xl border p-6 backdrop-blur-md"
              style={{
                borderColor: "var(--hairline)",
                background: "var(--panel-wash)",
              }}
            >
              <span
                className="font-mono text-[10px] tracking-[0.2em]"
                style={{ color: "var(--accent)" }}
              >
                {item.step}
              </span>
              <h3
                className="mt-3 text-xl font-medium tracking-[-0.01em]"
                style={{
                  color: "var(--ink-primary)",
                  fontFamily: "var(--font-grotesk-display)",
                }}
              >
                {item.title}
              </h3>
              <p
                className="mt-2 text-sm leading-relaxed"
                style={{ color: "var(--ink-muted)" }}
              >
                {item.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* ── Capabilities ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 pb-28 sm:px-10">
        <SectionLabel>What can SatQuery AI help you explore?</SectionLabel>

        <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border sm:grid-cols-2 lg:grid-cols-4"
          style={{ borderColor: "var(--hairline)", background: "var(--hairline)" }}
        >
          {CAPABILITIES.map((cap) => (
            <div
              key={cap.label}
              className="p-6 backdrop-blur-md"
              style={{ background: "var(--panel-wash)" }}
            >
              <h3
                className="text-[15px] font-medium"
                style={{
                  color: "var(--ink-primary)",
                  fontFamily: "var(--font-grotesk-display)",
                }}
              >
                {cap.label}
              </h3>
              <p
                className="mt-1.5 text-[13px] leading-relaxed"
                style={{ color: "var(--ink-muted)" }}
              >
                {cap.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Closing call to action ────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 pb-32 text-center sm:px-10">
        <h2
          className="text-balance text-4xl font-medium leading-[1.05] tracking-[-0.03em] sm:text-5xl"
          style={{
            color: "var(--ink-primary)",
            fontFamily: "var(--font-grotesk-display)",
          }}
        >
          Put a question to the planet.
        </h2>
        <p
          className="mx-auto mt-5 max-w-md text-pretty text-sm leading-relaxed sm:text-base"
          style={{ color: "var(--ink-muted)" }}
        >
          Upload imagery, ask questions, and review the analysis with evidence backed by satellite data.
        </p>

        {/*
          A plain push rather than the hero's flying exit: by the time anyone
          reads this the planet is long off-screen, and animating a departure
          for something nobody can see is just latency before the click
          resolves.
        */}
        <button
          type="button"
          onClick={() => router.push("/analyze")}
          className="mt-10 cursor-pointer rounded-lg px-8 py-4 text-[15px] font-medium transition-[filter,transform] duration-200 hover:brightness-110 active:scale-[0.98]"
          style={{
            fontFamily: "var(--font-grotesk-display)",
            background:
              "linear-gradient(120deg, var(--accent), color-mix(in srgb, var(--accent) 55%, var(--accent-warm)))",
            color: "var(--background)",
          }}
        >
          Open workspace →
        </button>
      </section>
    </div>
  );
}

/** Shared eyebrow for the sections below the fold. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="font-mono text-[10px] uppercase tracking-[0.2em]"
      style={{ color: "var(--ink-muted)" }}
    >
      {children}
    </span>
  );
}
