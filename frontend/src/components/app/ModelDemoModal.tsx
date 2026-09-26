"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { apiFetch } from "@/lib/api/client";
import { Button, cx } from "./primitives";

interface ModelInfo {
  status: string;
  model_id: string;
  adapter_type: string;
  dataset: string;
  epochs: number;
  total_steps: number;
  train_samples: number;
  val_samples: number;
  final_train_loss: number;
  best_eval_loss: number;
  checkpoint_dir: string;
  device: string;
  samples: Array<{
    id: string;
    name: string;
    modality: string;
    resolution: string;
    default_prompt: string;
    preview_url: string;
  }>;
  preset_queries: string[];
}

interface InferenceResult {
  status: string;
  answer: string;
  prompt: string;
  latency_ms: number;
  model_name: string;
  checkpoint_path: string;
  device: string;
  metrics: Record<string, unknown>;
  detected_features: string[];
}

const SCENES = [
  {
    id: "bengaluru_optical",
    label: "ISRO Optical",
    sub: "Bengaluru Urban",
    image: "/demo-tiles/isro_bengaluru_2022.jpg",
  },
  {
    id: "agriculture_water",
    label: "BigEarthNet",
    sub: "Agriculture & River",
    image: "/demo-tiles/agriculture_river.png",
  },
  {
    id: "urban_expansion",
    label: "Sentinel-2",
    sub: "Infrastructure",
    image: "/demo-tiles/urban_bengaluru.jpg",
  },
] as const;

const QUESTIONS = [
  "What land cover types and structures are visible in this satellite image?",
  "Identify any urban infrastructure or transport networks.",
  "Is there presence of water bodies or wetlands?",
  "Detect agricultural fields and vegetation density.",
] as const;

