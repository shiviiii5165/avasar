import { EVIDENCE_LABEL, STATUS, statusLabel, type EvidenceType, type SkillProfileEntry, type SkillState } from "@/server/intelligence/evidence";

/**
 * The student's evidence-based skill profile in the shape the skill explorer draws. Pure; built on the server
 * from buildSkillProfile's output, so the explorer never has a second source of truth. Every number is a count
 * of recorded evidence items; every link is a project or job the two skills actually share.
 */
export interface SkillSource { kind: string; detail: string | null; date: string | null; verified: boolean }
export interface SkillView {
  key: string;
  name: string;
  state: SkillState;
  label: string;
  explain: string;
  /** Number of evidence items on record (listing it, each project, job, certificate, assessment, AI Tathastu event). */
  evidenceCount: number;
  sources: SkillSource[];
  lastEvidence: string | null;
  stale: boolean;
  nextAction: string;
  assessments: string | null;
  /** "Essential for Data Analyst" when the skill is part of the student's first career goal. */
  goal: string | null;
}
/** Two skills used in the same project or job. `shared` = how many projects or jobs they share. */
export interface SkillLink { source: string; target: string; via: string; shared: number }

const fmt = (d: Date | null) => (d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null);
/** Evidence that is a shared piece of work: two skills used in it are "used together". */
const SHARED: ReadonlySet<EvidenceType> = new Set(["project", "ait_project", "work_experience"]);
const CHANGE = { improved: "went up", declined: "went down", unchanged: "stayed the same" } as const;

export function skillViews(skills: SkillProfileEntry[], goal?: { title: string; skills: { conceptId: string; importance: "essential" | "optional" }[] } | null): SkillView[] {
  const goalOf = new Map(goal?.skills.map((s) => [s.conceptId, s.importance]) ?? []);
  return skills.map((s) => {
    const imp = s.conceptId ? goalOf.get(s.conceptId) : undefined;
    const t = s.trajectory;
    return {
      key: s.key,
      name: s.name,
      state: s.state,
      label: statusLabel(s),
      explain: STATUS[s.state].explain,
      evidenceCount: s.evidence.length,
      sources: s.evidence.slice(0, 8).map((e) => ({
        kind: EVIDENCE_LABEL[e.type],
        // The label repeats the skill name for a plain listing; only show it when it names a project, job or activity.
        detail: e.type !== "ait_verified_skill" && e.label && e.label.toLowerCase() !== s.name.toLowerCase() && e.label.toLowerCase() !== e.skillName.toLowerCase() ? e.label : null,
        date: fmt(e.observedAt),
        verified: e.verification === "verified",
      })),
      lastEvidence: fmt(s.lastEvidenceAt),
      stale: s.stale,
      nextAction: s.nextAction,
      assessments: t.change !== "not_comparable" ? `Your last two assessment results ${CHANGE[t.change]}: ${t.previous}% → ${t.latest}%` : t.latest !== null ? `Latest assessment result: ${t.latest}%` : null,
      goal: imp && goal ? `${imp === "essential" ? "Essential" : "Useful"} for ${goal.title}` : null,
    };
  });
}

/** Skills recorded in the same project or job. Each pair once, named by the first shared piece of work. */
export function skillLinks(skills: SkillProfileEntry[]): SkillLink[] {
  const byWork = new Map<string, { label: string; keys: Set<string> }>();
  for (const s of skills)
    for (const e of s.evidence) {
      if (!SHARED.has(e.type) || !e.ref) continue;
      const id = `${e.type}:${e.ref}`;
      const w = byWork.get(id) ?? { label: e.label, keys: new Set<string>() };
      w.keys.add(s.key);
      byWork.set(id, w);
    }
  const out = new Map<string, SkillLink>();
  for (const w of byWork.values()) {
    const keys = [...w.keys].sort();
    for (let i = 0; i < keys.length; i++)
      for (let j = i + 1; j < keys.length; j++) {
        const id = `${keys[i]}|${keys[j]}`;
        const l = out.get(id);
        if (l) l.shared++;
        else out.set(id, { source: keys[i], target: keys[j], via: w.label, shared: 1 });
      }
  }
  return [...out.values()];
}
