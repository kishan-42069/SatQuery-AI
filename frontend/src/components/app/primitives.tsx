/**
 * The handful of shapes every analysis screen repeats.
 *
 * Kept small on purpose — this is not a component library, it's the set of
 * things that would otherwise be copy-pasted four times and drift. Anything
 * used once lives in the screen that uses it.
 */

import type { ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Uppercase letterspaced kicker above a page or section title. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-rule)]">
      {children}
    </p>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 space-y-1.5">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h1 className="font-[family-name:var(--font-serif-display)] text-[2rem] leading-tight tracking-[-0.01em] text-[var(--ink-primary)]">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--ink-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={cx(
        // backdrop-blur matters only in dark mode, where --surface is
        // translucent so the star field shows through: without it the
        // panels look like dirty glass rather than lit surfaces. It's a
        // no-op over the opaque light-mode surface.
        "rounded-lg border border-[var(--rule-hairline)] bg-[var(--surface)] backdrop-blur-md",
        padded && "p-5",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PanelTitle({
  children,
  trailing,
}: {
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="font-[family-name:var(--font-serif-display)] text-lg text-[var(--ink-primary)]">
        {children}
      </h2>
      {trailing}
    </div>
  );
}

/** Label/value row used for image metadata and run provenance. */
export function DataRow({
  label,
  value,
  mono = false,
}: {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className="shrink-0 text-[var(--ink-muted)]">{label}</dt>
      <dd
        className={cx(
          "min-w-0 truncate text-right font-medium text-[var(--ink-primary)]",
          mono && "font-[family-name:var(--font-geist-mono)] text-[13px]",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

type Tone = "neutral" | "ok" | "warn" | "error" | "active";

const TONE_STYLES: Record<Tone, string> = {
  neutral:
    "border-[var(--rule-hairline)] bg-[var(--surface-sunken)] text-[var(--ink-muted)]",
  ok: "border-transparent bg-[color-mix(in_srgb,var(--state-ok)_12%,transparent)] text-[var(--state-ok)]",
  warn: "border-transparent bg-[color-mix(in_srgb,var(--state-warn)_14%,transparent)] text-[var(--state-warn)]",
  error:
    "border-transparent bg-[color-mix(in_srgb,var(--state-error)_12%,transparent)] text-[var(--state-error)]",
  active: "border-transparent bg-[var(--brand-rule-soft)] text-[var(--brand-rule)]",
};

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        TONE_STYLES[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
}) {
  const variants = {
    primary:
      "bg-[var(--brand-deep)] text-[var(--brand-on-deep)] hover:bg-[var(--brand-deep-hover)] border-transparent",
    secondary:
      "bg-[var(--surface)] text-[var(--ink-primary)] hover:bg-[var(--surface-sunken)] border-[var(--rule-strong)]",
    ghost:
      "bg-transparent text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-sunken)] border-transparent",
  } as const;

  const sizes = {
    sm: "px-2.5 py-1 text-xs",
    md: "px-3.5 py-2 text-sm",
  } as const;

  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-md border font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-deep)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Shown wherever a screen has nothing to render. Takes a `hint` because an
 * empty analysis list and an unreachable API look identical otherwise, and
 * the difference is the whole diagnosis.
 */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--rule-strong)] px-6 py-12 text-center">
      <p className="text-sm font-medium text-[var(--ink-primary)]">{title}</p>
      {hint ? (
        <p className="max-w-md text-sm leading-relaxed text-[var(--ink-muted)]">
          {hint}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorNotice({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-[color-mix(in_srgb,var(--state-error)_35%,transparent)] bg-[color-mix(in_srgb,var(--state-error)_8%,transparent)] px-4 py-3 text-sm leading-relaxed text-[var(--state-error)]"
    >
      {children}
    </div>
  );
}

/** Skeleton bar for list/table loading, sized by the caller. */
export function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        "animate-pulse rounded bg-[var(--surface-sunken)]",
        className,
      )}
    />
  );
}
