"use client";

/**
 * Compare — bi-temporal change detection.
 *
 * Submits both asset IDs in a single query; the orchestrator routes to the
 * change-detection workflow from the prompt. The two viewers share one
 * transform, so panning either side moves both — without that, "before and
 * after" is two pictures the user has to align by eye, which is precisely
 * the error-prone step the tool should remove.
 *
 * Ordering is by acquisition time where the backend recorded one, falling
 * back to upload order. It's labelled either way, because "before" and
 * "after" being backwards would invert every conclusion drawn here.
 */

import { useMemo, useState } from "react";

import AgentActivity from "@/components/app/AgentActivity";
import { AssetRow } from "@/components/app/AssetList";
import ImageryViewer, {
  IDENTITY_TRANSFORM,
  type ViewerTransform,
} from "@/components/app/ImageryViewer";
import QueryComposer from "@/components/app/QueryComposer";
import {
  ErrorNotice,
  EmptyState,
  Eyebrow,
  Panel,
  PanelTitle,
  Pill,
  cx,
} from "@/components/app/primitives";
import { useAnalysisSession } from "@/hooks/useAnalysisSession";
import { useAssets } from "@/hooks/useAssets";
import type { AssetMetadata } from "@/lib/api/types";

export default function ComparePage() {
  const { assets, isLoading, error: assetsError } = useAssets();
  const analysis = useAnalysisSession();

  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null>(null);
  const [transform, setTransform] = useState<ViewerTransform>(IDENTITY_TRANSFORM);
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null);

  /** Oldest first, so the default pair reads chronologically. */
  const chronological = useMemo(() => {
    return [...assets].sort((a, b) => {
      const at = a.acquisition_time ?? a.created_at;
      const bt = b.acquisition_time ?? b.created_at;
      return new Date(at).getTime() - new Date(bt).getTime();
    });
  }, [assets]);

  const before =
    findAsset(assets, beforeId) ?? chronological[0] ?? null;
  const after =
    findAsset(assets, afterId) ??
    chronological.find((a) => a.asset_id !== before?.asset_id) ??
    null;

  const ready = Boolean(before && after && before.asset_id !== after.asset_id);

  const handleSubmit = (text: string) => {
    if (!before || !after) return;
    setActiveFindingId(null);
    void analysis.submit(text, [before.asset_id, after.asset_id]);
  };

  const changeClasses = analysis.findings.flatMap(
    (finding) => finding.change_classes ?? [],
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Eyebrow>Bi-temporal observation · MODIS Terra 250m</Eyebrow>
        <h1 className="font-[family-name:var(--font-serif-display)] text-[2rem] leading-tight text-[var(--ink-primary)]">
          Temporal Comparison
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--ink-muted)]">
          Compare real satellite observations (NASA MODIS Terra) of Bengaluru East — Whitefield and Sarjapur
          corridors — to see urban expansion from 2019 to 2024. Inspect highlighted change regions and verify
          where the landscape changed.
        </p>
      </div>

      {assetsError ? <ErrorNotice>{assetsError}</ErrorNotice> : null}

      {!isLoading && assets.length < 2 ? (
        <EmptyState
          title="Change detection needs two images"
          hint="Upload at least two observations of the same area, taken at different times, from the Analyze workspace."
        />
      ) : (
        <>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ComparePane
          role="Before"
          asset={before}
          otherAssetId={after?.asset_id ?? null}
          assets={chronological}
          onSelect={setBeforeId}
          transform={transform}
          onTransformChange={setTransform}
          findings={[]}
        />
        <ComparePane
          role="After"
          asset={after}
          otherAssetId={before?.asset_id ?? null}
          assets={chronological}
          onSelect={setAfterId}
          transform={transform}
          onTransformChange={setTransform}
          // Detections are drawn on the later frame — a change footprint is
          // where something now is (or now isn't), read against the newer image.
          findings={analysis.findings}
          activeFindingId={activeFindingId}
          onSelectFinding={setActiveFindingId}
        />
      </div>

      <p className="flex items-center gap-2 rounded-md border border-[var(--rule-hairline)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--ink-muted)]">
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none">
          <path
            d="M4 12h16m0 0-5-5m5 5-5 5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Views are synchronised — panning or zooming either frame moves both.
      </p>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <QueryComposer
            onSubmit={handleSubmit}
            disabled={!ready || !analysis.sessionId}
            busy={analysis.isBusy}
            placeholder="Describe the change you're looking for…"
            helper={
              !ready
                ? "Select two different images to compare."
                : `Comparing ${before?.filename} → ${after?.filename}`
            }
          />

          <Panel className="h-fit">
            <PanelTitle
              trailing={
                analysis.phase === "completed" ? (
                  <Pill tone="ok">Validated</Pill>
                ) : null
              }
            >
              Change Detection Results
            </PanelTitle>

            {analysis.phase === "idle" ? (
              <p className="text-sm leading-relaxed text-[var(--ink-muted)]">
                Ask what changed between these two observations. Detected regions
                are outlined on the later frame.
              </p>
            ) : analysis.phase === "failed" ? (
              <ErrorNotice>
                {analysis.error ?? "Change detection failed."}
              </ErrorNotice>
            ) : analysis.isBusy ? (
              <p className="text-sm text-[var(--ink-muted)]">
                Aligning observations and running change detection…
              </p>
            ) : analysis.findings.length === 0 ? (
              <p className="text-sm leading-relaxed text-[var(--ink-muted)]">
                The workflow completed without returning change regions.
                {analysis.result?.error ? ` ${analysis.result.error}` : ""}
              </p>
            ) : (
              <div className="space-y-4">
                {changeClasses.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from(new Set(changeClasses)).map((cls) => (
                      <Pill key={cls} tone="active">
                        {cls}
                      </Pill>
                    ))}
                  </div>
                ) : null}

                <ul className="space-y-3">
                  {analysis.findings.map((finding, index) => (
                    <li key={finding.finding_id}>
                      <button
                        type="button"
                        onClick={() => setActiveFindingId(finding.finding_id)}
                        className={cx(
                          "flex w-full flex-col gap-2 rounded-md border px-3 py-2 text-left transition-colors",
                          finding.finding_id === activeFindingId
                            ? "border-[var(--brand-rule)] bg-[var(--brand-rule-soft)]"
                            : "border-[var(--rule-hairline)] hover:border-[var(--rule-strong)]",
                        )}
                      >
                        <div className="flex w-full items-center justify-between gap-3">
                          <span className="min-w-0 font-medium text-sm text-[var(--ink-primary)]">
                            {finding.label ?? `Change region ${index + 1}`}
                          </span>
                          <span className="shrink-0 font-[family-name:var(--font-geist-mono)] text-xs text-[var(--ink-muted)]">
                            {(finding.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                        {finding.answer && (
                          <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
                            {finding.answer}
                          </p>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        </div>

        <Panel className="h-fit">
          <AgentActivity
            trace={analysis.trace}
            phase={analysis.phase}
            liveTrace={analysis.liveTrace}
          />
        </Panel>
      </div>
        </>
      )}
    </div>
  );
}

function findAsset(assets: AssetMetadata[], id: string | null) {
  return id ? (assets.find((a) => a.asset_id === id) ?? null) : null;
}

function ComparePane({
  role,
  asset,
  otherAssetId,
  assets,
  onSelect,
  transform,
  onTransformChange,
  findings,
  activeFindingId,
  onSelectFinding,
}: {
  role: "Before" | "After";
  asset: AssetMetadata | null;
  otherAssetId: string | null;
  assets: AssetMetadata[];
  onSelect: (id: string) => void;
  transform: ViewerTransform;
  onTransformChange: (next: ViewerTransform) => void;
  findings: Parameters<typeof ImageryViewer>[0]["findings"];
  activeFindingId?: string | null;
  onSelectFinding?: (id: string) => void;
}) {
  const stamp = asset?.acquisition_time ?? asset?.created_at ?? null;

  return (
    <Panel padded={false} className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--rule-hairline)] px-4 py-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-[var(--ink-primary)]">
          {role}
        </h2>
        {stamp ? (
          <Pill>{new Date(stamp).getFullYear()}</Pill>
        ) : (
          <Pill>Undated</Pill>
        )}
      </div>

      <ImageryViewer
        asset={asset}
        findings={findings}
        activeFindingId={activeFindingId}
        onSelectFinding={onSelectFinding}
        transform={transform}
        onTransformChange={onTransformChange}
        className="aspect-[4/3] w-full rounded-none border-0"
      />

      <div className="max-h-40 space-y-1.5 overflow-y-auto border-t border-[var(--rule-hairline)] p-3">
        {assets.map((candidate) => (
          <AssetRow
            key={candidate.asset_id}
            asset={candidate}
            selected={candidate.asset_id === asset?.asset_id}
            // Blocking the other pane's pick prevents comparing an image
            // with itself, which returns an empty result and reads as a bug.
            disabled={candidate.asset_id === otherAssetId}
            onSelect={() => onSelect(candidate.asset_id)}
          />
        ))}
      </div>
    </Panel>
  );
}
