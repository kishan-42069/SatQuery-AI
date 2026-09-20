"use client";

import { useEffect, useState } from "react";
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
  metrics: Record<string, any>;
  detected_features: string[];
}

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-4xl rounded-xl border border-[var(--rule-hairline)] bg-[var(--surface)] p-6 sm:p-8 shadow-2xl z-10 my-8">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--rule-hairline)] pb-5">
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--ink-primary)]">
              Ask a question about a satellite image
            </h2>
            <p className="text-xs sm:text-sm text-[var(--ink-muted)]">
              Pick a scene, choose a question, and see how SatQuery AI reads it.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-primary)] transition-colors"
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
        </div>

        {/* Interactive Playground */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Left Column: Sample & Questions */}
          <div className="md:col-span-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--ink-primary)] mb-2">
                1. Pick a scene
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    id: "bengaluru_optical",
                    label: "ISRO Optical",
                    sub: "Bengaluru Urban",
                  },
                  {
                    id: "agriculture_water",
                    label: "BigEarthNet",
                    sub: "Agriculture & River",
                  },
                  {
                    id: "urban_expansion",
                    label: "Sentinel-2",
                    sub: "Infrastructure",
                  },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSample(s.id)}
                    className={cx(
                      "rounded-lg border p-2 text-left transition-all",
                      selectedSample === s.id
                        ? "border-[var(--brand-deep)] bg-[var(--brand-deep)]/10 ring-1 ring-[var(--brand-deep)]"
                        : "border-[var(--rule-hairline)] bg-[var(--surface-sunken)] hover:border-[var(--ink-muted)]",
                    )}
                  >
                    <div className="text-xs font-medium text-[var(--ink-primary)]">
                      {s.label}
                    </div>
                    <div className="text-[10px] text-[var(--ink-muted)] truncate">
                      {s.sub}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--ink-primary)] mb-2">
                2. Ask a question
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {[
                  "What land cover types and structures are visible in this satellite image?",
                  "Identify any urban infrastructure or transport networks.",
                  "Is there presence of water bodies or wetlands?",
                  "Detect agricultural fields and vegetation density.",
                ].map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setPrompt(q);
                      runInference(q);
                    }}
                    className="rounded-lg border border-[var(--rule-hairline)] bg-[var(--surface-sunken)] px-3 py-1 text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:border-[var(--brand-deep)] transition-colors text-left"
                  >
                    {q}
                  </button>
                ))}
              </div>

              <textarea
                rows={2}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ask the fine-tuned model a custom question about this tile..."
                className="w-full rounded-lg border border-[var(--rule-hairline)] bg-[var(--surface-sunken)] p-3 text-xs sm:text-sm text-[var(--ink-primary)] focus:border-[var(--brand-deep)] focus:outline-none"
              />
            </div>

            <Button
              onClick={() => runInference()}
              disabled={isRunning || !prompt.trim()}
              className="w-full py-2.5 flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold"
            >
              {isRunning ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Running Model Inference…
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                    <path
                      d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Ask SatQuery AI
                </>
              )}
            </Button>
          </div>

          {/* Right Column: Model Output & Findings */}
          <div className="md:col-span-6 flex flex-col rounded-xl border border-[var(--rule-hairline)] bg-[var(--surface-sunken)] p-4">
            <div className="flex items-center justify-between border-b border-[var(--rule-hairline)] pb-3 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-primary)]">
                  Answer
                </span>
                {result && (
                  <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-500">
                    {result.latency_ms} ms
                  </span>
                )}
              </div>
              <span className="font-mono text-[10px] text-[var(--ink-faint)]">

              </span>
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                {error}
              </div>
            )}

            {isRunning && (
              <div className="flex-1 flex flex-col items-center justify-center py-10 space-y-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand-deep)] border-t-transparent" />
                <p className="font-mono text-xs text-[var(--ink-muted)]">
                  Reading the image…
                </p>
              </div>
            )}

            {!isRunning && !result && !error && (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-[var(--ink-muted)] space-y-2">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-[var(--surface)] text-[var(--ink-faint)]">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                    <path
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
                  </svg>
                </div>
                <p className="text-xs font-medium text-[var(--ink-primary)]">
                  Ready to test
                </p>
                <p className="text-[11px] max-w-xs text-[var(--ink-faint)]">
                  Pick a scene and a question on the left, then ask — the answer appears here.
                </p>
              </div>
            )}

            {!isRunning && result && (
              <div className="space-y-4 flex-1 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="rounded-lg bg-[var(--surface)] p-3.5 border border-[var(--rule-hairline)]">
                    <p className="text-xs sm:text-sm leading-relaxed text-[var(--ink-primary)] whitespace-pre-wrap">
                      {result.answer}
                    </p>
                  </div>

                  {result.detected_features?.length > 0 && (
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-muted)] block mb-1.5">
                        Detected Land Cover Classes:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {result.detected_features.map((feat, i) => (
                          <span
                            key={i}
                            className="rounded bg-[var(--surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--ink-muted)] border border-[var(--rule-hairline)]"
                          >
                            ✓ {feat}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-[var(--rule-hairline)] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[var(--ink-muted)]">
          <div>
            Powered by <strong>SatQuery AI</strong>.
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/analyze"
              onClick={onClose}
              className="text-[var(--brand-deep)] hover:underline font-medium"
            >
              Open Full Analysis Workspace →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
