"use client";

/**
 * Natural-language input for an analysis run.
 *
 * The suggestion chips are the query classes the orchestrator actually
 * routes (VQA, grounding, change detection, water/land segmentation) rather
 * than decorative examples — a chip that produces "no suitable workflow"
 * teaches the user the wrong thing about what the system can do.
 */

import { useState } from "react";

import { Button, cx } from "./primitives";

const SUGGESTIONS = [
  "Find all buildings",
  "What changed here?",
  "Show water bodies",
  "Detect deforestation",
] as const;

export default function QueryComposer({
  onSubmit,
  disabled,
  busy,
  placeholder = "Ask anything about this imagery…",
  helper,
  initialValue = "",
}: {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  busy?: boolean;
  placeholder?: string;
  helper?: React.ReactNode;
  /**
   * Seeds the field once, on mount — used to carry a question typed on the
   * landing page into this workspace. Deliberately not kept in sync
   * afterwards: the URL still holds `?q=`, and re-applying it would
   * overwrite whatever the user typed next.
   */
  initialValue?: string;
}) {
  const [text, setText] = useState(initialValue);
  const canSubmit = text.trim().length > 0 && !disabled && !busy;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(text.trim());
    setText("");
  };

  return (
    <div className="space-y-3">
      <label
        htmlFor="nl-query"
        className="block text-sm font-medium text-[var(--ink-primary)]"
      >
        Natural-language query
      </label>

      <div className="flex items-stretch gap-2">
        <textarea
          id="nl-query"
          rows={1}
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Enter submits; Shift+Enter keeps the newline, which matters
            // for the longer multi-clause prompts this system encourages.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          className={cx(
            "min-h-[46px] flex-1 resize-none rounded-md border border-[var(--rule-hairline)] bg-[var(--surface)]",
            "px-3.5 py-3 text-sm text-[var(--ink-primary)] placeholder:text-[var(--ink-faint)]",
            "focus:border-[var(--brand-deep)] focus:outline-none disabled:opacity-60",
          )}
        />
        <Button
          onClick={submit}
          disabled={!canSubmit}
          aria-label="Run analysis"
          className="px-4"
        >
          {busy ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
              <path
                d="M4.5 19.5 20 12 4.5 4.5l3 7.5-3 7.5Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            disabled={disabled || busy}
            onClick={() => setText(suggestion)}
            className={cx(
              "rounded-lg border border-[var(--rule-hairline)] bg-[var(--surface)] px-3 py-1.5 text-xs",
              "text-[var(--ink-muted)] transition-colors hover:border-[var(--rule-strong)] hover:text-[var(--ink-primary)]",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {suggestion}
          </button>
        ))}
      </div>

      {helper ? (
        <p className="text-xs leading-relaxed text-[var(--ink-muted)]">{helper}</p>
      ) : null}
    </div>
  );
}
