import { STATUS, type SkillStatusKey } from "@/server/intelligence/evidence";

import { STATUS_STYLE } from "./status-style";

/** A skill's evidence status: colour dot + words, with the plain-language explanation as its tooltip. */
export function StatusPill({ state, label, className = "" }: { state: SkillStatusKey; label?: string; className?: string }) {
  return (
    <span title={STATUS[state].explain} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLE[state].chip} ${className}`}>
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: STATUS_STYLE[state].dot }} />
      {label ?? STATUS[state].label}
    </span>
  );
}
