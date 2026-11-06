"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import { useOptimistic, useTransition } from "react";

import { toggleSaveAction } from "@/app/actions/candidate";
import { buttonClass } from "@/components/ui";

/** Save toggle with an optimistic state that rolls back if the server refuses. */
export function SaveButton({ opportunityId, saved, path }: { opportunityId: string; saved: boolean; path: string }) {
  const [optimistic, setOptimistic] = useOptimistic(saved);
  const [pending, start] = useTransition();
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
