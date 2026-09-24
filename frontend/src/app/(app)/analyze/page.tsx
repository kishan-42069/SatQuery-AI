"use client";

/**
 * Analyze — the primary workspace: one image, a natural-language question,
 * and the evidence behind the answer.
 *
 * Three columns because the three things have to be visible at once. The
 * whole premise is that you can check the answer against the pixels while
 * reading it; putting the result behind a tab would break exactly the
 * verification loop the product is selling.
 */

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

import AssetList from "@/components/app/AssetList";
import FindingsPanel from "@/components/app/FindingsPanel";
import ImageryViewer from "@/components/app/ImageryViewer";
import QueryComposer from "@/components/app/QueryComposer";
import {
  Button,
  ErrorNotice,
  Eyebrow,
  Panel,
  PanelTitle,
  Shimmer,
} from "@/components/app/primitives";
import { useAnalysisSession } from "@/hooks/useAnalysisSession";
import { useAssets } from "@/hooks/useAssets";

/**
 * `useSearchParams` opts the subtree into client-side rendering, so it needs
 * a Suspense boundary for `next build` to prerender the shell around it.
 *
 * The fallback is a skeleton of the real three-column layout, not `null`.
 * Arriving from the hero's departure animation onto a bare masthead over an
 * empty page is worse than no animation at all — the eye has just followed
 * a planet across the screen and lands on nothing.
 */
export default function AnalyzePage() {
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      <AnalyzeWorkspace />
    </Suspense>
  );
}

function WorkspaceSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Eyebrow>Active workspace</Eyebrow>
        <h1 className="font-[family-name:var(--font-serif-display)] text-[2rem] leading-tight text-[var(--ink-primary)]">
          Imagery Analysis
        </h1>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
        <Shimmer className="h-64" />
        <Shimmer className="aspect-[4/3] w-full" />
        <Shimmer className="h-80" />
      </div>
    </div>
  );
}

function AnalyzeWorkspace() {
  const {
    assets,
    isLoading,
    error: assetsError,
    isUploading,
    uploadError,
    upload,
  } = useAssets();

  const analysis = useAnalysisSession();
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // An asset can be selected through the URL. Apply it once so later
  // selections aren't reverted by the param still sitting in the URL.
  const searchParams = useSearchParams();
  const requestedAssetId = searchParams.get("asset");
  /** A question typed on the landing page, carried through the hero's
   *  ANALYSE button. Seeds the composer so it isn't retyped. */
  const carriedQuery = searchParams.get("q") ?? "";
  const appliedParamRef = useRef<string | null>(null);

  useEffect(() => {
    if (!requestedAssetId || appliedParamRef.current === requestedAssetId) return;
    appliedParamRef.current = requestedAssetId;
    setSelectedAssetId(requestedAssetId);
  }, [requestedAssetId]);

  // Default to the newest asset once the catalogue loads, so the workspace
  // isn't empty on arrival — but never override an explicit choice.
  const activeAssetId = selectedAssetId ?? assets[0]?.asset_id ?? null;
  const activeAsset = useMemo(
    () => assets.find((a) => a.asset_id === activeAssetId) ?? null,
    [assets, activeAssetId],
  );

  const canQuery = Boolean(analysis.sessionId && activeAsset);

  const handleSubmit = (text: string) => {
    if (!activeAsset) return;
    setActiveFindingId(null);
    void analysis.submit(text, [activeAsset.asset_id]);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Eyebrow>Active workspace</Eyebrow>
        <h1 className="font-[family-name:var(--font-serif-display)] text-[2rem] leading-tight text-[var(--ink-primary)]">
          Imagery Analysis
        </h1>
      </div>

      {analysis.sessionError ? (
        <ErrorNotice>
          {analysis.sessionError} Queries can&rsquo;t be submitted until the API
          is reachable.
        </ErrorNotice>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
        {/* ── Assets ───────────────────────────────────────────────────── */}
        <aside className="space-y-4">
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => {
                analysis.reset();
                setActiveFindingId(null);
              }}
              disabled={analysis.isBusy}
            >
              New Analysis
            </Button>
            <Button
              variant="secondary"
              aria-label="Upload imagery"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                  <path
                    d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept=".tif,.tiff,.jp2,.img,.nc,.png,.jpg,.jpeg"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = ""; // Allow re-picking the same file.
                if (!file) return;
                const uploaded = await upload(file);
                if (uploaded) setSelectedAssetId(uploaded.asset_id);
              }}
            />
          </div>

          {uploadError ? <ErrorNotice>{uploadError}</ErrorNotice> : null}

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-faint)]">
              Assets
            </p>
            {assetsError ? (
              <ErrorNotice>{assetsError}</ErrorNotice>
            ) : (
              <AssetList
                assets={assets}
                isLoading={isLoading}
                selectedId={activeAssetId}
                onSelect={(id) => {
                  setSelectedAssetId(id);
                  setActiveFindingId(null);
                }}
                emptyHint="No imagery ingested yet. Upload a GeoTIFF to start, or drop files into the backend's data/raw folder."
              />
            )}
          </div>
        </aside>

        {/* ── Viewer + query ───────────────────────────────────────────── */}
        <div className="space-y-5">
          <ImageryViewer
            asset={activeAsset}
            findings={analysis.findings}
            activeFindingId={activeFindingId}
            onSelectFinding={setActiveFindingId}
            className="aspect-[4/3] w-full"
          />

          <QueryComposer
            onSubmit={handleSubmit}
            initialValue={carriedQuery}
            disabled={!canQuery}
            busy={analysis.isBusy}
            helper={
              !activeAsset
                ? "Select or upload an image before querying."
                : analysis.prompt && analysis.isBusy
                  ? `Running: “${analysis.prompt}”`
                  : undefined
            }
          />

          
        </div>

        {/* ── Result ───────────────────────────────────────────────────── */}
        <Panel className="h-fit lg:sticky lg:top-24">
          <PanelTitle>Analysis Result</PanelTitle>
          <FindingsPanel
            phase={analysis.phase}
            result={analysis.result}
            findings={analysis.findings}
            asset={activeAsset}
            error={analysis.error}
            activeFindingId={activeFindingId}
            onSelectFinding={setActiveFindingId}
          />
        </Panel>
      </div>
    </div>
  );
}
