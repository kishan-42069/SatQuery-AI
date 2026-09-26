"use client";

/**
 * Reports — Recent analysis archive.
 *
 * Shows the 5 most recent analysis reports with review and download options.
 * The backend scopes reports by session (`GET /reports/session/{id}`), and
 * the session id lives in sessionStorage, so this list is per-browser-tab
 * and does not survive closing it.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, resolveExportUri } from "@/lib/api/client";
import { reports as reportsApi } from "@/lib/api/endpoints";
import {
  Button,
  EmptyState,
  ErrorNotice,
  Eyebrow,
  Panel,
  Shimmer,
  cx,
} from "@/components/app/primitives";
import type { ExportFormat, Report } from "@/lib/api/types";

const FORMATS: ExportFormat[] = ["json", "geojson", "pdf"];
const MAX_RECENT_REPORTS = 5;

export default function ReportsPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [recentReports, setRecentReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      const stored = window.sessionStorage.getItem("satquery:session_id");
      setSessionId(stored);
      if (!stored) {
        setIsLoading(false);
        return;
      }

      try {
        const page = await reportsApi.listForSession(stored, controller.signal);
        // Sort by created_at descending (newest first) and take top 5
        const sorted = [...page.reports].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setRecentReports(sorted.slice(0, MAX_RECENT_REPORTS));
        setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof ApiError
            ? (err.detail ?? err.message)
            : "Could not load reports.",
        );
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, []);

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Eyebrow>Analysis record</Eyebrow>
        <h1 className="font-[family-name:var(--font-serif-display)] text-[2rem] leading-tight text-[var(--ink-primary)]">
          Recent Reports
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--ink-muted)]">
          Your latest analysis reports. Review details and download in multiple
          formats.
        </p>
      </div>

      {error ? <ErrorNotice>{error}</ErrorNotice> : null}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Shimmer key={i} className="h-28" />
          ))}
        </div>
      ) : !sessionId ? (
        <EmptyState
          title="No session yet"
          hint="Reports are scoped to an analysis session. Run a query from the Analyze workspace and it will appear here."
        />
      ) : recentReports.length === 0 && !error ? (
        <EmptyState
          title="No reports yet"
          hint="Completed analysis reports will appear here."
        />
      ) : (
        <div className="grid gap-4">
          {recentReports.map((report) => (
            <ReportCard
              key={report.report_id}
              report={report}
              onReview={() => {
                setSelectedReport(report);
                setModalOpen(true);
              }}
            />
          ))}
        </div>
      )}

      {sessionId ? (
        <p className="text-xs leading-relaxed text-[var(--ink-faint)]">
          Session {sessionId.slice(0, 8)}… — reports are scoped to this browser
          tab and cleared when closed.
        </p>
      ) : null}

      {modalOpen && selectedReport && (
        <ReportDetailModal
          report={selectedReport}
          onClose={() => {
            setModalOpen(false);
            setSelectedReport(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Clean report card showing essential info with Review and Download actions.
 */
