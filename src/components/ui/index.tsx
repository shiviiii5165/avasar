import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { AlertTriangle, Clock3, Inbox, Lock, SearchX, ServerCrash, WifiOff } from "lucide-react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ── Buttons ─────────────────────────────────────────────────────────────── */
type Variant = "primary" | "secondary" | "ghost" | "danger";
const BUTTON: Record<Variant, string> = {
  primary: "bg-gradient-to-r from-purple to-purple-deep text-white shadow-lift hover:brightness-110",
  secondary: "border border-line bg-surface text-navy hover:bg-surface-muted",
  ghost: "text-navy hover:bg-surface-muted",
  danger: "bg-danger text-white hover:brightness-110",
};
const SIZE = { sm: "h-9 px-3 text-sm", md: "h-11 px-5 text-sm", lg: "h-13 px-7 text-base" } as const;

export function buttonClass(variant: Variant = "primary", size: keyof typeof SIZE = "md", extra = "") {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-[filter,background-color] duration-150 disabled:cursor-not-allowed disabled:opacity-60",
    BUTTON[variant],
    SIZE[size],
    extra,
  );
}

export function Button({ variant = "primary", size = "md", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant; size?: keyof typeof SIZE }) {
  return <button {...props} className={buttonClass(variant, size, className)} />;
}

export function ButtonLink({ variant = "primary", size = "md", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: keyof typeof SIZE }) {
  return <Link {...props} className={buttonClass(variant, size, className)} />;
}

/* ── Surfaces ────────────────────────────────────────────────────────────── */
export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div {...props} className={cx("rounded-lg border border-line bg-surface p-5 shadow-card", className)} />;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-serif text-3xl text-navy sm:text-4xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

type Tone = "neutral" | "purple" | "orange" | "success" | "warning" | "danger";
const TONE: Record<Tone, string> = {
  neutral: "bg-surface-muted text-navy-soft",
  purple: "bg-purple-soft text-purple",
  orange: "bg-peach-soft text-orange-deep",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};
export function Badge({ tone = "neutral", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", TONE[tone], className)}>{children}</span>;
}

/* ── Forms ───────────────────────────────────────────────────────────────── */
export function Field({ label, htmlFor, hint, error, required, children }: { label: string; htmlFor: string; hint?: string; error?: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-navy">
        {label}
        {required && <span className="text-danger" aria-hidden> *</span>}
      </label>
      {children}
      {hint && !error && <p id={`${htmlFor}-hint`} className="text-xs text-muted">{hint}</p>}
      {error && <p id={`${htmlFor}-error`} role="alert" className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

export const inputClass =
  "block w-full rounded-md border border-line bg-surface px-3 py-2.5 text-base text-ink placeholder:text-muted/70 focus:border-purple sm:text-sm aria-[invalid=true]:border-danger";

/* ── States: every screen uses these instead of ad-hoc messages ─────────── */
type StateKind = "empty" | "error" | "forbidden" | "notFound" | "expired" | "rateLimited" | "offline" | "unavailable";
const STATES: Record<StateKind, { icon: typeof Inbox; title: string; body: string }> = {
  empty: { icon: Inbox, title: "Nothing here yet", body: "When there is something to show, it will appear here." },
  error: { icon: AlertTriangle, title: "Something went wrong", body: "We couldn't complete that. Please try again." },
  forbidden: { icon: Lock, title: "You don't have access", body: "Your account doesn't have permission to view this." },
  notFound: { icon: SearchX, title: "Not found", body: "This page or record doesn't exist or is no longer available." },
  expired: { icon: Clock3, title: "This has expired", body: "The deadline has passed or the link is no longer valid." },
  rateLimited: { icon: Clock3, title: "Too many requests", body: "Please wait a moment and try again." },
  offline: { icon: WifiOff, title: "You're offline", body: "Check your connection and try again." },
  unavailable: { icon: ServerCrash, title: "Temporarily unavailable", body: "A service we depend on isn't responding. Core features still work." },
};

export function StateMessage({ kind, title, body, action }: { kind: StateKind; title?: string; body?: string; action?: ReactNode }) {
  const s = STATES[kind];
  const Icon = s.icon;
  return (
    <div role={kind === "error" || kind === "unavailable" ? "alert" : "status"} className="flex flex-col items-center rounded-lg border border-dashed border-line bg-surface px-6 py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-purple-soft text-purple">
        <Icon aria-hidden className="size-5" />
      </span>
      <h2 className="mt-3 text-base font-semibold text-navy">{title ?? s.title}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted">{body ?? s.body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export { cx };
