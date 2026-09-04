"use client";


/**
 * Instrument-frame chrome along the viewport edges — a distance ruler
 * along the bottom and a resolution scale along the right — echoing the
 * reference "scientific instrument" HUD look (tick marks + labelled
 * axes framing the subject) rather than a chart tucked in a panel.
 * Values are domain-real: the resolution bands are the actual ground
 * sample distances of common EO sensors named in the PRD's dataset
 * strategy (Sentinel-1/2, Landsat-class, MODIS-class).
 */

const DISTANCE_TICKS = [0, 250, 500, 750, 1000, 1250, 1500, 1750, 2000];

const RESOLUTION_BANDS = [
  { label: "10 m", sub: "SENTINEL-2" },
  { label: "30 m", sub: "LANDSAT" },
  { label: "250 m", sub: "MODIS" },
  { label: "1 km", sub: "AVHRR" },
];

function CrosshairTick({ x, y }: { x: string; y: string }) {
  return (
    <div
      className="absolute font-mono text-[11px] leading-none"
      style={{ left: x, top: y, color: "var(--hairline)" }}
    >
      +
    </div>
  );
}

export function BottomScaleBar() {
  return (
    <div className="pointer-events-none absolute bottom-[58px] left-0 right-0 hidden px-6 sm:block sm:px-10 lg:px-0 lg:pl-10 lg:pr-[210px]">
      <div className="relative h-4 w-full max-w-[640px]">
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: "var(--hairline)" }}
        />
        {DISTANCE_TICKS.map((km, i) => (
          <div
            key={km}
            className="absolute top-0 flex flex-col items-center"
            style={{ left: `${(i / (DISTANCE_TICKS.length - 1)) * 100}%` }}
          >
            <div
              className="h-1.5 w-px"
              style={{ background: "var(--hairline-strong)" }}
            />
            <span
              className="mt-0.5 font-mono text-[8px] tabular-nums"
              style={{ color: "var(--ink-faint)" }}
            >
              {km}
            </span>
          </div>
        ))}
        <span
          className="absolute -top-3.5 left-0 font-mono text-[8px] uppercase tracking-[0.16em]"
          style={{ color: "var(--ink-faint)" }}
        >
          Ground distance · km
        </span>
      </div>
    </div>
  );
}

export function RightResolutionScale() {
  return (
    <div className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 sm:block">
      <div className="relative mt-4 flex flex-col items-end gap-6 border-r pr-3" style={{ borderColor: "var(--hairline)" }}>
        {RESOLUTION_BANDS.map((band) => (
          <div key={band.label} className="relative flex items-center gap-2">
            <div className="text-right">
              <div
                className="font-mono text-[10px] font-semibold tabular-nums"
                style={{ color: "var(--ink-muted)" }}
              >
                {band.label}
              </div>
              <div
                className="font-mono text-[7px] uppercase tracking-[0.12em]"
                style={{ color: "var(--ink-faint)" }}
              >
                {band.sub}
              </div>
            </div>
            <div
              className="h-px w-2.5"
              style={{ background: "var(--hairline-strong)" }}
            />
          </div>
        ))}
      </div>
      <span
        className="absolute -top-4 right-0 font-mono text-[8px] uppercase tracking-[0.16em]"
        style={{ color: "var(--ink-faint)" }}
      >
        Sensor resolution
      </span>
    </div>
  );
}

function ExpandIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path
        d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CornerControls() {
  const toggleFullscreen = () => {
    if (typeof document === "undefined") return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  return (
    <div className="pointer-events-auto absolute bottom-[46px] right-4 hidden flex-col gap-2 sm:flex sm:right-6">
      <button
        onClick={toggleFullscreen}
        aria-label="Toggle fullscreen"
        className="grid h-7 w-7 place-items-center rounded-full border transition-colors duration-200 hover:border-cyan-500/50"
        style={{
          borderColor: "var(--control-border)",
          background: "var(--control-bg)",
          color: "var(--ink-muted)",
        }}
      >
        <ExpandIcon />
      </button>
      <div
        className="grid h-7 w-7 place-items-center rounded-full border"
        style={{
          borderColor: "rgba(184,99,26,0.3)",
          background: "var(--control-bg)",
          color: "var(--accent-warm)",
        }}
        title="Agentic analysis"
      >
        <SparkleIcon />
      </div>
    </div>
  );
}

export default function SceneHUD() {
  // The ground-distance ruler and sensor-resolution scale were overlapping
  // the query bar and evidence panel at this layout's breakpoints — removed
  // per feedback. Corner controls and crosshair ticks stay.
  return (
    <>
      <CornerControls />
      <CrosshairTick x="42%" y="14%" />
      <CrosshairTick x="8%" y="62%" />
      <CrosshairTick x="63%" y="86%" />
    </>
  );
}