function ReportCard({
  report,
  onReview,
}: {
  report: Report;
  onReview: () => void;
}) {
  const [exportUri, setExportUri] = useState(report.export_uri);
  const [pendingFormat, setPendingFormat] = useState<ExportFormat | null>(null);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowDownloadMenu(false);
      }
    };

    if (showDownloadMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showDownloadMenu]);

  const runExport = useCallback(
    async (format: ExportFormat) => {
      setPendingFormat(format);
      setExportError(null);
      try {
        const result = await reportsApi.export(report.report_id, format);
        setExportUri(result.export_uri);
        // Download automatically
        const link = document.createElement("a");
        link.href = resolveExportUri(result.export_uri);
        link.download = `report_${report.report_id}.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err) {
        setExportError(
          err instanceof ApiError
            ? (err.detail ?? err.message)
            : "Export failed.",
        );
      } finally {
        setPendingFormat(null);
        setShowDownloadMenu(false);
      }
    },
    [report.report_id],
  );

  const findingCount = report.evidence?.length ?? 0;
  const createdDate = new Date(report.created_at);

  return (
    <Panel className="flex flex-col gap-4">
      {/* Header: Title and Date */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-[family-name:var(--font-serif-display)] text-lg leading-snug text-[var(--ink-primary)] line-clamp-2">
            {report.summary || "Untitled report"}
          </h3>
          <p className="mt-1.5 text-xs text-[var(--ink-muted)]">
            {createdDate.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}{" "}
            •{" "}
            {createdDate.toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </div>

      {/* Metadata Row: Findings + Run ID */}
      {findingCount > 0 && (
        <div className="flex items-center gap-4 text-xs text-[var(--ink-muted)]">
          <span className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--brand-rule)]" />
            {findingCount} finding{findingCount === 1 ? "" : "s"}
          </span>
          <span className="font-[family-name:var(--font-geist-mono)] text-[10px] text-[var(--ink-faint)]">
            Run {report.run_id.slice(0, 8)}
          </span>
        </div>
      )}

      {/* Actions: Review and Download */}
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--rule-hairline)] pt-4">
        <Button variant="secondary" size="sm" onClick={onReview}>
          Review
        </Button>

        <div className="relative" ref={menuRef}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowDownloadMenu(!showDownloadMenu)}
            disabled={pendingFormat !== null}
          >
            Download {pendingFormat ? "…" : "↓"}
          </Button>

          {showDownloadMenu && (
            <div className="absolute top-full left-0 mt-1 min-w-32 rounded-md border border-[var(--rule-hairline)] bg-[var(--surface)] shadow-lg z-50">
              {FORMATS.map((format) => (
                <button
                  key={format}
                  onClick={() => void runExport(format)}
                  disabled={pendingFormat !== null}
                  className={cx(
                    "block w-full px-3 py-2 text-left text-xs font-medium transition-colors first:rounded-t-md last:rounded-b-md",
                    "hover:bg-[var(--surface-sunken)] disabled:opacity-50 disabled:cursor-not-allowed",
                    "border-b border-[var(--rule-hairline)] last:border-b-0",
                    "text-[var(--ink-primary)]"
                  )}
                >
                  {pendingFormat === format ? "…" : format.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>

        {exportError && (
          <span className="ml-auto text-xs text-[var(--state-error)]">
            {exportError}
          </span>
        )}
      </div>
    </Panel>
  );
}

/**
 * Modal overlay for reviewing a report's full details.
 */
function ReportDetailModal({
  report,
  onClose,
}: {
  report: Report;
  onClose: () => void;
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        role="presentation"
      />

      {/* Modal */}
      <div className="fixed inset-4 z-50 flex items-center justify-center overflow-auto sm:inset-6">
        <Panel className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="font-[family-name:var(--font-serif-display)] text-xl leading-snug text-[var(--ink-primary)]">
                {report.summary || "Report"}
              </h2>
              <p className="mt-2 text-xs text-[var(--ink-muted)]">
                {new Date(report.created_at).toLocaleString()} · Run{" "}
                {report.run_id.slice(0, 8)}
              </p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded p-1 text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-primary)]"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="border-t border-[var(--rule-hairline)] pt-5 space-y-6">
            {/* Summary */}
            <section>
              <h3 className="mb-2 text-sm font-semibold text-[var(--ink-primary)]">
                Summary
              </h3>
              <p className="text-sm leading-relaxed text-[var(--ink-muted)]">
                {report.summary}
              </p>
            </section>

            {/* Evidence / Findings */}
            {report.evidence && report.evidence.length > 0 && (
              <section>
                <h3 className="mb-3 text-sm font-semibold text-[var(--ink-primary)]">
                  Evidence Chain ({report.evidence.length} step
                  {report.evidence.length !== 1 ? "s" : ""})
                </h3>
                <div className="space-y-2">
                  {report.evidence.map((entry, index) => (
                    <div
                      key={index}
                      className="rounded border border-[var(--rule-hairline)] bg-[var(--surface-inset)] px-3 py-2"
                    >
                      <p className="text-xs font-medium text-[var(--ink-primary)]">
                        Step {index + 1}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--ink-muted)] font-[family-name:var(--font-geist-mono)]">
                        {summariseEvidence(entry)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Metadata */}
            <section className="space-y-1 border-t border-[var(--rule-hairline)] pt-4 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Report ID</span>
                <span className="font-[family-name:var(--font-geist-mono)] text-[var(--ink-faint)]">
                  {report.report_id.slice(0, 16)}…
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Run ID</span>
                <span className="font-[family-name:var(--font-geist-mono)] text-[var(--ink-faint)]">
                  {report.run_id.slice(0, 16)}…
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Session ID</span>
                <span className="font-[family-name:var(--font-geist-mono)] text-[var(--ink-faint)]">
                  {report.session_id.slice(0, 16)}…
                </span>
              </div>
            </section>
          </div>

          {/* Close Button */}
          <div className="mt-6 border-t border-[var(--rule-hairline)] pt-4">
            <Button variant="secondary" onClick={onClose} className="w-full">
              Close
            </Button>
          </div>
        </Panel>
      </div>
    </>
  );
}

/**
 * Extract readable text from evidence entries, falling back to JSON.
 */
function summariseEvidence(entry: Record<string, unknown>): string {
  for (const key of ["description", "summary", "label", "step", "source"]) {
    const value = entry[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  const json = JSON.stringify(entry);
  return json.length > 200 ? `${json.slice(0, 200)}…` : json;
}
