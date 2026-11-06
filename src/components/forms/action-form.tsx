"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";

import { buttonClass } from "@/components/ui";
import type { ActionState } from "@/app/actions/candidate";

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;
const FormContext = createContext<{ errors: Record<string, string>; pending: boolean }>({ errors: {}, pending: false });

/** Field errors for inputs inside an ActionForm (null when the field is fine). */
export function useFieldError(name: string): string | null {
  return useContext(FormContext).errors[name] ?? null;
}

/**
 * Server-action form with pending state, an announced status message and field errors.
 * Submits through a transition so typed input is KEPT when validation fails (React would otherwise reset
 * the form after every action); clears only on success when resetOnSuccess is set. Without JavaScript the
 * native form action still runs.
 */
export function ActionForm({ action, children, submitLabel, className = "", resetOnSuccess = false }: { action: Action; children: ReactNode; submitLabel?: string; className?: string; resetOnSuccess?: boolean }) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <FormContext.Provider value={{ errors: state?.errors ?? {}, pending }}>
      <form
        ref={ref}
        action={formAction}
        noValidate
        className={`space-y-4 ${className}`}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
          startTransition(() => formAction(fd));
        }}
      >
        {children}
        <div aria-live="polite">
          {state?.message && (
            <p role={state.ok ? "status" : "alert"} className={`rounded-md px-3 py-2 text-sm ${state.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
              {state.message}
            </p>
          )}
          {!state?.ok && state?.errors && Object.keys(state.errors).length > 0 && !state.message && (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">Please fix the highlighted fields.</p>
          )}
        </div>
        {submitLabel && <SubmitButton label={submitLabel} />}
      </form>
    </FormContext.Provider>
  );
}

export function SubmitButton({ label, variant = "primary", className = "" }: { label: string; variant?: "primary" | "secondary" | "danger"; className?: string }) {
  const { pending } = useContext(FormContext);
  return (
    <button type="submit" disabled={pending} aria-disabled={pending} className={buttonClass(variant, "md", className)}>
      {pending ? "Working…" : label}
    </button>
  );
}

/** A labelled input that reads its error from the surrounding ActionForm. */
export function Input({ name, label, hint, required, className = "", ...props }: React.ComponentProps<"input"> & { name: string; label: string; hint?: string }) {
  const error = useFieldError(name);
  const id = props.id ?? `f-${name}`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-navy">
        {label}
        {required && <span aria-hidden className="text-danger"> *</span>}
      </label>
      <input
        {...props}
        id={id}
        name={name}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={`block w-full rounded-md border border-line bg-surface px-3 py-2.5 text-base text-ink placeholder:text-muted/70 focus:border-purple aria-[invalid=true]:border-danger sm:text-sm ${className}`}
      />
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

export function Textarea({ name, label, hint, required, className = "", ...props }: React.ComponentProps<"textarea"> & { name: string; label: string; hint?: string }) {
  const error = useFieldError(name);
  const id = props.id ?? `f-${name}`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-navy">
        {label}
        {required && <span aria-hidden className="text-danger"> *</span>}
      </label>
      <textarea
        {...props}
        id={id}
        name={name}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={`block min-h-28 w-full rounded-md border border-line bg-surface px-3 py-2.5 text-base text-ink focus:border-purple aria-[invalid=true]:border-danger sm:text-sm ${className}`}
      />
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

export function Select({ name, label, children, required, ...props }: React.ComponentProps<"select"> & { name: string; label: string }) {
  const error = useFieldError(name);
  const id = props.id ?? `f-${name}`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-navy">
        {label}
        {required && <span aria-hidden className="text-danger"> *</span>}
      </label>
      <select {...props} id={id} name={name} required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className="block w-full rounded-md border border-line bg-surface px-3 py-2.5 text-base text-ink focus:border-purple sm:text-sm">
        {children}
      </select>
      {error && <p id={`${id}-error`} className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}
