"use client";

import { Flag } from "lucide-react";

import { reportAction } from "@/app/actions/candidate";
import { ActionForm, Select, Textarea } from "@/components/forms/action-form";
import { REPORT_REASON_OPTIONS } from "./report-reasons";

export function ReportForm({ opportunityId }: { opportunityId: string }) {
  return (
    <details className="rounded-xl border border-line bg-surface p-4 text-sm">
      <summary className="flex cursor-pointer items-center gap-2 font-semibold text-navy"><Flag aria-hidden className="size-4 text-danger" /> Report this listing</summary>
      <p className="mt-2 text-muted">Legitimate employers never ask candidates to pay to apply or to get a job. If something feels wrong, tell us.</p>
      <ActionForm action={reportAction} submitLabel="Send report" className="mt-3">
        <input type="hidden" name="opportunityId" value={opportunityId} />
        <Select name="reason" label="What's wrong?" required defaultValue="">
          <option value="" disabled>Choose a reason</option>
          {REPORT_REASON_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <Textarea name="details" label="Details (optional)" maxLength={2000} />
      </ActionForm>
    </details>
  );
}
