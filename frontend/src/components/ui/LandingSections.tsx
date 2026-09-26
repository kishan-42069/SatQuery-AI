"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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

const SATELLITE_PREVIEWS = {
  temporal: {
    primary:
      "https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&w=1200&q=80",
    secondary:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
  },
  landcover: {
    primary:
      "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80",
  },
  scene: {
    primary:
      "https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=1200&q=80",
  },
} as const;

type SatelliteVariant = keyof typeof SATELLITE_PREVIEWS;

type CapabilityItem = {
  label: string;
  detail: string;
  description: string;
  tag: string;
  preview: {
    variant: SatelliteVariant;
    primary?: string;
    secondary?: string;
  };
};

/** The capabilities worth naming on a landing page. */
const CAPABILITIES: CapabilityItem[] = [
  {
    label: "Change over time",
    detail: "See what changed between two dates.",
    description:
      "Compare satellite imagery from two dates and surface meaningful change patterns across a landscape.",
    tag: "Temporal view",
    preview: {
      variant: "temporal",
      ...SATELLITE_PREVIEWS.temporal,
    },
  },
  {
    label: "Land cover",
    detail: "Understand how land use has changed.",
    description:
      "Map vegetation, bare ground, water, built structures, and other land classes from a single image.",
    tag: "Classification",
    preview: {
      variant: "landcover",
      ...SATELLITE_PREVIEWS.landcover,
    },
  },
  {
    label: "Scene analysis",
    detail: "Explore what is visible in satellite imagery.",
    description:
      "Read the broader story of a place: roads, terrain, built form, and visible patterns in the landscape.",
    tag: "Context map",
    preview: {
      variant: "scene",
      ...SATELLITE_PREVIEWS.scene,
    },
  },
];

function SatellitePreview({
  variant,
  compact = false,
}: {
  variant: SatelliteVariant;
  compact?: boolean;
}) {
  const isTemporal = variant === "temporal";
  const isLandcover = variant === "landcover";

  return (
    <div
      className="absolute inset-0"
      style={{
        background:
          variant === "scene"
            ? "linear-gradient(180deg, rgba(8, 12, 18, 0.2), rgba(8, 12, 18, 0.55)), url(\"https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=1200&q=80\") center/cover no-repeat"
            : variant === "landcover"
              ? "linear-gradient(180deg, rgba(6, 12, 16, 0.18), rgba(6, 12, 16, 0.6)), url(\"https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80\") center/cover no-repeat"
              : "linear-gradient(180deg, rgba(8, 12, 18, 0.18), rgba(8, 12, 18, 0.56)), url(\"https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&w=1200&q=80\") center/cover no-repeat",
        transform: compact ? "scale(1.06)" : "scale(1.02)",
        transition: "transform 220ms ease, filter 220ms ease",
      }}
    >
      {isTemporal && (
        <>
          <div
            className="absolute inset-y-0 left-0 w-1/2 border-r border-white/10"
            style={{
              background:
                "url(\"https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&w=900&q=80\") center/cover no-repeat",
            }}
          />
          <div
            className="absolute inset-y-0 right-0 w-1/2"
            style={{
              background:
                "url(\"https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80\") center/cover no-repeat",
            }}
          />
          <div className="absolute inset-0 bg-linear-to-r from-black/50 via-black/12 to-black/55" />
          <div className="absolute inset-y-0 left-1/2 w-px bg-white/30" />
          <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-white/20 bg-black/20 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.2em] text-white/85">
            before
          </div>
          <div className="absolute right-3 top-3 rounded-full border border-white/20 bg-black/20 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.2em] text-white/85">
            after
          </div>
        </>
      )}

      {isLandcover && (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(10,82,60,0.18),transparent_33%),radial-gradient(circle_at_70%_34%,rgba(100,160,180,0.14),transparent_28%),radial-gradient(circle_at_65%_72%,rgba(155,125,90,0.18),transparent_30%)]" />
          <div className="absolute left-[3%] top-[12%] h-[44%] w-[26%] rounded-full bg-emerald-300/10 blur-[2px]" />
          <div className="absolute left-[30%] top-[20%] h-[32%] w-[42%] rounded-[28%] bg-cyan-300/10 blur-[2px]" />
          <div className="absolute right-[8%] top-[18%] h-[34%] w-[28%] rounded-[24%] bg-amber-200/10 blur-[2px]" />
          <div className="absolute inset-x-[18%] bottom-[10%] h-[24%] rounded-[30%] bg-slate-300/8 blur-[2px]" />
        </>
      )}

      {variant === "scene" && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_28%,rgba(255,255,255,0.12),transparent_22%),radial-gradient(circle_at_72%_48%,rgba(180,220,255,0.14),transparent_18%)]" />
      )}

      {!compact && (
        <div className="absolute inset-0 bg-linear-to-t from-black/55 via-transparent to-black/10" />
      )}
    </div>
  );
}

