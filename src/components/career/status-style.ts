import type { SkillStatusKey } from "@/server/intelligence/evidence";

/**
 * One colour per evidence status, used by the bubbles, chips, bars and legends on the career page so a colour
 * always means the same thing. The label always travels with the colour: nothing is told by colour alone.
 * Bubble fills run light → deep; white labels sit on the deep half (≥ 4.5:1). Full class strings so Tailwind keeps them.
 */
export interface StatusStyle { light: string; deep: string; chip: string; dot: string; outlined?: boolean }

export const STATUS_STYLE: Record<SkillStatusKey, StatusStyle> = {
  verified: { light: "#10b981", deep: "#065f46", dot: "#059669", chip: "bg-[#e6f6ee] text-[#05603f] ring-[#a7e3c6]" },
  demonstrated: { light: "#8b5cf6", deep: "#5b21b6", dot: "#7c3aed", chip: "bg-[#f1ebfe] text-[#5b21b6] ring-[#d5c6fb]" },
  practiced: { light: "#06b6d4", deep: "#155e75", dot: "#0891b2", chip: "bg-[#e4f5f9] text-[#155e75] ring-[#b4e2ee]" },
  learning: { light: "#fb923c", deep: "#9a3412", dot: "#ea580c", chip: "bg-[#fff0e6] text-[#9a3412] ring-[#fcd2b4]" },
  declared: { light: "#eef4ff", deep: "#1e40af", dot: "#60a5fa", chip: "bg-[#eaf1ff] text-[#1e40af] ring-[#c3d6fb]", outlined: true },
  related: { light: "#ffffff", deep: "#475569", dot: "#94a3b8", chip: "bg-surface text-[#475569] ring-[#cbd5e1]", outlined: true },
  not_shown: { light: "#f7f5f2", deep: "#5f6283", dot: "#d6d0c6", chip: "bg-surface-muted text-muted ring-line", outlined: true },
};

/** Display order: strongest evidence first. */
export const STATUS_ORDER: SkillStatusKey[] = ["verified", "demonstrated", "practiced", "learning", "declared", "related", "not_shown"];
