import type { SkillStatusKey } from "@/server/intelligence/evidence";

/**
 * One colour per evidence status, used by the bubbles, chips, bars and legends on the career page so a colour
 * always means the same thing. The label always travels with the colour: nothing is told by colour alone.
 * Bubble fills run light → deep; white labels sit on the deep half (≥ 4.5:1). Full class strings so Tailwind keeps them.
 */
export interface StatusStyle { light: string; deep: string; chip: string; dot: string; outlined?: boolean }

export const STATUS_STYLE: Record<SkillStatusKey, StatusStyle> = {
  // Shown to students exactly like "demonstrated" (no separate "Verified" look until formal verification exists).
  verified: { light: "#8b5cf6", deep: "#5b21b6", dot: "#7c3aed", chip: "bg-[#f1ebfe] text-[#5b21b6] ring-[#d5c6fb]" },
  demonstrated: { light: "#8b5cf6", deep: "#5b21b6", dot: "#7c3aed", chip: "bg-[#f1ebfe] text-[#5b21b6] ring-[#d5c6fb]" },
  practiced: { light: "#06b6d4", deep: "#155e75", dot: "#0891b2", chip: "bg-[#e4f5f9] text-[#155e75] ring-[#b4e2ee]" },
  learning: { light: "#fb923c", deep: "#9a3412", dot: "#ea580c", chip: "bg-[#fff0e6] text-[#9a3412] ring-[#fcd2b4]" },
  declared: { light: "#eef4ff", deep: "#1e40af", dot: "#60a5fa", chip: "bg-[#eaf1ff] text-[#1e40af] ring-[#c3d6fb]", outlined: true },
  related: { light: "#ffffff", deep: "#475569", dot: "#94a3b8", chip: "bg-surface text-[#475569] ring-[#cbd5e1]", outlined: true },
  not_shown: { light: "#f7f5f2", deep: "#5f6283", dot: "#d6d0c6", chip: "bg-surface-muted text-muted ring-line", outlined: true },
};

/** Display order: strongest evidence first. */
export const STATUS_ORDER: SkillStatusKey[] = ["verified", "demonstrated", "practiced", "learning", "declared", "related", "not_shown"];

/**
 * Bubble colours: one per skill, only to tell skills apart (the same palette as AI Tathastu's skill network).
 * Nothing is tied to a skill's name: colours are dealt out in order of the student's own evidence (best-evidenced
 * first, name as tie-break), across ALL their skills, so a skill keeps its colour when filters change.
 * "deep" carries white 11px labels at ≥ 4.5:1.
 */
export const SKILL_PALETTE = [
  { light: "#a78bfa", deep: "#5b21b6" }, // violet
  { light: "#22d3ee", deep: "#0e7490" }, // cyan
  { light: "#34d399", deep: "#047857" }, // emerald
  { light: "#fb923c", deep: "#c2410c" }, // coral
  { light: "#f472b6", deep: "#be185d" }, // pink
  { light: "#60a5fa", deep: "#1d4ed8" }, // blue
  { light: "#2dd4bf", deep: "#0f766e" }, // turquoise
  { light: "#e879f9", deep: "#a21caf" }, // magenta
] as const;
export type SkillColour = (typeof SKILL_PALETTE)[number] & { index: number };

export function skillColours(skills: { key: string; name: string; evidenceCount: number }[]): Map<string, SkillColour> {
  const order = [...skills].sort((a, b) => b.evidenceCount - a.evidenceCount || a.name.localeCompare(b.name));
  return new Map(order.map((s, k) => [s.key, { ...SKILL_PALETTE[k % SKILL_PALETTE.length], index: k % SKILL_PALETTE.length }]));
}