export default function LandingSections() {
  const router = useRouter();
  const [activeCapability, setActiveCapability] = useState(CAPABILITIES[0]);
  const [activeWorkflowStep, setActiveWorkflowStep] = useState<number | null>(null);

  return (
    <div className="relative z-10">
      {/* ── Pipeline ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 pb-24 pt-16 sm:px-10">
        <SectionLabel>How SatQuery AI works</SectionLabel>

        <div className="workflow-shell relative mt-10" data-active-step={activeWorkflowStep ?? "none"}>
          <svg
            className="workflow-connector workflow-connector-desktop"
            viewBox="0 0 1000 220"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <marker id="workflow-arrow-head" markerWidth="12" markerHeight="12" refX="9.5" refY="6" orient="auto">
                <path d="M 0 0 L 12 6 L 0 12 z" fill="rgba(122, 233, 240, 0.9)" />
              </marker>
            </defs>
            <path className="workflow-path step-01-path" d="M 350 118 C 410 145, 468 156, 544 146" markerEnd="url(#workflow-arrow-head)" />
            <path className="workflow-path step-02-path" d="M 760 128 C 835 110, 900 112, 970 126" markerEnd="url(#workflow-arrow-head)" />
          </svg>

          <svg
            className="workflow-connector workflow-connector-mobile"
            viewBox="0 0 360 620"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <marker id="workflow-arrow-head-mobile" markerWidth="12" markerHeight="12" refX="9.5" refY="6" orient="auto">
                <path d="M 0 0 L 12 6 L 0 12 z" fill="rgba(122, 233, 240, 0.9)" />
              </marker>
            </defs>
            <path className="workflow-path step-01-path" d="M 180 148 C 180 198, 180 230, 180 286" markerEnd="url(#workflow-arrow-head-mobile)" />
            <path className="workflow-path step-02-path" d="M 180 388 C 180 430, 180 466, 180 520" markerEnd="url(#workflow-arrow-head-mobile)" />
          </svg>

          <div className="workflow-grid relative grid gap-4 md:grid-cols-3">
            {PIPELINE.map((item, index) => (
              <article
                key={item.step}
                tabIndex={0}
                aria-label={`${item.step} ${item.title}`}
                onMouseEnter={() => setActiveWorkflowStep(index)}
                onMouseLeave={() => setActiveWorkflowStep(null)}
                onFocus={() => setActiveWorkflowStep(index)}
                onBlur={() => setActiveWorkflowStep(null)}
                className="workflow-card group relative rounded-[1.6rem] border p-5 text-left outline-none backdrop-blur-md"
                style={{
                  borderColor: "var(--hairline)",
                  background: "var(--panel-wash)",
                  animation: `workflowFadeIn ${index * 220 + 260}ms cubic-bezier(0.2, 0.8, 0.2, 1) both`,
                }}
              >
                <span
                  className="workflow-step font-mono text-[11px] tracking-[0.2em]"
                  style={{ color: "var(--accent)" }}
                >
                  {item.step}
                </span>
                <h3
                  className="mt-3 text-2xl font-medium tracking-[-0.01em]"
                  style={{
                    color: "var(--ink-primary)",
                    fontFamily: "var(--font-grotesk-display)",
                  }}
                >
                  {item.title}
                </h3>
                <p
                  className="mt-2 text-base leading-relaxed"
                  style={{ color: "var(--ink-muted)" }}
                >
                  {item.body}
                </p>
              </article>
            ))}
          </div>
        </div>

        <style jsx>{`
          .workflow-shell {
            position: relative;
            isolation: isolate;
            padding-top: 0.25rem;
          }

          .workflow-grid {
            position: relative;
            z-index: 2;
          }

          .workflow-card {
            position: relative;
            min-height: 188px;
            z-index: 2;
            transform: translateY(0);
            transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease, filter 180ms ease;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
          }

          .workflow-connector {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            z-index: 1;
            pointer-events: none;
            overflow: visible;
          }

          .workflow-path {
            fill: none;
            stroke: rgba(122, 233, 240, 0.88);
            stroke-width: 2.2;
            stroke-linecap: round;
            stroke-linejoin: round;
            stroke-dasharray: 12 14;
            opacity: 0.9;
            transition: stroke 180ms ease, opacity 180ms ease, filter 180ms ease;
            animation: workflowDraw 920ms ease-out both;
          }

          .step-02-path {
            animation-delay: 180ms;
          }

          .workflow-shell[data-active-step="0"] .step-01-path,
          .workflow-shell[data-active-step="1"] .step-01-path,
          .workflow-shell[data-active-step="1"] .step-02-path,
          .workflow-shell[data-active-step="2"] .step-02-path {
            stroke: rgba(122, 233, 240, 0.98);
            opacity: 1;
            filter: drop-shadow(0 0 8px rgba(122, 233, 240, 0.14));
          }

          .workflow-connector-desktop {
            display: block;
          }

          .workflow-connector-mobile {
            display: none;
          }

          @keyframes workflowFadeIn {
            0% {
              opacity: 0;
              transform: translateY(10px);
            }
            100% {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @keyframes workflowDraw {
            0% {
              stroke-dasharray: 220;
              stroke-dashoffset: 220;
              opacity: 0.22;
            }
            100% {
              stroke-dasharray: 220;
              stroke-dashoffset: 0;
              opacity: 0.9;
            }
          }

          @media (max-width: 767px) {
            .workflow-connector-desktop {
              display: none;
            }

            .workflow-connector-mobile {
              display: block;
            }

            .workflow-card {
              min-height: 170px;
            }

            .workflow-card:nth-child(1),
            .workflow-card:nth-child(2),
            .workflow-card:nth-child(3) {
              transform: none;
            }

            .workflow-card:nth-child(2) {
              margin-top: 0.25rem;
            }

            .workflow-card:nth-child(3) {
              margin-top: 0.25rem;
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .workflow-card,
            .workflow-card::after,
            .workflow-path {
              animation: none !important;
              transition: none !important;
            }

            .workflow-card:nth-child(1),
            .workflow-card:nth-child(2),
            .workflow-card:nth-child(3) {
              transform: none;
            }
          }
        `}</style>
      </section>

      {/* ── Capabilities ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 pb-28 sm:px-10">
        <SectionLabel>What can SatQuery AI do?</SectionLabel>

        <div className="mt-10">
          <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
            {CAPABILITIES.map((cap) => {
              const isActive = activeCapability.label === cap.label;

              return (
                <button
                  key={cap.label}
                  type="button"
                  aria-pressed={isActive}
                  aria-label={cap.label}
                  onClick={() => setActiveCapability(cap)}
                  className="group relative flex min-h-45 w-full flex-col justify-between overflow-hidden rounded-2xl border px-4 py-4 text-left transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-(--accent)/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent md:px-5"
                  style={{
                    borderColor: isActive ? "color-mix(in srgb, var(--accent) 60%, var(--hairline))" : "var(--hairline)",
                    background: isActive
                      ? "linear-gradient(180deg, color-mix(in srgb, var(--panel-wash) 78%, var(--accent) 22%), var(--panel-wash))"
                      : "var(--panel-wash)",
                    boxShadow: isActive ? "0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent), 0 18px 36px rgba(15, 21, 29, 0.18)" : "none",
                    transform: isActive ? "translateY(-1px)" : "translateY(0)",
                    flex: isActive ? "1.4 1 0%" : "1 1 0%",
                    opacity: isActive ? 1 : 0.8,
                  }}
                >
                  <div
                    className="relative h-20 overflow-hidden rounded-xl border border-white/10"
                    style={{
                      background: "rgba(10, 18, 24, 0.7)",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
                    }}
                  >
                    <SatellitePreview variant={cap.preview.variant} compact />
                    <div className="absolute inset-0 bg-linear-to-t from-black/40 via-transparent to-black/10" />
                  </div>

                  <div className="mt-3">
                    <span
                      className="font-mono text-[11px] uppercase tracking-[0.18em]"
                      style={{ color: isActive ? "var(--accent)" : "var(--ink-muted)" }}
                    >
                      {cap.tag}
                    </span>

                    <div className="mt-3">
                      <h3
                        className="text-[17px] font-medium leading-tight"
                        style={{
                          color: "var(--ink-primary)",
                          fontFamily: "var(--font-grotestesk-display)",
                        }}
                      >
                        {cap.label}
                      </h3>
                      <p
                        className="mt-1.5 text-[13px] leading-relaxed"
                        style={{ color: isActive ? "var(--ink-primary)" : "var(--ink-muted)" }}
                      >
                        {cap.detail}
                      </p>
                    </div>
                  </div>

                  <div
                    className="mt-4 h-1.5 w-full rounded-full transition-all duration-300"
                    style={{
                      background: isActive
                        ? "linear-gradient(90deg, var(--accent), transparent)"
                        : "rgba(160, 200, 235, 0.12)",
                    }}
                  />
                </button>
              );
            })}
          </div>

          <div
            id={`capability-panel-${activeCapability.label}`}
            className="mt-5 overflow-hidden rounded-[1.75rem] border transition-all duration-300 ease-out"
            style={{
              borderColor: "var(--hairline)",
              background: "linear-gradient(180deg, color-mix(in srgb, var(--panel-wash) 92%, transparent), var(--panel-wash))",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
            }}
          >
            <div className="grid gap-6 px-4 py-5 sm:px-6 sm:py-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
              <div>
                <span
                  className="font-mono text-[10px] uppercase tracking-[0.2em]"
                  style={{ color: "var(--accent)" }}
                >
                  Selected analysis
                </span>

                <h3
                  className="mt-3 text-2xl sm:text-3xl"
                  style={{
                    color: "var(--ink-primary)",
                    fontFamily: "var(--font-grotesk-display)",
                  }}
                >
                  {activeCapability.label}
                </h3>

                <p
                  className="mt-3 max-w-xl text-sm leading-relaxed sm:text-[15px]"
                  style={{ color: "var(--ink-muted)" }}
                >
                  {activeCapability.description}
                </p>

                <button
                  type="button"
                  onClick={() => router.push("/analyze")}
                  className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-(--accent)/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                  style={{
                    borderColor: "color-mix(in srgb, var(--accent) 45%, var(--hairline))",
                    background: "linear-gradient(120deg, var(--accent), color-mix(in srgb, var(--accent) 55%, var(--accent-warm)))",
                    color: "var(--background)",
                    fontFamily: "var(--font-grotesk-display)",
                  }}
                >
                  Try this analysis <span aria-hidden="true">→</span>
                </button>
              </div>

              <div
                className="relative h-52 overflow-hidden rounded-2xl border"
                style={{
                  borderColor: "var(--hairline)",
                  background: "rgba(8, 15, 21, 0.8)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07)",
                }}
              >
                <SatellitePreview variant={activeCapability.preview.variant} />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_38%)]" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Closing call to action ────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 pb-32 text-center sm:px-10">
        <h2
          className="text-balance text-[3rem] font-medium leading-[1.05] tracking-[-0.03em] sm:text-[4rem]"
          style={{
            color: "var(--ink-primary)",
            fontFamily: "var(--font-grotesk-display)",
          }}
        >
          Put a question to the planet.
        </h2>
        <p
          className="mx-auto mt-5 max-w-lg text-pretty text-base leading-relaxed sm:text-lg"
          style={{ color: "var(--ink-muted)" }}
        >
          Upload imagery, ask questions, and review the analysis with evidence backed by satellite data.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => router.push("/analyze")}
            className="inline-flex min-h-14 min-w-55 cursor-pointer items-center justify-center rounded-xl px-6 py-4 text-[16px] font-medium transition-[filter,transform] duration-200 hover:brightness-110 active:scale-[0.98]"
            style={{
              fontFamily: "var(--font-grotesk-display)",
              background:
                "linear-gradient(120deg, var(--accent), color-mix(in srgb, var(--accent) 55%, var(--accent-warm)))",
              color: "var(--background)",
            }}
          >
            Open workspace →
          </button>

          <button
            type="button"
            onClick={() => router.push("/model-demo")}
            className="inline-flex min-h-14 min-w-55 cursor-pointer items-center justify-center rounded-xl border px-6 py-4 text-[16px] font-medium transition-[filter,transform,border-color,background-color] duration-200 hover:brightness-110 hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--hairline))] active:scale-[0.98]"
            style={{
              fontFamily: "var(--font-grotesk-display)",
              borderColor: "color-mix(in srgb, var(--accent) 28%, var(--hairline))",
              background: "rgba(14, 22, 31, 0.82)",
              color: "var(--ink-primary)",
            }}
          >
            Model Demo →
          </button>
        </div>

        {/*
          A plain push rather than the hero's flying exit: by the time anyone
          reads this the planet is long off-screen, and animating a departure
          for something nobody can see is just latency before the click
          resolves.
        */}
      </section>
    </div>
  );
}

/** Shared eyebrow for the sections below the fold. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="font-mono text-[40px] uppercase tracking-[0.2em] leading-none"
      style={{ color: "var(--ink-muted)" }}
    >
      {children}
    </span>
  );
}