export default function ModelDemoModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [prompt, setPrompt] = useState(
    "What land cover types and structures are visible in this satellite image?",
  );
  const [selectedSample, setSelectedSample] = useState("bengaluru_optical");
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load model status and metadata
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    setLoadingInfo(true);
    setError(null);

    apiFetch<ModelInfo>("/model/info")
      .then((data) => {
        if (isMounted) {
          setModelInfo(data);
          if (data.preset_queries?.length > 0) {
            setPrompt(data.preset_queries[0]);
          }
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(
            err instanceof Error ? err.message : "Failed to load model info",
          );
        }
      })
      .finally(() => {
        if (isMounted) setLoadingInfo(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const runInference = async (customPrompt?: string) => {
    const queryPrompt = customPrompt || prompt;
    if (!queryPrompt.trim()) return;

    setIsRunning(true);
    setError(null);

    try {
      const res = await apiFetch<InferenceResult>("/model/infer", {
        method: "POST",
        json: {
          prompt: queryPrompt,
          sample_id: selectedSample,
          max_tokens: 128,
        },
      });
      setResult(res);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Inference execution failed",
      );
    } finally {
      setIsRunning(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-3 sm:p-6">
      <div
        className="fixed inset-0 bg-[#000000]"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="model-demo-title"
        className="relative z-10 my-5 w-full max-w-6xl overflow-hidden rounded-3xl border border-cyan-300/25 bg-[var(--surface)] shadow-[0_24px_100px_rgba(2,8,23,0.7)]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 82% 0%, color-mix(in srgb, var(--accent) 13%, transparent), transparent 31rem), linear-gradient(135deg, color-mix(in srgb, var(--surface) 94%, #071426), var(--surface))",
        }}
      >
        <header className="relative flex items-start justify-between border-b border-cyan-200/15 px-5 py-5 sm:px-8 sm:py-6">
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300/80">
              Interactive image intelligence
            </p>
            <h2 id="model-demo-title" className="text-xl font-semibold tracking-tight text-[var(--ink-primary)] sm:text-2xl">
              Ask a question about a satellite image
            </h2>
            <p className="max-w-xl text-xs leading-relaxed text-[var(--ink-muted)] sm:text-sm">
              Pick a scene, choose a question, and see how SatQuery AI reads it.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-transparent p-2 text-[var(--ink-muted)] transition-colors hover:border-cyan-200/20 hover:bg-cyan-300/10 hover:text-cyan-100"
            aria-label="Close modal"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
              <path
                d="M6 18L18 6M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </header>

        <main className="relative grid grid-cols-1 gap-5 p-5 sm:p-8 lg:grid-cols-[1.02fr_.98fr]">
          <section className="rounded-2xl border border-cyan-100/10 bg-slate-950/20 p-4 shadow-inner shadow-black/10 sm:p-5">
            <div className="space-y-6">
              <div>
                <label className="mb-3 block text-[11px] font-semibold uppercase tracking-[0.17em] text-cyan-100/85">
                1. Pick a scene
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {SCENES.map((scene) => (
                  <button
                    key={scene.id}
                    type="button"
                    onClick={() => setSelectedSample(scene.id)}
                    className={cx(
                      "group relative min-h-28 overflow-hidden rounded-xl border text-left transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70",
                      selectedSample === scene.id
                        ? "border-cyan-300/75 bg-cyan-300/10 shadow-[0_0_20px_rgba(34,211,238,.16)]"
                        : "border-white/10 bg-slate-950/30 hover:border-cyan-200/35 hover:bg-slate-900/60",
                    )}
                  >
                    <Image src={scene.image} alt="" fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover opacity-35 transition-opacity duration-200 group-hover:opacity-50" />
                    <span className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-transparent" />
                    {selectedSample === scene.id ? (
                      <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-cyan-300 text-slate-950">
                        <CheckIcon className="h-3 w-3" />
                      </span>
                    ) : null}
                    <span className="relative flex h-full flex-col justify-end p-3">
                      <span className="text-xs font-semibold text-white">{scene.label}</span>
                      <span className="mt-0.5 truncate text-[10px] text-cyan-50/75">{scene.sub}</span>
                    </span>
                  </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-3 block text-[11px] font-semibold uppercase tracking-[0.17em] text-cyan-100/85">
                  2. Ask a question
                </label>
                <div className="space-y-2">
                  {QUESTIONS.map((question, index) => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => {
                        setPrompt(question);
                        runInference(question);
                      }}
                      className={cx(
                        "group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70",
                        prompt === question
                          ? "border-cyan-300/55 bg-cyan-300/10 text-cyan-50"
                          : "border-white/10 bg-slate-950/25 text-[var(--ink-muted)] hover:border-cyan-200/30 hover:bg-slate-900/55 hover:text-[var(--ink-primary)]",
                      )}
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-cyan-300/10 text-cyan-200">
                        <QuestionIcon index={index} className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 text-xs leading-snug sm:text-[13px]">{question}</span>
                      <ArrowIcon className="h-4 w-4 shrink-0 text-cyan-200/70 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 transition-colors focus-within:border-cyan-300/55 focus-within:ring-1 focus-within:ring-cyan-300/20">
                  <QuestionIcon index={0} className="h-4 w-4 shrink-0 text-cyan-200/75" />
                  <textarea
                    rows={1}
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="Type your own question here..."
                    className="min-h-6 flex-1 resize-none bg-transparent py-0.5 text-xs leading-5 text-[var(--ink-primary)] outline-none placeholder:text-[var(--ink-faint)] sm:text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => runInference()}
                    disabled={isRunning || !prompt.trim()}
                    aria-label="Ask SatQuery AI"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-cyan-300 text-slate-950 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <ArrowIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <Button
                onClick={() => runInference()}
                disabled={isRunning || !prompt.trim()}
                className="flex w-full items-center justify-center gap-2 border border-cyan-100/15 bg-cyan-300 py-2.5 text-xs font-semibold text-slate-950 shadow-[0_7px_22px_rgba(34,211,238,.16)] transition-all hover:brightness-110 sm:text-sm"
              >
                {isRunning ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/70 border-t-transparent" />
                    Analyzing satellite image…
                  </>
                ) : (
                  <>
                    <SatelliteIcon className="h-4 w-4" />
                    Ask SatQuery AI
                  </>
                )}
              </Button>
            </div>
          </section>

          <section className="relative flex min-h-[440px] flex-col overflow-hidden rounded-2xl border border-cyan-200/15 bg-slate-950/35 p-4 shadow-inner shadow-black/20 sm:p-5">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/60 to-transparent" />
            <div className="flex items-center justify-between border-b border-cyan-100/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-cyan-300/10 text-cyan-200">
                  <AnalysisIcon className="h-3.5 w-3.5" />
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.17em] text-cyan-100/85">Answer</span>
                {result ? <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2 py-0.5 font-mono text-[10px] text-emerald-300">{result.latency_ms} ms</span> : null}
              </div>
              <span className="font-mono text-[10px] text-[var(--ink-faint)]">{loadingInfo ? "CONNECTING" : modelInfo?.status === "ready" ? "MODEL READY" : "LIVE ANALYSIS"}</span>
            </div>

            {error ? <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-xs leading-relaxed text-red-200">{error}</div> : null}

            {isRunning ? (
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <div className="relative grid h-16 w-16 place-items-center rounded-full border border-cyan-300/30 bg-cyan-300/5">
                  <span className="absolute inset-[-7px] animate-spin rounded-full border border-dashed border-cyan-300/45" />
                  <SatelliteIcon className="h-6 w-6 text-cyan-200" />
                </div>
                <p className="mt-5 text-sm font-medium text-[var(--ink-primary)]">Analyzing satellite image…</p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">Reading visual patterns and spatial context.</p>
              </div>
            ) : null}

            {!isRunning && !result && !error ? (
              <div className="flex flex-1 flex-col items-center justify-center px-5 text-center">
                <EmptyAnalysisIllustration />
                <p className="mt-5 text-sm font-medium text-[var(--ink-primary)]">Your analysis will appear here</p>
                <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-[var(--ink-muted)]">Select a scene and ask a question to get started.</p>
              </div>
            ) : null}

            {!isRunning && result ? (
              <div className="mt-4 flex flex-1 flex-col gap-4 overflow-auto">
                <div className="rounded-xl border border-cyan-100/10 bg-slate-900/45 p-4">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200/80">Analysis summary</p>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--ink-primary)] sm:text-sm">{result.answer}</p>
                </div>
                {result.detected_features?.length > 0 ? (
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200/80">Detected features</p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.detected_features.map((feature) => (
                        <span key={feature} className="inline-flex items-center gap-1 rounded-full border border-cyan-100/15 bg-cyan-300/5 px-2.5 py-1 text-[11px] text-cyan-50/90"><CheckIcon className="h-3 w-3 text-cyan-300" />{feature}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        </main>

        <footer className="relative flex flex-col items-center justify-between gap-3 border-t border-cyan-100/10 px-5 py-4 text-xs text-[var(--ink-muted)] sm:flex-row sm:px-8">
          <span>Powered by <strong className="font-semibold text-cyan-100/90">SatQuery AI</strong></span>
          <a href="/analyze" onClick={onClose} className="group inline-flex items-center gap-1 font-medium text-cyan-200 transition-colors hover:text-cyan-50">
            Open Full Analysis Workspace <ArrowIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </a>
        </footer>
      </div>
    </div>
  );
}

function SatelliteIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="m13.5 10.5 3-3 2 2-3 3m-5.5.5 2-2 2 2-2 2-2-2Zm-1.5 1.5-4 4m5-9-4-4-3 3 4 4m-5.5 4.5 2 2m8-8 2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 20c2.5-1 5-.9 7.5.3M2.5 17c2.5-1 5-1 7.5 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".7" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><path d="m5 12 4.2 4.2L19 6.7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ArrowIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><path d="M5 12h13m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function AnalysisIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" /><path d="M8 15.5 10.5 12l2.1 2.3 3.4-4.8M8 8h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function QuestionIcon({ index, className }: { index: number; className?: string }) {
  if (index === 1) return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><path d="M4 18h16M6 16l4-5 3 3 5-7M17 7h1.5V8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (index === 2) return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><path d="M12 3c3 3.8 5 6.5 5 10a5 5 0 1 1-10 0c0-3.5 2-6.2 5-10Z" stroke="currentColor" strokeWidth="1.7" /><path d="M9.5 14c.6 1.1 1.5 1.7 2.8 1.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
  if (index === 3) return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><path d="M12 20V10m0 5c-2.7 0-4.5-1.5-5.5-4 2.6-.1 4.5 1.3 5.5 4Zm0-8c2.7 0 4.5-1.5 5.5-4-2.6-.1-4.5 1.3-5.5 4Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><path d="M4 5.5h16v11H9l-5 3v-14Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M8 10h8m-8 3h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
}

function EmptyAnalysisIllustration() {
  return (
    <div className="relative grid h-28 w-32 place-items-center" aria-hidden="true">
      <span className="absolute h-24 w-24 rounded-full border border-cyan-300/15" />
      <span className="absolute h-16 w-32 rotate-[-18deg] rounded-[50%] border border-cyan-300/25" />
      <span className="relative grid h-12 w-12 place-items-center rounded-xl border border-cyan-300/35 bg-cyan-300/10 text-cyan-100 shadow-[0_0_28px_rgba(34,211,238,.14)]"><AnalysisIcon className="h-6 w-6" /></span>
      <span className="absolute bottom-2 left-5 text-cyan-200/80"><SatelliteIcon className="h-4 w-4" /></span>
    </div>
  );
}
