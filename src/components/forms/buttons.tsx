"use client";

import { Bookmark, BookmarkCheck, EyeOff, Undo2 } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";

import { dismissAction, toggleSaveAction } from "@/app/actions/candidate";
import { buttonClass } from "@/components/ui";

/** Save toggle with an optimistic state that rolls back if the server refuses. */
export function SaveButton({ opportunityId, saved, path, iconOnly = false, title }: { opportunityId: string; saved: boolean; path: string; iconOnly?: boolean; title?: string }) {
  const [optimistic, setOptimistic] = useOptimistic(saved);
  const [pending, start] = useTransition();
  const toggle = () =>
    start(async () => {
      setOptimistic(!optimistic);
      await toggleSaveAction(opportunityId, path);
    });
  if (iconOnly) {
    return (
      <button
        type="button"
        aria-pressed={optimistic}
        aria-label={`${optimistic ? "Saved" : "Save"}${title ? `: ${title}` : ""}`}
        disabled={pending}
        onClick={toggle}
        className="grid size-9 place-items-center rounded-full text-navy transition-colors duration-150 hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-purple disabled:opacity-60"
      >
        {optimistic ? <BookmarkCheck aria-hidden className="size-5 fill-navy/15 text-purple" /> : <Bookmark aria-hidden className="size-5" />}
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={optimistic}
      disabled={pending}
      onClick={() =>
        start(async () => {
          setOptimistic(!optimistic);
          await toggleSaveAction(opportunityId, path);
        })
      }
      className={buttonClass("secondary", "md")}
    >
      {optimistic ? <BookmarkCheck aria-hidden className="size-4 text-purple" /> : <Bookmark aria-hidden className="size-4" />}
      {optimistic ? "Saved" : "Save"}
    </button>
  );
}

/** Submits its form only after a native confirmation (bulk or destructive actions). */
export function ConfirmButton({ label, message, variant = "danger", className = "" }: { label: string; message: string; variant?: "danger" | "secondary" | "primary"; className?: string }) {
  return (
    <button
      type="submit"
      className={buttonClass(variant, "sm", className)}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {label}
    </button>
  );
}

/**
 * "Not for me" on a recommendation (or "Show again" to undo). Hides the listing from this student's
 * recommendations only; it stays in search. The page re-renders from the server afterwards.
 */
export function DismissButton({ opportunityId, title, undo = false, iconOnly = false }: { opportunityId: string; title: string; undo?: boolean; iconOnly?: boolean }) {
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  if (iconOnly) {
    return (
      <button
        type="button"
        disabled={pending || failed}
        aria-label={`Not for me: hide ${title} from recommendations`}
        title={failed ? "Not available" : "Not for me"}
        onClick={() => start(async () => { const r = await dismissAction(opportunityId, true); if (!r.ok) setFailed(true); })}
        className="grid size-9 place-items-center rounded-full text-navy/70 transition-colors duration-150 hover:bg-white/70 hover:text-navy focus-visible:outline-2 focus-visible:outline-purple disabled:opacity-50"
      >
        <EyeOff aria-hidden className="size-4" />
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={undo ? `Show ${title} in recommendations again` : `Not for me: hide ${title} from recommendations`}
      onClick={() =>
        start(async () => {
          const r = await dismissAction(opportunityId, !undo);
          if (!r.ok) setFailed(true);
        })
      }
      className={buttonClass("ghost", "sm")}
    >
      {undo ? <Undo2 aria-hidden className="size-4" /> : <EyeOff aria-hidden className="size-4" />}
      {failed ? "Not available" : pending ? "Saving…" : undo ? "Show again" : "Not for me"}
    </button>
  );
}