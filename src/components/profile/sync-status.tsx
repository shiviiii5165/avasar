import Link from "next/link";
import { CheckCircle2, CircleAlert, RefreshCw } from "lucide-react";

import { buttonClass } from "@/components/ui";

const timeAgo = (d: Date) => {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h} hours ago` : d.toLocaleDateString("en-IN");
};

/** Where the profile came from and whether the last import worked. Never a completion score. */
export function SyncStatusCard({ status, syncedAt, error, provider, compact = false }: { status: string; syncedAt: Date | null; error: string | null; provider: string; compact?: boolean }) {
  const refresh = "/api/auth/login?prompt=none&returnTo=/app/profile%3Fsynced%3D1";
  if (provider === "dev") {
    return (
      <p className="rounded-lg border border-dashed border-orange/50 bg-peach-soft/40 px-4 py-3 text-sm text-navy-soft">
        Development persona: there is no AI Tathastu profile to import. Information shown is what you added in Avsar.
      </p>
    );
  }
  const ok = status === "ok" || status === "partial";
  if (compact) {
    // One line for pages where the import is context, not the subject.
    const when = syncedAt ? ` ${timeAgo(syncedAt)}` : "";
    const text = {
      ok: `Profile imported from AI Tathastu${when}.`,
      partial: `Profile imported from AI Tathastu${when}. Some sections weren't shared.`,
      failed: "Couldn't import your AI Tathastu profile. Matching uses what you added in Avsar.",
      never: "Your AI Tathastu profile hasn't been imported yet.",
    }[status as "ok" | "partial" | "failed" | "never"] ?? "Your AI Tathastu profile status is unknown.";
    return (
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span className="flex items-center gap-1.5">
          {ok ? <CheckCircle2 aria-hidden className="size-4 shrink-0 text-success" /> : <CircleAlert aria-hidden className="size-4 shrink-0 text-warning" />}
          {text}
        </span>
        <Link href="/app/profile" className="font-semibold text-purple hover:underline">{ok ? "View profile" : "Fix in profile"}</Link>
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3">
      <p className="flex items-start gap-2 text-sm">
        {ok ? <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" /> : <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />}
        <span>
          {status === "ok" && <>Profile imported from AI Tathastu {syncedAt ? timeAgo(syncedAt) : ""}.</>}
          {status === "partial" && <>Imported from AI Tathastu {syncedAt ? timeAgo(syncedAt) : ""}. Some sections weren&apos;t shared with Avsar; that&apos;s your choice and never counts against you.</>}
          {status === "failed" && <>We couldn&apos;t import your AI Tathastu profile{error ? `: ${error}` : ""}. You can still browse and apply.</>}
          {status === "never" && <>Your AI Tathastu profile hasn&apos;t been imported yet.</>}
        </span>
      </p>
      <a href={refresh} className={buttonClass("secondary", "sm")}>
        <RefreshCw aria-hidden className="size-4" /> Refresh from AI Tathastu
      </a>
    </div>
  );
}
