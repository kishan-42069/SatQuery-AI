"use client";

/**
 * Masthead for the analysis screens.
 *
 * The comp showed a cluster of icons on the right (search, bell, settings,
 * account). Three of those have no backend behind them yet, and shipping
 * dead controls into a demo is worse than shipping fewer, so the cluster is
 * the two things that are real: a live API health indicator and the theme
 * toggle the hero already owns. The rest go back in when auth and
 * notifications exist.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { checkHealth } from "@/lib/api/endpoints";
import { useAppearanceStore } from "@/hooks/useAppearanceStore";
import { useTravelNavigation } from "@/hooks/useHeroTransition";
import ModelDemoModal from "./ModelDemoModal";
import { cx } from "./primitives";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/analyze", label: "Analyze" },
  { href: "/compare", label: "Compare" },
  { href: "/datasets", label: "Datasets" },
  { href: "/reports", label: "Reports" },
] as const;

type Health = "checking" | "online" | "degraded" | "offline";

export default function TopNav() {
  const pathname = usePathname();
  const navigateWithTravel = useTravelNavigation();
  const [showModelDemo, setShowModelDemo] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[var(--rule-hairline)] bg-[var(--surface)] backdrop-blur-md">
        {/* The thin terracotta rule from the comp — a masthead marker, so it
            spans the full width above everything else. */}
        <div className="h-[3px] w-full bg-[var(--brand-rule)]" />

        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-8 px-6">
          {/* Wordmark only. The icon and the strapline under it were both
              decoration — the masthead already says where you are, and the
              nav beside it is what people actually use. */}
          <Link href="/" className="flex shrink-0 items-center">
            <span className="text-[13px] font-bold uppercase tracking-[0.1em] text-[var(--ink-primary)]">
              SatQuery AI
            </span>
          </Link>

          <nav className="flex flex-1 items-center justify-center gap-2">
            {NAV.map((item) => {
              // "/" must match exactly or it lights up on every route.
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={(event) => {
                    // Modified clicks stay ordinary link clicks, so
                    // ⌘-click and middle-click still open a new tab.
                    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                    // Clicking the tab you're already on should do nothing
                    // rather than replay the animation on the same page.
                    if (isActive) {
                      event.preventDefault();
                      return;
                    }
                    event.preventDefault();
                    navigateWithTravel(
                      item.href,
                      // Home is the full flight — the globe flies back in on
                      // the other side and the sky should match it. Moving
                      // between analysis screens gets a lighter push.
                      item.href === "/" ? "full" : "short",
                    );
                  }}
                  aria-current={isActive ? "page" : undefined}
                  className={cx(
                    "relative px-4 py-5 text-sm font-medium transition-colors",
                    isActive
                      ? "text-[var(--ink-primary)]"
                      : "text-[var(--ink-muted)] hover:text-[var(--ink-primary)]",
                  )}
                >
                  {item.label}
                  {isActive ? (
                    <span className="absolute inset-x-4 bottom-4 block h-[2px] rounded-full bg-[var(--brand-rule)]" />
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setShowModelDemo(true)}
              title="Interactive demonstration of change detection"
              className="flex items-center gap-1.5 rounded-lg bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-400 hover:bg-cyan-500/20 transition-all active:scale-95"
            >
              <span>Demo</span>
            </button>
            <ApiStatus />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <ModelDemoModal
        isOpen={showModelDemo}
        onClose={() => setShowModelDemo(false)}
      />
    </>
  );
}

/**
 * Polls `/health`, which reports DB and Redis separately. "Degraded" is a
 * distinct state because Redis being down doesn't stop the API answering —
 * it stops queries ever leaving the queue, which otherwise looks like the
 * frontend hanging.
 */
function ApiStatus() {
  const [health, setHealth] = useState<Health>("checking");
  const [detail, setDetail] = useState<string>("Checking API…");

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;

    const probe = async () => {
      try {
        const result = await checkHealth(controller.signal);
        const ok = result.db && result.redis;
        setHealth(ok ? "online" : "degraded");
        setDetail(
          ok
            ? `API online · v${result.version} · ${result.env}`
            : `API up, but ${[!result.db && "Postgres", !result.redis && "Redis"]
                .filter(Boolean)
                .join(" and ")} unreachable`,
        );
      } catch {
        if (controller.signal.aborted) return;
        setHealth("offline");
        setDetail("API unreachable — start the FastAPI server");
      }
      if (!controller.signal.aborted) timer = setTimeout(probe, 30_000);
    };

    void probe();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  const dot: Record<Health, string> = {
    checking: "bg-[var(--ink-faint)]",
    online: "bg-[var(--state-ok)]",
    degraded: "bg-[var(--state-warn)]",
    offline: "bg-[var(--state-error)]",
  };

  return (
    <span
      title={detail}
      className="flex items-center gap-2 rounded-md border border-[var(--rule-hairline)] px-2.5 py-1.5"
    >
      <span className={cx("h-2 w-2 rounded-full", dot[health])} />
      <span className="text-[11px] font-medium capitalize text-[var(--ink-muted)]">
        {health === "checking" ? "…" : health}
      </span>
    </span>
  );
}

function ThemeToggle() {
  const mode = useAppearanceStore((s) => s.mode);
  const toggle = useAppearanceStore((s) => s.toggleMode);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${mode === "dark" ? "light" : "dark"} mode`}
      className="grid h-9 w-9 place-items-center rounded-md border border-[var(--rule-hairline)] text-[var(--ink-muted)] transition-colors hover:text-[var(--ink-primary)]"
    >
      {mode === "dark" ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
          <path
            d="M20 14.5A8 8 0 0 1 9.5 4a8.001 8.001 0 1 0 10.5 10.5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
