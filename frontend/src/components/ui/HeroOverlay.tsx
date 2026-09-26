"use client";

import Link from "next/link";
import { useState } from "react";

import SceneHUD from "./SceneHUD";
import ThemeControls from "./ThemeControls";

import { useHeroExitNavigation } from "@/hooks/useHeroTransition";
import { HERO_EXIT_MS } from "@/lib/heroExit";
import { apiFetch } from "@/lib/api/client";

/** Doors into the analysis app. The hero is the landing page; these are
 *  how a visitor actually gets to the tool. */
const WORKSPACE_LINKS = [
  { href: "/analyze", label: "Analyze" },
  { href: "/compare", label: "Compare" },
  { href: "/reports", label: "Reports" },
];

/** A plain left-click is ours to animate; every other kind of click is the
 *  browser's. Keeping the real href means Cmd-click, middle-click and "open
 *  in new tab" all still do what they should, and the page degrades to
 *  ordinary navigation with no JS at all. */
function isPlainClick(event: React.MouseEvent) {
  return !(
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.button !== 0
  );
}

export default function HeroOverlay() {
  const { exitTo, isExiting } = useHeroExitNavigation();
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);


  /**
   * Seeds the demo project on the backend, then drops the visitor straight
   * into the comparison screen looking at it. This is the "show me, don't
   * make me set it up" door — it exists because a first-time visitor has no
   * imagery of their own to ask questions about yet.
   */
  async function loadExampleProject() {
    setSeeding(true);
    setSeedError(null);
    try {
      await apiFetch("/assets/demo/seed", { method: "POST" });
      exitTo("/compare");
    } catch (error) {
      // Inline rather than alert(): the hero is the first thing anyone sees
      // and a modal dialog on a failed fetch is a bad first impression.
      setSeedError(
        error instanceof Error ? error.message : "Could not load the example.",
      );
      setSeeding(false);
    }
  }

  return (
    <>
    <div
      className="pointer-events-none relative z-10"
      style={{
        // The chrome clears out early, so the last thing on screen is the
        // planet leaving rather than text hanging over an empty sky.
        opacity: isExiting ? 0 : 1,
        transition: `opacity ${Math.round(HERO_EXIT_MS * 0.45)}ms ease-out`,
      }}
    >
      {/*
        Masthead: wordmark left, sections centred, the way into the app on
        the right. Fixed rather than scrolled away, so the door out of the
        landing page is reachable from any point in it.

        A three-column grid with a 1fr gutter on each side is what actually
        centres the nav — centring it inside a flex row would only centre it
        in the space the wordmark and the button leave over, which drifts as
        either one changes width.
      */}
      <header
        className="fixed inset-x-0 top-0 z-30 grid grid-cols-[1fr_auto_1fr] items-center px-6 py-5 backdrop-blur-[2px] sm:px-10"
        style={{
          // Just enough wash to keep the wordmark legible when the planet's
          // lit limb scrolls up behind it.
          background:
            "linear-gradient(to bottom, color-mix(in srgb, var(--background) 72%, transparent), transparent)",
        }}
      >
        <Link
          href="/"
          className="pointer-events-auto justify-self-start font-mono text-xs tracking-[0.22em]"
          style={{ color: "var(--ink-primary)" }}
        >
          SATQUERY<span style={{ color: "var(--accent)" }}>·AI</span>
        </Link>

        {/* Centre column. Hidden below md, where there is no room for it and
            the button on the right is the only door that matters. */}
        <nav className="pointer-events-auto hidden items-center gap-1 justify-self-center md:flex">
          {WORKSPACE_LINKS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={(event) => {
                if (!isPlainClick(event)) return;
                event.preventDefault();
                exitTo(item.href);
              }}
              className="cursor-pointer rounded-lg px-3.5 py-2 text-[13px] transition-colors duration-200 hover:text-[var(--ink-primary)]"
              style={{
                color: "var(--ink-muted)",
                fontFamily: "var(--font-grotesk-display)",
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Action buttons */}
        <div className="flex items-center gap-2 justify-self-end">
          <button
            type="button"
            onClick={() => exitTo("/model-demo")}
            title="Interactive demonstration of change detection"
            className="pointer-events-auto flex items-center gap-1.5 rounded-lg bg-cyan-500/10 px-4 py-2 text-[13px] font-semibold text-cyan-400 hover:bg-cyan-500/20 transition-all duration-200 active:scale-95"
            style={{
              fontFamily: "var(--font-grotesk-display)",
            }}
          >
            <span>Demo</span>
          </button>

          <button
            type="button"
            onClick={loadExampleProject}
            disabled={seeding}
            title="Load real satellite imagery for comparison"
            className="pointer-events-auto hidden cursor-pointer rounded-lg px-4 py-2 text-[13px] transition-colors duration-200 disabled:cursor-wait disabled:opacity-70 sm:block"
            style={{
              fontFamily: "var(--font-grotesk-display)",
              background: "var(--control-bg)",
              color: "var(--ink-muted)",
            }}
          >
            {seeding ? "Loading…" : "Load example"}
          </button>

          <a
            href="/analyze"
            onClick={(event) => {
              if (!isPlainClick(event)) return;
              event.preventDefault();
              exitTo("/analyze");
            }}
            className="pointer-events-auto cursor-pointer rounded-lg px-5 py-2.5 text-[13px] font-medium transition-[filter,transform] duration-200 hover:brightness-110 active:scale-[0.98]"
            style={{
              fontFamily: "var(--font-grotesk-display)",
              background:
                "linear-gradient(120deg, var(--accent), color-mix(in srgb, var(--accent) 55%, var(--accent-warm)))",
              color: "var(--background)",
            }}
          >
            Open workspace
          </a>
        </div>

        {/* Failure from the seed call, parked under the bar so it never
            shifts the layout of the bar itself. */}
        {seedError && (
          <p
            className="col-span-3 mt-2 text-right font-mono text-[10px]"
            style={{ color: "var(--accent-warm)" }}
          >
            {seedError}
          </p>
        )}
      </header>

      {/*
        One viewport tall, everything on the centre line, and weighted to the
        upper half — the lower half is where the planet crests the bottom
        edge, so copy placed dead centre would sit on top of it.

        100svh, not 100vh: on mobile the browser chrome collapses as you
        scroll, and vh is measured against the collapsed height, which leaves
        the first screen overflowing by the height of the toolbar.
      */}
      <section className="relative flex min-h-[100svh] flex-col items-center justify-center px-6 pb-[42vh] pt-28 text-center">
        {/*
          Set like a masthead: very large, tight leading, slightly negative
          tracking. Line two carries the cool-to-warm accent gradient, which
          is where the emphasis lives — the weight stays even across both
          lines so the colour is doing the work on its own.
        */}
        <h1
          className="max-w-4xl text-balance text-5xl font-medium leading-[1.02] tracking-[-0.035em] sm:text-6xl lg:text-[5.25rem]"
          style={{
            color: "var(--ink-primary)",
            fontFamily: "var(--font-grotesk-display)",
          }}
        >
          What if Earth
          <br />
          <span
            style={{
              background:
                "linear-gradient(100deg, var(--accent), var(--accent-warm))",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            could answer back?
          </span>
        </h1>

        <p
          className="mt-6 max-w-xl text-pretty text-sm leading-relaxed sm:text-base"
          style={{
            color: "var(--ink-muted)",
            fontFamily: "var(--font-grotesk-display)",
          }}
        >
          Ask questions about satellite imagery in plain language. SatQuery AI analyzes scenes,
          compares changes, and returns evidence you can review.
        </p>

        <SceneHUD />
      </section>

      <ThemeControls />
    </div>

    </>
  );
}
