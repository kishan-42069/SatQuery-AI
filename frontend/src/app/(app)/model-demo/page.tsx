"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { apiFetch } from "@/lib/api/client";

/* ─── Types ─────────────────────────────────────────────────────── */
interface ModelInfo {
  status: string;
  final_train_loss: number;
  best_eval_loss: number;
  epochs: number;
  total_steps: number;
  train_samples: number;
  dataset: string;
}

interface ChangeItem {
  category: string;
  description: string;
  magnitude: "high" | "medium" | "low";
  affected_classes: string[];
}

interface ChangeDetectionResult {
  status: string;
  summary: string;
  t1_label: string;
  t2_label: string;
  changes: ChangeItem[];
  unchanged_classes: string[];
  change_intensity: "major" | "moderate" | "minor";
  latency_ms: number;
  model_name: string;
}

interface InferenceResult {
  status: string;
  answer: string;
  prompt: string;
  latency_ms: number;
  detected_features: string[];
}

/* ─── Tiles ──────────────────────────────────────────────────────── */
const TILES = [
  {
    id: "bengaluru_optical",
    label: "ISRO Optical 2022",
    sublabel: "Before",
    image: "/demo-tiles/isro_bengaluru_2022.jpg",
    modality: "Optical · ISRO",
    date: "2022",
  },
  {
    id: "urban_expansion",
    label: "ISRO Optical 2026",
    sublabel: "After",
    image: "/demo-tiles/isro_bengaluru_2026.jpg",
    modality: "Optical · ISRO",
    date: "2026",
  },
  {
    id: "agriculture_water",
    label: "Peri-Urban + River",
    sublabel: "BigEarthNet patch",
    image: "/demo-tiles/isro_2022_wide.png",
    modality: "Optical · BigEarthNet",
    date: "Oct 2022",
  },
  {
    id: "sar_scene",
    label: "SAR Backscatter",
    sublabel: "Sentinel-1 C-band",
    image: "/demo-tiles/isro_sar.png",
    modality: "SAR · Sentinel-1",
    date: "Jun 2025",
  },
];

const MAGNITUDE_COLORS: Record<string, string> = {
  high:   "border-red-500/40 bg-red-500/10 text-red-400",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  low:    "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
};

