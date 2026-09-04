"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { palette } from "@/lib/theme";
import { useSceneStore } from "@/hooks/useSceneStore";

type PanelKind = "answer" | "evidence" | "trace";

interface PanelDef {
  id: string;
  kind: PanelKind;
  /** Offset in CAMERA space: [right, up, forward(-z)]. */
  anchor: [number, number, number];
  driftSpeed: number;
  driftAmount: number;
  widthPx: number;
}

/**
 * Panels are anchored in CAMERA space, not world space. The camera slowly
 * orbits the globe, so world-anchored panels would drift across the
 * headline column; camera-anchored ones hold their screen position while
 * the Earth turns behind them, and still get real perspective + parallax.
 */
/**
 * All panels live in the LEFT half of the frame, clear of the headline
 * column on the right. Keep them there when adding more.
 */
export const ANSWER_ANCHOR: [number, number, number] = [-1.45, 0.55, -3.6];

const PANELS: PanelDef[] = [
  {
    id: "answer",
    kind: "answer",
    anchor: ANSWER_ANCHOR,
    driftSpeed: 0.35,
    driftAmount: 0.022,
    widthPx: 190,
  },
  {
    id: "evidence-a",
    kind: "evidence",
    anchor: [-1.6, -0.75, -3.9],
    driftSpeed: 0.47,
    driftAmount: 0.028,
    widthPx: 112,
  },
  {
    id: "trace",
    kind: "trace",
    anchor: [-0.8, 1.15, -4.3],
    driftSpeed: 0.29,
    driftAmount: 0.025,
    widthPx: 138,
  },
];

