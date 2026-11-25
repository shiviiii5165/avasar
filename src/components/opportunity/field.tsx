import { Briefcase, Compass, Cpu, FlaskConical, HardHat, Headset, Landmark, Megaphone, Palette, Scale, Users, type LucideIcon } from "lucide-react";

import { domainDef, type DomainGroup } from "@/server/intelligence/domains";

/**
 * A listing's career field, shown as an icon + label chip with the field's accent. The accent is decoration;
 * the label carries the meaning, so it reads the same without colour. Unknown fields say so plainly.
 */
type FieldStyle = { chip: string; bar: string; Icon: LucideIcon };

// Full class names (not built from parts) so Tailwind keeps them.
export const FIELD_STYLE: Record<DomainGroup | "unknown", FieldStyle> = {
  technology: { chip: "bg-field-tech-soft text-field-tech", bar: "bg-field-tech", Icon: Cpu },
  business: { chip: "bg-field-business-soft text-field-business", bar: "bg-field-business", Icon: Briefcase },
  finance: { chip: "bg-field-finance-soft text-field-finance", bar: "bg-field-finance", Icon: Landmark },
  marketing: { chip: "bg-field-marketing-soft text-field-marketing", bar: "bg-field-marketing", Icon: Megaphone },
  creative: { chip: "bg-field-creative-soft text-field-creative", bar: "bg-field-creative", Icon: Palette },
  people: { chip: "bg-field-people-soft text-field-people", bar: "bg-field-people", Icon: Users },
  science: { chip: "bg-field-science-soft text-field-science", bar: "bg-field-science", Icon: FlaskConical },
  engineering: { chip: "bg-field-engineering-soft text-field-engineering", bar: "bg-field-engineering", Icon: HardHat },
  society: { chip: "bg-field-society-soft text-field-society", bar: "bg-field-society", Icon: Scale },
  service: { chip: "bg-field-service-soft text-field-service", bar: "bg-field-service", Icon: Headset },
  unknown: { chip: "bg-surface-muted text-muted", bar: "bg-line", Icon: Compass },
};

export function fieldStyle(domainId: string | null | undefined): FieldStyle {
  return FIELD_STYLE[domainDef(domainId)?.group ?? "unknown"];
}

export function FieldChip({ domainId, inferred = false }: { domainId: string | null | undefined; inferred?: boolean }) {
  const d = domainDef(domainId);
  const { chip, Icon } = fieldStyle(domainId);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${chip}`} title={inferred ? "Field worked out from the listed skills" : undefined}>
      <Icon aria-hidden className="size-3.5" />
      <span className="sr-only">Field: </span>
      {d ? d.label : "Field not specified"}
      {d && inferred && <span className="font-normal opacity-80"> · from skills</span>}
    </span>
  );
}