const INTENSITY_BADGE: Record<string, { label: string; cls: string }> = {
  major:    { label: "MAJOR CHANGES", cls: "border-red-500/40 bg-red-500/10 text-red-400" },
  moderate: { label: "MODERATE CHANGES", cls: "border-amber-500/40 bg-amber-500/10 text-amber-400" },
  minor:    { label: "MINOR CHANGES", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" },
};

const VQA_PROMPTS = [
  "What land cover types are visible?",
  "Identify urban infrastructure and roads.",
  "Are there water bodies or drainage channels?",
  "Describe vegetation and agricultural fields.",
];

/* ─── Component ──────────────────────────────────────────────────── */
export default function ModelDemoPage() {
  // Fetched on mount and kept for the API surface; the page no longer
  // renders training telemetry, so nothing reads it today.
  const [, setModelInfo] = useState<ModelInfo | null>(null);

  // Mode: "change" = demo tiles, "upload" = user files, "vqa" = single-image
  const [mode, setMode] = useState<"change" | "upload" | "vqa">("change");

  // Change detection state
  const [t1, setT1] = useState(TILES[0]);
  const [t2, setT2] = useState(TILES[1]);
  const [focus, setFocus] = useState("");
  const [cdResult, setCdResult] = useState<ChangeDetectionResult | null>(null);
  const [cdRunning, setCdRunning] = useState(false);
  const [cdError, setCdError] = useState<string | null>(null);

  // VQA state
  const [vqaTile, setVqaTile] = useState(TILES[0]);
  const [vqaPrompt, setVqaPrompt] = useState(VQA_PROMPTS[0]);
  const [vqaResult, setVqaResult] = useState<InferenceResult | null>(null);
  const [vqaRunning, setVqaRunning] = useState(false);
  const [vqaError, setVqaError] = useState<string | null>(null);

  // Upload mode state
  const [upT1File, setUpT1File] = useState<File | null>(null);
  const [upT2File, setUpT2File] = useState<File | null>(null);
  const [upT1Preview, setUpT1Preview] = useState<string | null>(null);
  const [upT2Preview, setUpT2Preview] = useState<string | null>(null);
  const [upFocus, setUpFocus] = useState("");
  const [upResult, setUpResult] = useState<ChangeDetectionResult | null>(null);
  const [upRunning, setUpRunning] = useState(false);
  const [upError, setUpError] = useState<string | null>(null);
  const [upDragT1, setUpDragT1] = useState(false);
  const [upDragT2, setUpDragT2] = useState(false);
  const t1InputRef = useRef<HTMLInputElement>(null);
  const t2InputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiFetch<ModelInfo>("/model/info").then(setModelInfo).catch(() => {});
  }, []);

  /* ── Change detection ── */
  const runChangeDetect = async () => {
    setCdRunning(true);
    setCdError(null);
    setCdResult(null);
    try {
      const res = await apiFetch<ChangeDetectionResult>("/model/change-detect", {
        method: "POST",
        json: { t1_sample_id: t1.id, t2_sample_id: t2.id, focus: focus || null },
      });
      setCdResult(res);
    } catch (e) {
      setCdError(e instanceof Error ? e.message : "Change detection failed.");
    } finally {
      setCdRunning(false);
    }
  };

  /* ── VQA ── */
  const runVqa = async (customPrompt?: string) => {
    const q = (customPrompt ?? vqaPrompt).trim();
    if (!q) return;
    setVqaPrompt(q);
    setVqaRunning(true);
    setVqaError(null);
    setVqaResult(null);
    try {
      const res = await apiFetch<InferenceResult>("/model/infer", {
        method: "POST",
        json: { prompt: q, sample_id: vqaTile.id, max_tokens: 160 },
      });
      setVqaResult(res);
    } catch (e) {
      setVqaError(e instanceof Error ? e.message : "Inference failed.");
    } finally {
      setVqaRunning(false);
    }
  };

  const swapTiles = () => { const tmp = t1; setT1(t2); setT2(tmp); };

  /* ── Upload helpers ── */
  const acceptFile = useCallback((file: File, slot: "t1" | "t2") => {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const allowed = ["jpg", "jpeg", "png", "tif", "tiff", "webp"];
    if (!allowed.includes(ext)) {
      if (slot === "t1") setUpError(`T1: unsupported format .${ext}. Use JPG, PNG, or GeoTIFF.`);
      else setUpError(`T2: unsupported format .${ext}. Use JPG, PNG, or GeoTIFF.`);
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    if (slot === "t1") { setUpT1File(file); setUpT1Preview(previewUrl); }
    else               { setUpT2File(file); setUpT2Preview(previewUrl); }
    setUpError(null);
    setUpResult(null);
  }, []);

  const runUploadChangeDetect = async () => {
    if (!upT1File || !upT2File) return;
    setUpRunning(true);
    setUpError(null);
    setUpResult(null);
    try {
      const form = new FormData();
      form.append("t1_image", upT1File);
      form.append("t2_image", upT2File);
      if (upFocus.trim()) form.append("focus", upFocus.trim());

      // Use raw fetch for multipart — apiFetch's json helper won't work here
      const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
      const resp = await fetch(`${baseUrl}/api/v1/model/change-detect-upload`, {
        method: "POST",
        body: form,
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(err.detail ?? "Upload failed.");
      }
      const data: ChangeDetectionResult = await resp.json();
      setUpResult(data);
    } catch (e) {
      setUpError(e instanceof Error ? e.message : "Upload change detection failed.");
    } finally {
      setUpRunning(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--background)", color: "var(--ink-primary)" }}>

      {/* ── Top Nav ── */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between px-6 py-3 border-b"
        style={{ borderColor: "var(--rule-hairline)", background: "color-mix(in srgb, var(--surface) 92%, transparent)", backdropFilter: "blur(12px)" }}
      >
        <div className="flex items-center gap-3">
          <Link href="/" className="font-mono text-xs tracking-[0.22em]" style={{ color: "var(--ink-muted)" }}>
            SATQUERY<span style={{ color: "var(--accent)" }}>·AI</span>
          </Link>
          <span style={{ color: "var(--rule-hairline)" }}>/</span>
          <span className="text-sm font-medium">Model Demo</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/analyze"
            className="rounded-lg px-4 py-1.5 text-xs font-medium transition-all hover:brightness-110"
            style={{ background: "linear-gradient(120deg, var(--accent), color-mix(in srgb, var(--accent) 55%, var(--accent-warm)))", color: "var(--background)" }}
          >
            Open Workspace →
          </Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <div
        className="px-6 py-7 border-b"
        style={{ borderColor: "var(--rule-hairline)", background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 5%, var(--surface)), var(--surface))" }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "var(--font-grotesk-display)" }}>
                Satellite Image{" "}
                <span style={{ background: "linear-gradient(100deg, var(--accent), var(--accent-warm))", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
                  Change Detection
                </span>
              </h1>
              <p className="mt-1 text-sm max-w-2xl" style={{ color: "var(--ink-muted)" }}>
                Compare satellite images captured at different points in time to identify meaningful changes in the same geographic area.
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* ── Mode Tabs ── */}
      <div className="border-b" style={{ borderColor: "var(--rule-hairline)" }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-0">
            {([
              { id: "change", label: "Demo: Change Detection" },
              { id: "upload", label: "Upload Your Images" },
              { id: "vqa",    label: "Single Image" },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setMode(tab.id)}
                className="px-5 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2"
                style={{
                  borderColor: mode === tab.id ? "var(--accent)" : "transparent",
                  color: mode === tab.id ? "var(--ink-primary)" : "var(--ink-muted)",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>


      <div className="flex-1 max-w-7xl mx-auto w-full px-6 py-6">

        {/* ════════════════════════════════════════════════════════
            MODE A: Bi-Temporal Change Detection
        ════════════════════════════════════════════════════════ */}
        {mode === "change" && (
          <div className="space-y-6">

            {/* Two image panels side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* T1 — Before */}
              <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--rule-hairline)" }}>
                <div
                  className="flex items-center justify-between px-4 py-2.5"
                  style={{ background: "var(--surface-sunken)", borderBottom: "1px solid var(--rule-hairline)" }}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-semibold text-blue-400">Before</span>
                    <span className="text-xs font-medium" style={{ color: "var(--ink-primary)" }}>{t1.label}</span>
                  </div>
                  <span className="font-mono text-[10px]" style={{ color: "var(--ink-faint)" }}>{t1.modality} · {t1.date}</span>
                </div>
                {/* Tile selector */}
                <div className="p-3 grid grid-cols-4 gap-1.5" style={{ background: "var(--surface)" }}>
                  {TILES.map((tile) => (
                    <button
                      key={tile.id}
                      onClick={() => setT1(tile)}
                      className="relative rounded-lg overflow-hidden border-2 transition-all"
                      style={{
                        borderColor: t1.id === tile.id ? "rgb(59 130 246)" : "var(--rule-hairline)",
                        boxShadow: t1.id === tile.id ? "0 0 0 2px rgba(59,130,246,0.3)" : "none",
                      }}
                    >
                      <div className="relative aspect-square">
                        <Image src={tile.image} alt={tile.label} fill className="object-cover" sizes="80px" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-1">
                          <div className="text-[8px] font-semibold text-white leading-tight truncate">{tile.date}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                {/* Main image */}
                <div className="relative aspect-[4/3] w-full">
                  <Image src={t1.image} alt={t1.label} fill className="object-cover" sizes="600px" />
                  <div className="absolute top-2 left-2 font-mono text-[11px] font-bold text-white" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}>
                    {t1.date}
                  </div>
                </div>
              </div>

              {/* T2 — After */}
              <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--rule-hairline)" }}>
                <div
                  className="flex items-center justify-between px-4 py-2.5"
                  style={{ background: "var(--surface-sunken)", borderBottom: "1px solid var(--rule-hairline)" }}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-semibold text-orange-400">After</span>
                    <span className="text-xs font-medium" style={{ color: "var(--ink-primary)" }}>{t2.label}</span>
                  </div>
                  <span className="font-mono text-[10px]" style={{ color: "var(--ink-faint)" }}>{t2.modality} · {t2.date}</span>
                </div>
                {/* Tile selector */}
                <div className="p-3 grid grid-cols-4 gap-1.5" style={{ background: "var(--surface)" }}>
                  {TILES.map((tile) => (
                    <button
                      key={tile.id}
                      onClick={() => setT2(tile)}
                      className="relative rounded-lg overflow-hidden border-2 transition-all"
                      style={{
                        borderColor: t2.id === tile.id ? "rgb(249 115 22)" : "var(--rule-hairline)",
                        boxShadow: t2.id === tile.id ? "0 0 0 2px rgba(249,115,22,0.3)" : "none",
                      }}
                    >
                      <div className="relative aspect-square">
                        <Image src={tile.image} alt={tile.label} fill className="object-cover" sizes="80px" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-1">
                          <div className="text-[8px] font-semibold text-white leading-tight truncate">{tile.date}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                {/* Main image */}
                <div className="relative aspect-[4/3] w-full">
                  <Image src={t2.image} alt={t2.label} fill className="object-cover" sizes="600px" />
                  <div className="absolute top-2 left-2 font-mono text-[11px] font-bold text-white" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}>
                    {t2.date}
                  </div>
                </div>
              </div>
            </div>

            {/* Controls row */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <button
                onClick={swapTiles}
                className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-colors hover:border-[var(--ink-muted)]"
                style={{ borderColor: "var(--rule-hairline)", background: "var(--surface-sunken)", color: "var(--ink-muted)" }}
              >
                ⇄ Swap T1 / T2
              </button>

              <input
                type="text"
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                placeholder="Optional focus (e.g. urban, water, vegetation, roads)…"
                className="flex-1 rounded-xl border px-4 py-2.5 text-sm focus:outline-none transition-colors"
                style={{ borderColor: "var(--rule-hairline)", background: "var(--surface-sunken)", color: "var(--ink-primary)" }}
              />

              <button
                onClick={runChangeDetect}
                disabled={cdRunning || t1.id === t2.id}
                className="flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                style={{ background: "linear-gradient(120deg, var(--accent), color-mix(in srgb, var(--accent) 55%, var(--accent-warm)))", color: "var(--background)" }}
              >
                {cdRunning ? (
                  <><span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" /> Analysing…</>
                ) : (
                  <><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none"><path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg> Detect Changes</>
                )}
              </button>
            </div>

            {t1.id === t2.id && (
              <p className="text-xs text-amber-400 font-mono">⚠ Select different images for T1 and T2 to detect changes.</p>
            )}

            {/* Change Detection Output */}
            {(cdResult || cdRunning || cdError) && (
              <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--rule-hairline)", background: "var(--surface)" }}>
                {/* Output header */}
                <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "var(--rule-hairline)", background: "var(--surface-sunken)" }}>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-wider">Change Analysis</span>
                    {cdResult && (
                      <>
                        <span className={`rounded border px-2 py-0.5 font-mono text-[10px] font-semibold ${INTENSITY_BADGE[cdResult.change_intensity]?.cls ?? ""}`}>
                          {INTENSITY_BADGE[cdResult.change_intensity]?.label}
                        </span>
                        <span className="rounded bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
                          {cdResult.latency_ms.toFixed(0)} ms
                        </span>
                      </>
                    )}
                  </div>
                  <span className="font-mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
                    {t1.label} → {t2.label}
                  </span>
                </div>

                <div className="p-5">
                  {cdError && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{cdError}</div>
                  )}

                  {cdRunning && (
                    <div className="flex flex-col items-center justify-center py-14 gap-4">
                      <div className="relative h-16 w-16">
                        <div className="absolute inset-0 rounded-full border-2 animate-spin" style={{ borderColor: "var(--accent) transparent transparent transparent" }} />
                        <div className="absolute inset-2 rounded-full border-2 animate-spin" style={{ borderColor: "color-mix(in srgb, var(--accent) 50%, transparent) transparent transparent transparent", animationDirection: "reverse", animationDuration: "0.8s" }} />
                        <div className="absolute inset-0 flex items-center justify-center text-lg"></div>
                      </div>
                      <div className="text-center">
                        <p className="font-mono text-xs" style={{ color: "var(--ink-muted)" }}>
                          Comparing T1 ({t1.label}) vs T2 ({t2.label})…
                        </p>
                        <p className="font-mono text-[10px] mt-1" style={{ color: "var(--ink-faint)" }}>
                          Sending both images to fine-tuned VLM for bi-temporal analysis
                        </p>
                      </div>
                    </div>
                  )}

                  {!cdRunning && cdResult && (
                    <div className="space-y-5">
                      {/* Summary */}
                      <div className="rounded-xl border p-4" style={{ borderColor: "var(--rule-hairline)", background: "var(--surface-sunken)" }}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
                          <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: "var(--ink-muted)" }}>Executive Summary</span>
                        </div>
                        <p className="text-sm leading-relaxed" style={{ color: "var(--ink-primary)" }}>{cdResult.summary}</p>
                      </div>

                      {/* Change items */}
                      {cdResult.changes.length > 0 && (
                        <div>
                          <h3 className="font-mono text-[10px] uppercase tracking-wider mb-3" style={{ color: "var(--ink-muted)" }}>
                            Detected Changes ({cdResult.changes.length})
                          </h3>
                          <div className="space-y-3">
                            {cdResult.changes.map((ch, i) => (
                              <div key={i} className="rounded-xl border p-4" style={{ borderColor: "var(--rule-hairline)", background: "var(--surface-sunken)" }}>
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm font-semibold" style={{ color: "var(--ink-primary)" }}>{ch.category}</span>
                                  <span className={`rounded border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase ${MAGNITUDE_COLORS[ch.magnitude] ?? ""}`}>
                                    {ch.magnitude} impact
                                  </span>
                                </div>
                                <p className="text-xs leading-relaxed mb-2" style={{ color: "var(--ink-muted)" }}>{ch.description}</p>
                                {ch.affected_classes.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {ch.affected_classes.map((cls, j) => (
                                      <span key={j} className="rounded border px-2 py-0.5 text-[10px]" style={{ borderColor: "var(--rule-hairline)", background: "var(--surface)", color: "var(--ink-muted)" }}>
                                        {cls}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Stable classes */}
                      {cdResult.unchanged_classes.length > 0 && (
                        <div>
                          <span className="font-mono text-[10px] uppercase tracking-wider block mb-2" style={{ color: "var(--ink-muted)" }}>Stable / Unchanged Land Cover</span>
                          <div className="flex flex-wrap gap-1.5">
                            {cdResult.unchanged_classes.map((cls, i) => (
                              <span key={i} className="rounded-lg border px-3 py-1 text-[11px]" style={{ borderColor: "color-mix(in srgb, var(--accent) 25%, var(--rule-hairline))", background: "color-mix(in srgb, var(--accent) 6%, var(--surface-sunken))", color: "var(--ink-muted)" }}>
                                ✓ {cls}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Footer */}
                      <div className="flex flex-wrap gap-x-6 gap-y-1 pt-3 border-t font-mono text-[10px]" style={{ borderColor: "var(--rule-hairline)", color: "var(--ink-faint)" }}>
                        <span>Model: {cdResult.model_name}</span>
                        <span>T1: {cdResult.t1_label} → T2: {cdResult.t2_label}</span>
                        <span>Latency: {cdResult.latency_ms.toFixed(0)} ms</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!cdResult && !cdRunning && !cdError && (
              <div className="rounded-2xl border flex flex-col items-center justify-center py-16 gap-4 text-center" style={{ borderColor: "var(--rule-hairline)", borderStyle: "dashed", background: "var(--surface-sunken)" }}>
                <div className="text-4xl"></div>
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--ink-primary)" }}>Ready for Change Detection</p>
                  <p className="mt-1 text-xs max-w-sm" style={{ color: "var(--ink-faint)" }}>
                    Select a <span className="text-blue-400">Before</span> and <span className="text-orange-400">After</span> image above, then click <strong>Detect Changes</strong>. The model will compare both images and identify what changed.
                  </p>
                </div>
                <p className="font-mono text-[10px] px-4 py-2 rounded-lg border" style={{ borderColor: "var(--rule-hairline)", color: "var(--ink-faint)", background: "var(--surface)" }}>
                  Try: T1 = ISRO 2022 vs T2 = ISRO 2026 — real urban expansion is visible!
                </p>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            MODE: Upload Your Images
        ════════════════════════════════════════════════════════ */}
        {mode === "upload" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* T1 Upload */}
              <div
                className={`rounded-2xl border-2 border-dashed p-6 flex flex-col items-center justify-center transition-colors ${upDragT1 ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_5%,var(--surface-sunken))]" : "border-[var(--rule-hairline)] bg-[var(--surface-sunken)]"} relative`}
                onDragOver={(e) => { e.preventDefault(); setUpDragT1(true); }}
                onDragLeave={(e) => { e.preventDefault(); setUpDragT1(false); }}
                onDrop={(e) => {
                  e.preventDefault();
                  setUpDragT1(false);
                  if (e.dataTransfer.files?.[0]) acceptFile(e.dataTransfer.files[0], "t1");
                }}
                style={{ minHeight: "240px" }}
              >
                <input type="file" className="hidden" ref={t1InputRef} onChange={(e) => { if (e.target.files?.[0]) acceptFile(e.target.files[0], "t1"); e.target.value = ''; }} accept=".jpg,.jpeg,.png,.tif,.tiff,.webp" />
                
                {upT1Preview ? (
                  <div className="w-full h-full flex flex-col items-center gap-3">
                    <div className="relative aspect-[4/3] w-full rounded-lg overflow-hidden border border-[var(--rule-hairline)]">
                      <Image src={upT1Preview} alt="T1 Preview" fill className="object-cover" />
                      <div className="absolute top-2 left-2 font-mono text-[11px] font-bold text-white" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}>Before</div>
                    </div>
                    <button onClick={() => { setUpT1File(null); setUpT1Preview(null); }} className="text-xs text-red-400 hover:underline">Remove Image</button>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="text-3xl mb-2"></div>
                    <p className="text-sm font-medium mb-1">T1 (Before) Image</p>
                    <p className="text-xs text-[var(--ink-muted)] mb-3">Drag & drop or click to upload</p>
                    <button onClick={() => t1InputRef.current?.click()} className="rounded-lg bg-[var(--surface)] border border-[var(--rule-hairline)] px-4 py-1.5 text-xs hover:border-[var(--ink-muted)]">Select File</button>
                  </div>
                )}
              </div>

              {/* T2 Upload */}
              <div
                className={`rounded-2xl border-2 border-dashed p-6 flex flex-col items-center justify-center transition-colors ${upDragT2 ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_5%,var(--surface-sunken))]" : "border-[var(--rule-hairline)] bg-[var(--surface-sunken)]"} relative`}
                onDragOver={(e) => { e.preventDefault(); setUpDragT2(true); }}
                onDragLeave={(e) => { e.preventDefault(); setUpDragT2(false); }}
                onDrop={(e) => {
                  e.preventDefault();
                  setUpDragT2(false);
                  if (e.dataTransfer.files?.[0]) acceptFile(e.dataTransfer.files[0], "t2");
                }}
                style={{ minHeight: "240px" }}
              >
                <input type="file" className="hidden" ref={t2InputRef} onChange={(e) => { if (e.target.files?.[0]) acceptFile(e.target.files[0], "t2"); e.target.value = ''; }} accept=".jpg,.jpeg,.png,.tif,.tiff,.webp" />
                
                {upT2Preview ? (
                  <div className="w-full h-full flex flex-col items-center gap-3">
                    <div className="relative aspect-[4/3] w-full rounded-lg overflow-hidden border border-[var(--rule-hairline)]">
                      <Image src={upT2Preview} alt="T2 Preview" fill className="object-cover" />
                      <div className="absolute top-2 left-2 font-mono text-[11px] font-bold text-white" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}>After</div>
                    </div>
                    <button onClick={() => { setUpT2File(null); setUpT2Preview(null); }} className="text-xs text-red-400 hover:underline">Remove Image</button>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="text-3xl mb-2"></div>
                    <p className="text-sm font-medium mb-1">T2 (After) Image</p>
                    <p className="text-xs text-[var(--ink-muted)] mb-3">Drag & drop or click to upload</p>
                    <button onClick={() => t2InputRef.current?.click()} className="rounded-lg bg-[var(--surface)] border border-[var(--rule-hairline)] px-4 py-1.5 text-xs hover:border-[var(--ink-muted)]">Select File</button>
                  </div>
                )}
              </div>
            </div>

            {/* Controls row */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <input
                type="text"
                value={upFocus}
                onChange={(e) => setUpFocus(e.target.value)}
                placeholder="Optional focus (e.g. urban, water, vegetation, roads)…"
                className="flex-1 rounded-xl border px-4 py-2.5 text-sm focus:outline-none transition-colors"
                style={{ borderColor: "var(--rule-hairline)", background: "var(--surface-sunken)", color: "var(--ink-primary)" }}
              />

              <button
                onClick={runUploadChangeDetect}
                disabled={upRunning || !upT1File || !upT2File}
                className="flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                style={{ background: "linear-gradient(120deg, var(--accent), color-mix(in srgb, var(--accent) 55%, var(--accent-warm)))", color: "var(--background)" }}
              >
                {upRunning ? (
                  <><span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" /> Analysing…</>
                ) : (
                  <><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none"><path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg> Detect Changes</>
                )}
              </button>
            </div>

            {/* Change Detection Output */}
            {(upResult || upRunning || upError) && (
              <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--rule-hairline)", background: "var(--surface)" }}>
                {/* Output header */}
                <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "var(--rule-hairline)", background: "var(--surface-sunken)" }}>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-wider">Change Analysis</span>
                    {upResult && (
                      <>
                        <span className={`rounded border px-2 py-0.5 font-mono text-[10px] font-semibold ${INTENSITY_BADGE[upResult.change_intensity]?.cls ?? ""}`}>
                          {INTENSITY_BADGE[upResult.change_intensity]?.label}
                        </span>
                        <span className="rounded bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
                          {upResult.latency_ms.toFixed(0)} ms
                        </span>
                      </>
                    )}
                  </div>
                  <span className="font-mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
                    {upT1File?.name} → {upT2File?.name}
                  </span>
                </div>

                <div className="p-5">
                  {upError && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{upError}</div>
                  )}

                  {upRunning && (
                    <div className="flex flex-col items-center justify-center py-14 gap-4">
                      <div className="relative h-16 w-16">
                        <div className="absolute inset-0 rounded-full border-2 animate-spin" style={{ borderColor: "var(--accent) transparent transparent transparent" }} />
                        <div className="absolute inset-2 rounded-full border-2 animate-spin" style={{ borderColor: "color-mix(in srgb, var(--accent) 50%, transparent) transparent transparent transparent", animationDirection: "reverse", animationDuration: "0.8s" }} />
                        <div className="absolute inset-0 flex items-center justify-center text-lg"></div>
                      </div>
                      <div className="text-center">
                        <p className="font-mono text-xs" style={{ color: "var(--ink-muted)" }}>
                          Comparing T1 vs T2…
                        </p>
                        <p className="font-mono text-[10px] mt-1" style={{ color: "var(--ink-faint)" }}>
                          Sending both images to fine-tuned VLM for bi-temporal analysis
                        </p>
                      </div>
                    </div>
                  )}

                  {!upRunning && upResult && (
                    <div className="space-y-5">
                      {/* Summary */}
                      <div className="rounded-xl border p-4" style={{ borderColor: "var(--rule-hairline)", background: "var(--surface-sunken)" }}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
                          <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: "var(--ink-muted)" }}>Executive Summary</span>
                        </div>
                        <p className="text-sm leading-relaxed" style={{ color: "var(--ink-primary)" }}>{upResult.summary}</p>
                      </div>

                      {/* Change items */}
                      {upResult.changes.length > 0 && (
                        <div>
                          <h3 className="font-mono text-[10px] uppercase tracking-wider mb-3" style={{ color: "var(--ink-muted)" }}>
                            Detected Changes ({upResult.changes.length})
                          </h3>
                          <div className="space-y-3">
                            {upResult.changes.map((ch, i) => (
                              <div key={i} className="rounded-xl border p-4" style={{ borderColor: "var(--rule-hairline)", background: "var(--surface-sunken)" }}>
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm font-semibold" style={{ color: "var(--ink-primary)" }}>{ch.category}</span>
                                  <span className={`rounded border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase ${MAGNITUDE_COLORS[ch.magnitude] ?? ""}`}>
                                    {ch.magnitude} impact
                                  </span>
                                </div>
                                <p className="text-xs leading-relaxed mb-2" style={{ color: "var(--ink-muted)" }}>{ch.description}</p>
                                {ch.affected_classes.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {ch.affected_classes.map((cls, j) => (
                                      <span key={j} className="rounded border px-2 py-0.5 text-[10px]" style={{ borderColor: "var(--rule-hairline)", background: "var(--surface)", color: "var(--ink-muted)" }}>
                                        {cls}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Stable classes */}
                      {upResult.unchanged_classes.length > 0 && (
                        <div>
                          <span className="font-mono text-[10px] uppercase tracking-wider block mb-2" style={{ color: "var(--ink-muted)" }}>Stable / Unchanged Land Cover</span>
                          <div className="flex flex-wrap gap-1.5">
                            {upResult.unchanged_classes.map((cls, i) => (
                              <span key={i} className="rounded-lg border px-3 py-1 text-[11px]" style={{ borderColor: "color-mix(in srgb, var(--accent) 25%, var(--rule-hairline))", background: "color-mix(in srgb, var(--accent) 6%, var(--surface-sunken))", color: "var(--ink-muted)" }}>
                                ✓ {cls}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Footer */}
                      <div className="flex flex-wrap gap-x-6 gap-y-1 pt-3 border-t font-mono text-[10px]" style={{ borderColor: "var(--rule-hairline)", color: "var(--ink-faint)" }}>
                        <span>Model: {upResult.model_name}</span>
                        <span>T1: {upResult.t1_label} → T2: {upResult.t2_label}</span>
                        <span>Latency: {upResult.latency_ms.toFixed(0)} ms</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            MODE B: Single-Image VQA
        ════════════════════════════════════════════════════════ */}
        {mode === "vqa" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: tile + viewer */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              <div>
                <label className="mb-2 block font-mono text-[10px] uppercase tracking-wider" style={{ color: "var(--ink-muted)" }}>Select Tile</label>
                <div className="grid grid-cols-2 gap-2">
                  {TILES.map((tile) => (
                    <button
                      key={tile.id}
                      onClick={() => setVqaTile(tile)}
                      className="relative rounded-xl overflow-hidden border-2 transition-all text-left"
                      style={{ borderColor: vqaTile.id === tile.id ? "var(--accent)" : "var(--rule-hairline)", boxShadow: vqaTile.id === tile.id ? "0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent)" : "none" }}
                    >
                      <div className="relative aspect-square">
                        <Image src={tile.image} alt={tile.label} fill className="object-cover" sizes="160px" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-2">
                          <div className="text-[11px] font-semibold text-white">{tile.label}</div>
                          <div className="text-[9px] text-white/60">{tile.sublabel}</div>
                        </div>
                        {vqaTile.id === tile.id && (
                          <div className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)]">
                            <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-white" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 rounded-2xl overflow-hidden border relative" style={{ borderColor: "var(--rule-hairline)", background: "#000", minHeight: "280px" }}>
                <Image src={vqaTile.image} alt={vqaTile.label} fill className="object-cover" sizes="600px" />
                <div className="absolute top-2 left-2 font-mono text-[10px] px-2 py-1 rounded" style={{ background: "rgba(0,0,0,0.6)", color: "rgba(255,255,255,0.7)", backdropFilter: "blur(8px)" }}>
                  {vqaTile.modality} · {vqaTile.date}
                </div>
              </div>
            </div>

            {/* Right: query + output */}
            <div className="lg:col-span-7 flex flex-col gap-4">
              <div className="rounded-2xl border p-5" style={{ borderColor: "var(--rule-hairline)", background: "var(--surface)" }}>
                <label className="mb-3 block font-mono text-[10px] uppercase tracking-wider" style={{ color: "var(--ink-muted)" }}>Question</label>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {VQA_PROMPTS.map((q, i) => (
                    <button key={i} onClick={() => runVqa(q)}
                      className="rounded-lg border px-3 py-1 text-[11px] transition-all hover:scale-[1.02] active:scale-95 text-left"
                      style={{ borderColor: vqaPrompt === q ? "var(--accent)" : "var(--rule-hairline)", background: vqaPrompt === q ? "color-mix(in srgb, var(--accent) 12%, var(--surface-sunken))" : "var(--surface-sunken)", color: vqaPrompt === q ? "var(--accent)" : "var(--ink-muted)" }}>
                      {q}
                    </button>
                  ))}
                </div>
                <textarea rows={2} value={vqaPrompt} onChange={(e) => setVqaPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) runVqa(); }}
                  placeholder="Ask the model a question about this satellite tile…"
                  className="w-full rounded-xl border p-3 text-sm resize-none focus:outline-none"
                  style={{ borderColor: "var(--rule-hairline)", background: "var(--surface-sunken)", color: "var(--ink-primary)" }}
                />
                <button onClick={() => runVqa()} disabled={vqaRunning || !vqaPrompt.trim()}
                  className="mt-3 w-full rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ background: "linear-gradient(120deg, var(--accent), color-mix(in srgb, var(--accent) 55%, var(--accent-warm)))", color: "var(--background)" }}>
                  {vqaRunning ? <><span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />Running…</> : <>Ask SatQuery AI</>}
                </button>
              </div>

              <div className="flex-1 rounded-2xl border flex flex-col" style={{ borderColor: "var(--rule-hairline)", background: "var(--surface)", minHeight: "200px" }}>
                <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "var(--rule-hairline)" }}>
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-wider">Answer</span>
                  {vqaResult && <span className="rounded bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 font-mono text-[10px] text-emerald-400">{vqaResult.latency_ms.toFixed(0)} ms</span>}
                </div>
                <div className="flex-1 p-5 overflow-y-auto">
                  {vqaError && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{vqaError}</div>}
                  {vqaRunning && <div className="flex items-center justify-center h-full"><span className="h-8 w-8 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" /></div>}
                  {!vqaRunning && !vqaResult && !vqaError && (
                    <div className="flex flex-col items-center justify-center h-full gap-2 py-8 text-center">
                      <p className="text-sm font-medium" style={{ color: "var(--ink-primary)" }}>Ready to query</p>
                      <p className="text-xs max-w-xs" style={{ color: "var(--ink-faint)" }}>Pick a preset question or type your own, then run inference.</p>
                    </div>
                  )}
                  {!vqaRunning && vqaResult && (
                    <div className="space-y-4">
                      <div className="rounded-xl border p-4" style={{ borderColor: "var(--rule-hairline)", background: "var(--surface-sunken)" }}>
                        <p className="text-sm leading-relaxed" style={{ color: "var(--ink-primary)" }}>{vqaResult.answer}</p>
                      </div>
                      {vqaResult.detected_features?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {vqaResult.detected_features.map((f, i) => (
                            <span key={i} className="rounded-lg border px-3 py-1 text-[11px]" style={{ borderColor: "color-mix(in srgb, var(--accent) 30%, var(--rule-hairline))", background: "color-mix(in srgb, var(--accent) 8%, var(--surface-sunken))", color: "var(--ink-primary)" }}>
                              <span style={{ color: "var(--accent)" }}>✓</span> {f}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