function PanelChrome({
  children,
  widthPx,
  emphasised,
}: {
  children: React.ReactNode;
  widthPx: number;
  emphasised: boolean;
}) {
  return (
    <div
      className="select-none rounded-lg border backdrop-blur-md transition-all duration-500"
      style={{
        width: widthPx,
        background: emphasised
          ? "rgba(8, 16, 28, 0.92)"
          : "rgba(6, 12, 22, 0.82)",
        borderColor: emphasised
          ? "rgba(61, 219, 224, 0.65)"
          : "rgba(61, 219, 224, 0.32)",
        boxShadow: emphasised
          ? "0 8px 32px rgba(12,28,38,0.28), 0 0 28px rgba(61,219,224,0.16), inset 0 1px 0 rgba(255,255,255,0.06)"
          : "0 6px 22px rgba(12,28,38,0.22), inset 0 1px 0 rgba(255,255,255,0.04)",
        transform: `scale(${emphasised ? 1.06 : 1})`,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Change-intensity readout — a small, literal chart rather than a generic
 * decorative one: it visualises the PRD's bi-temporal change-detection
 * workflow (built-up area signal growing across the two acquisitions plus
 * a mid-point), the same story the "Grounded answer" text is telling.
 */
const CHANGE_SERIES = [
  { label: "22", value: 0.22 },
  { label: "24", value: 0.46 },
  { label: "26", value: 0.88 },
] as const;

function ChangeGraph({ emphasised }: { emphasised: boolean }) {
  return (
    <div className="pt-0.5">
      <div
        className="mb-1 font-mono text-[7px] uppercase tracking-[0.16em]"
        style={{ color: palette.textMuted }}
      >
        Change signal · built-up
      </div>
      <div className="flex h-7 items-end gap-1.5">
        {CHANGE_SERIES.map((pt, i) => (
          <div key={pt.label} className="flex flex-1 flex-col items-center gap-1">
            <div className="relative flex h-6 w-full items-end overflow-hidden rounded-[2px] bg-white/10">
              <div
                className="w-full rounded-[2px] transition-all duration-700"
                style={{
                  height: emphasised ? `${pt.value * 100}%` : "6%",
                  transitionDelay: `${i * 90}ms`,
                  background:
                    i === CHANGE_SERIES.length - 1
                      ? palette.amber
                      : palette.cyanSoft,
                  opacity: i === CHANGE_SERIES.length - 1 ? 1 : 0.75,
                }}
              />
            </div>
            <span className="font-mono text-[6.5px]" style={{ color: palette.textMuted }}>
              {pt.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnswerPanel({ emphasised, widthPx }: { emphasised: boolean; widthPx: number }) {
  const lastQuery = useSceneStore((s) => s.lastQuery);

  return (
    <PanelChrome widthPx={widthPx} emphasised={emphasised}>
      <div className="border-b px-3 py-2" style={{ borderColor: "rgba(61,219,224,0.16)" }}>
        <div
          className="font-mono text-[8px] uppercase tracking-[0.18em]"
          style={{ color: palette.cyan }}
        >
          Grounded answer
        </div>
      </div>
      <div className="space-y-2.5 px-3 py-2.5">
        <p className="text-[10px] leading-relaxed" style={{ color: palette.textPrimary }}>
          {lastQuery
            ? "Built-up area expanded along the north-east corridor between the two acquisitions."
            : "Ask a question to ground an answer in the imagery."}
        </p>
        <div className="flex items-center gap-1.5">
          <div className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: emphasised ? "88%" : "0%",
                background: palette.amber,
              }}
            />
          </div>
          <span className="font-mono text-[8px]" style={{ color: palette.amberSoft }}>
            0.88
          </span>
        </div>
        <ChangeGraph emphasised={emphasised} />
      </div>
    </PanelChrome>
  );
}

/**
 * Before/after evidence chips — a small procedural GIS tile (grid +
 * terrain-toned gradient) matching the scan patch's own visual language,
 * rather than a photograph standing in for evidence it doesn't actually
 * depict. The amber box on 2026 stands in for the grounding output — the
 * region the change model flagged.
 */
function EvidenceThumb({ year, changed }: { year: string; changed: boolean }) {
  return (
    <div className="space-y-1">
      <div
        className="relative aspect-square w-full overflow-hidden rounded-sm"
        style={{
          boxShadow: "inset 0 0 0 1px rgba(61,219,224,0.28)",
          background: changed
            ? "linear-gradient(150deg,#233a2f,#4d6a4a 55%,#8a8256)"
            : "linear-gradient(150deg,#1c2e2a,#33473c 55%,#5c6a4c)",
        }}
      >
        {/* faint GIS tiling grid, echoing the scan-patch texture */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(61,219,224,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(61,219,224,0.22) 1px, transparent 1px)",
            backgroundSize: "25% 25%",
            opacity: changed ? 0.55 : 0.3,
          }}
        />
        {changed && (
          <div
            className="absolute rounded-[1px]"
            style={{
              left: "30%",
              top: "36%",
              width: "44%",
              height: "40%",
              border: `1px solid ${palette.amber}`,
              boxShadow: "0 0 6px rgba(242,169,80,0.55)",
            }}
          />
        )}
      </div>
      <div className="text-center font-mono text-[7px]" style={{ color: palette.textMuted }}>
        {year}
      </div>
    </div>
  );
}

function EvidencePanel({ emphasised, widthPx }: { emphasised: boolean; widthPx: number }) {
  return (
    <PanelChrome widthPx={widthPx} emphasised={emphasised}>
      <div className="px-2.5 py-2">
        <div
          className="mb-1.5 font-mono text-[8px] uppercase tracking-[0.18em]"
          style={{ color: palette.cyan }}
        >
          Evidence
        </div>
        <div className="grid grid-cols-2 gap-1">
          <EvidenceThumb year="2022" changed={false} />
          <EvidenceThumb year="2026" changed={emphasised} />
        </div>
      </div>
    </PanelChrome>
  );
}

const TRACE_STEPS = ["planner", "grounding", "change", "evidence"];

function TracePanel({ emphasised, widthPx }: { emphasised: boolean; widthPx: number }) {
  return (
    <PanelChrome widthPx={widthPx} emphasised={emphasised}>
      <div className="px-2.5 py-2">
        <div
          className="mb-1.5 font-mono text-[8px] uppercase tracking-[0.18em]"
          style={{ color: palette.cyan }}
        >
          Agent trace
        </div>
        <div className="space-y-1">
          {TRACE_STEPS.map((step, i) => (
            <div key={step} className="flex items-center gap-1.5">
              <span
                className="h-1 w-1 rounded-full transition-all duration-500"
                style={{
                  background: emphasised ? palette.cyan : "rgba(159,180,194,0.4)",
                  transitionDelay: `${i * 120}ms`,
                }}
              />
              <span
                className="font-mono text-[8px] transition-colors duration-500"
                style={{
                  color: emphasised ? palette.textPrimary : palette.textMuted,
                  transitionDelay: `${i * 120}ms`,
                }}
              >
                {step}
              </span>
            </div>
          ))}
        </div>
      </div>
    </PanelChrome>
  );
}

function FloatingPanel({ def }: { def: PanelDef }) {
  const groupRef = useRef<THREE.Group>(null);
  const state = useSceneStore((s) => s.state);
  const emphasised = state === "query-active";
  const { camera } = useThree();

  const offset = useMemo(() => new THREE.Vector3(), []);

  useFrame((clock) => {
    if (!groupRef.current) return;
    const t = clock.clock.elapsedTime;
    const [ax, ay, az] = def.anchor;

    // Camera-space offset -> world, so the panel keeps its screen position.
    offset.set(
      ax + Math.sin(t * def.driftSpeed) * def.driftAmount,
      ay + Math.cos(t * def.driftSpeed * 0.8) * def.driftAmount,
      az + Math.sin(t * def.driftSpeed * 0.6) * def.driftAmount * 0.5
    );
    offset.applyMatrix4(camera.matrixWorld);
    groupRef.current.position.copy(offset);
    // Face the camera squarely so text never renders skewed.
    groupRef.current.quaternion.copy(camera.quaternion);
  });

  return (
    <group ref={groupRef}>
      <Html
        transform
        distanceFactor={1.35}
        style={{ pointerEvents: "none" }}
        zIndexRange={[5, 1]}
      >
        {def.kind === "answer" && (
          <AnswerPanel emphasised={emphasised} widthPx={def.widthPx} />
        )}
        {def.kind === "evidence" && (
          <EvidencePanel emphasised={emphasised} widthPx={def.widthPx} />
        )}
        {def.kind === "trace" && (
          <TracePanel emphasised={emphasised} widthPx={def.widthPx} />
        )}
      </Html>
    </group>
  );
}

export default function EvidencePanels() {
  return (
    <>
      {PANELS.map((def) => (
        <FloatingPanel key={def.id} def={def} />
      ))}
    </>
  );
}
