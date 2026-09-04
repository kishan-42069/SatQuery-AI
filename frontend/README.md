# SatQuery AI — 3D Hero / Landing Page

Frontend for **SIH 2026 · SIH26167 · Interactive Vision-Language Assistant for
Multimodal Remote Sensing Image Analysis through Text Queries**.

This is the landing/hero surface: a real-time WebGL scene (Three.js via React
Three Fiber) that visualises the product's actual pipeline — a satellite scans
a surface patch, a grounding pass drops confidence-labelled bounding boxes, and
evidence travels up an arc into an answer panel.

No Spline, no external 3D asset files, no texture downloads. Everything is
procedural or code-generated, so the whole scene is version-controlled,
diffable, and editable by the team.

---

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
```

Build check:

```bash
npm run build
```

Requires Node 18+ (developed on Node 22).

---

## File structure

```
src/
├── app/
│   ├── layout.tsx           # Root layout, metadata
│   ├── page.tsx             # Hero page: Canvas (client-only) + DOM overlay
│   └── globals.css          # Tailwind v4 + design tokens + font stacks
│
├── components/
│   ├── scene/               # Everything inside the WebGL canvas
│   │   ├── HeroScene.tsx    # <Canvas>, lights, postprocessing. ENTRY POINT.
│   │   ├── CameraRig.tsx    # Idle orbit + pointer parallax (not OrbitControls)
│   │   ├── Earth.tsx        # Procedural globe + atmosphere shell
│   │   ├── Satellite.tsx    # Satellite mesh, orbit path, scan frustum
│   │   ├── ScanPatch.tsx    # Surface tile + detection boxes + confidence labels
│   │   ├── DataTrace.tsx    # Evidence arc from surface → answer panel
│   │   ├── EvidencePanels.tsx # Floating glass panels (answer/evidence/trace)
│   │   └── Starfield.tsx    # Clustered, non-uniform star background
│   │
│   └── ui/                  # Plain DOM, sits above the canvas
│       ├── HeroOverlay.tsx  # Header, headline, capability chips, footer
│       └── QueryDemo.tsx    # Demo query input + agent pipeline readout
│
├── hooks/
│   └── useSceneStore.ts     # Zustand store — single source of scene state
│
└── lib/
    ├── theme.ts             # Palette + timing constants (edit colours HERE)
    └── shaders/
        ├── noise.glsl.ts    # Shared hash/value-noise/fbm
        ├── earth.ts         # Earth vertex + fragment shader
        └── atmosphere.ts    # Fresnel limb glow
```

---

## How the scene reacts to state

All reactive visuals read from one store: `src/hooks/useSceneStore.ts`.

| State | Trigger | Visual response |
|---|---|---|
| `idle` | default | Slow orbit, 2 detection boxes, dim beam |
| `query-active` | `runQueryDemo(q)` | Beam brightens, 4 boxes, panels scale + highlight, trace arc pulses faster |
| `hover-satellite` | pointer over satellite | Satellite emissive boost |

To trigger the active state from anywhere:

```ts
import { useSceneStore } from "@/hooks/useSceneStore";

const runQueryDemo = useSceneStore((s) => s.runQueryDemo);
runQueryDemo("What changed between 2022 and 2026?");
```

Right now `runQueryDemo` reverts to idle on a timer
(`timing.queryActiveDurationMs` in `lib/theme.ts`). **This is the seam for
backend integration** — replace the timer with the real request lifecycle:
set `query-active` on submit, revert when the response resolves, and feed the
real findings into `ScanPatch`'s `DETECTIONS` array and `EvidencePanels`.

---

## Where mock data lives (for the backend integration)

Everything the backend will eventually supply is currently a local constant,
deliberately shaped to match the PRD's **AI → Backend contract**
(`analysis_type, findings, confidence, regions, evidence_refs, model_used, trace_id`):

| Mock | File | Maps to |
|---|---|---|
| `DETECTIONS` | `scene/ScanPatch.tsx` | `findings[]` / `regions[]` + confidence |
| `TRACE_STEPS` | `scene/EvidencePanels.tsx` | agent trace / `model_used` |
| answer text | `scene/EvidencePanels.tsx` → `AnswerPanel` | grounded response |
| `PIPELINE_STEPS` | `ui/QueryDemo.tsx` | orchestrator step summary |
| `SAMPLE_QUERIES` | `ui/QueryDemo.tsx` | demo prompts |

None of these call an API. Swapping them for real data requires no changes to
the 3D code.

---

## Design decisions worth keeping

- **Camera-space panels.** The floating panels are anchored in *camera* space,
  not world space (`EvidencePanels.tsx`). The camera slowly orbits; world-anchored
  panels would drift across the headline. Keep new panels in the left half.
- **No OrbitControls.** The globe is a backdrop, not a toy. Pointer input only
  tilts within ±6° (`timing.parallaxMaxDeg`).
- **Procedural everything.** No `.glb`, no texture files — nothing to lose,
  nothing to license, no load spinner beyond first paint.
- **One palette source.** `lib/theme.ts` drives both the shaders and the DOM.
  Change the accent colour once and the whole page follows.
- **Reduced-motion support.** `globals.css` respects `prefers-reduced-motion`
  for DOM transitions.

---

## Fonts

Uses system font stacks (defined in `globals.css`) so the build never depends on
a font CDN. To use Geist instead:

```bash
npm i geist
```

…then swap `--font-geist-sans` / `--font-geist-mono` in `globals.css`, or
re-add `next/font/google` in `layout.tsx`.

---

## Performance notes

- `dpr={[1, 2]}` caps device pixel ratio — important on 4K laptops during demos.
- Bloom is tuned low (`intensity 0.32`, `threshold 0.62`). Raising it washes the
  scene out fast.
- Earth is a 96×96 sphere; the shader is the cost, not the geometry.
- If a demo machine has weak GPU, first lever is dropping `<EffectComposer>`
  in `HeroScene.tsx` — the scene still reads correctly without it.

---

## Next surfaces to build

Per the PRD's UX section: Dashboard, Image Workspace, Query Interface,
Analysis Result, Compare Mode, Evidence Panel, Agent Activity, Export.
The `lib/theme.ts` tokens and the glass-panel treatment in `EvidencePanels.tsx`
are intended to carry across all of them.
