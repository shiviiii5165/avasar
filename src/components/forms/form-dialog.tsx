"use client";

import { Pencil, Plus, Upload, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import type { ActionState } from "@/app/actions/candidate";
import { buttonClass } from "@/components/ui";

import { ActionForm, SubmitButton } from "./action-form";

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;
const ICONS = { add: Plus, edit: Pencil, upload: Upload } as const;

/**
 * A compact button that opens a form in a modal dialog (native <dialog>: focus is trapped inside, Escape and the
 * backdrop close it, focus returns to the button). Save runs the server action; on success the dialog closes, the
 * page re-renders from the server in place (revalidatePath), and a short confirmation is announced.
 * Each opening starts from a fresh form, so a cancelled edit never leaves stale input or messages behind.
 */
export function FormDialog({
  label,
  title,
  description,
  action,
  submitLabel = "Save",
  icon = "add",
  variant = "secondary",
  iconOnly = false,
  children,
}: {
  label: string;
  title: string;
  description?: string;
  action: Action;
  submitLabel?: string;
  icon?: keyof typeof ICONS;
  variant?: "primary" | "secondary" | "ghost";
  /** Show only the icon (the label stays as the accessible name), for per-row Edit buttons. */
  iconOnly?: boolean;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [round, setRound] = useState(0);
  const [done, setDone] = useState(false);
  const titleId = useId();
  const Icon = ICONS[icon];

  const open = () => {
    setRound((r) => r + 1);
    setDone(false);
    dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();

  // The confirmation stays a few seconds, then goes (no timer while nothing is showing).
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 3500);
    return () => clearTimeout(t);
  }, [done]);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const onClose = () => opener.current?.focus();
    d.addEventListener("close", onClose);
    return () => d.removeEventListener("close", onClose);
  }, []);

  return (
    <>
      <button
        ref={opener}
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
        className={iconOnly ? "flex size-9 items-center justify-center rounded-full text-muted transition-colors duration-150 hover:bg-purple-soft hover:text-purple focus-visible:outline-2 focus-visible:outline-purple" : buttonClass(variant, "sm")}
      >
        <Icon aria-hidden className="size-4" />
        {!iconOnly && label}
      </button>
      <span role="status" aria-live="polite" className={done ? "fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white shadow-lift motion-safe:animate-[dialog-in_160ms_ease-out] lg:bottom-8" : "sr-only"}>
        {done ? `${title}: saved` : ""}
      </span>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClick={(e) => {
          if (e.target === e.currentTarget) close(); // a click on the backdrop
        }}
        className="m-auto w-[min(36rem,calc(100vw-1.5rem))] max-h-[min(90vh,52rem)] overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-ink shadow-lift backdrop:bg-navy/40 open:motion-safe:animate-[dialog-in_160ms_ease-out]"
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg font-semibold text-navy">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
            <button type="button" onClick={close} aria-label="Close" className="-m-1 rounded-full p-2 text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-navy focus-visible:outline-2 focus-visible:outline-purple">
              <X aria-hidden className="size-4" />
            </button>
          </div>
          <ActionForm
            key={round}
            action={action}
            className="mt-4"
            onSuccess={() => {
              setDone(true);
              close();
            }}
            footer={
              <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap justify-end gap-2 border-t border-line bg-surface px-5 py-4 sm:-mx-6 sm:-mb-6 sm:px-6">
                <button type="button" onClick={close} className={buttonClass("ghost", "md")}>Cancel</button>
                <SubmitButton label={submitLabel} />
              </div>
            }
          >
            {children}
          </ActionForm>
        </div>
      </dialog>
    </>
  );
}
