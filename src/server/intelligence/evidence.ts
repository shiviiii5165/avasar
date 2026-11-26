/**
 * Student skill evidence → per-skill state. Pure and deterministic.
 *
 * Every piece of evidence keeps its type, source, time and verification status; they are never collapsed into
 * one unqualified score. The state of a skill is derived by written rules (STATE_RULES), not by a model:
 *
 *   verified      at least one evidence item whose verification is "verified" (a person or proctored check
 *                 confirmed it: AI Tathastu-verified skill, verified assessment or project)
 *   demonstrated  a passed assessment, a project that uses the skill, or work experience linked to it
 *   practiced     AI Tathastu practice, a completed learning task, or an attempted (not passed) assessment
 *   learning      recent AI Tathastu activity that only shows the student is studying the topic (asked about it)
 *   declared      the student (or their imported profile) lists it, with nothing behind it yet
 *
 * "Asked about a topic" never counts as practice or proficiency. An inferred skill is never a state at all:
 * inference happens only in matching (related skills), always labelled there.
 */
import type { SkillRegistry } from "./registry";

export type EvidenceType =
  | "declared"              // student typed it in Avsar
  | "imported_profile"      // listed on the AI Tathastu profile (from resume, LinkedIn, GitHub there); not verified
  | "resume_extracted"      // suggested from the student's resume and confirmed by them
  | "project"               // a project on the profile uses it
  | "work_experience"       // a role the student linked to it
  | "certification"         // a certificate naming it (Avsar does not verify certificates)
  | "assessment"            // an assessment result
  | "ait_learning"          // AI Tathastu: asked about / studied the topic
  | "ait_practice"          // AI Tathastu: practiced or completed a learning task
  | "ait_project"           // AI Tathastu: demonstrated in a project
  | "ait_verified_skill";   // AI Tathastu's own verification of the skill

export type Verification = "unverified" | "source_reported" | "verified";
export type SkillState = "verified" | "demonstrated" | "practiced" | "learning" | "declared";

export interface EvidenceItem {
  skillName: string;
  type: EvidenceType;
  /** Opaque id of the thing that backs it (project id, AI Tathastu activity id...). */
  ref: string | null;
  /** Short human description ("Project: Expense tracker"). Never conversation text. */
  label: string;
  observedAt: Date | null;
  verification: Verification;
  provenance: "avsar" | "ai_tathastu";
  /** For assessments only: the raw result, as reported. */
  result?: { score: number; maxScore: number; passed: boolean | null } | null;
  /** A strength number the SOURCE reported (e.g. AI Tathastu's evidenceStrength). Shown as-is, never treated as a probability. */
  sourceStrength?: number | null;
}

export interface SkillProfileEntry {
  key: string;
  name: string;
  conceptId: string | null;
  state: SkillState;
  /** Why the state is what it is, in one sentence. */
  basis: string;
  /** The type of the evidence item that decided the state (null when only old learning activity remains). */
  basisType: EvidenceType | null;
  evidence: EvidenceItem[];
  lastEvidenceAt: Date | null;
  /** Comparable assessment results, newest first, and what they show. */
  trajectory: { latest: number | null; previous: number | null; change: "improved" | "declined" | "unchanged" | "not_comparable" };
  /** Evidence older than STALE_AFTER_DAYS is shown as such; it still counts. */
  stale: boolean;
  nextAction: string;
}

export const STATE_ORDER: SkillState[] = ["verified", "demonstrated", "practiced", "learning", "declared"];

/**
 * Student-facing vocabulary: the ONE place the words for each status live (skill explorer, career goal, cards,
 * listing detail). Two statuses are not skill states: "not_shown" (nothing on the profile supports a skill) and
 * "related" (only a related skill does, which is partial support, never proof).
 *
 * No "Verified" wording is shown to students (2026-11-26, owner decision): a formal assessment-based verification
 * (ERIS) doesn't exist yet, so the strongest state reads "Shown in your work", like work shown in a project. The
 * underlying states and evidence are unchanged; only these words are.
 */
export type SkillStatusKey = SkillState | "not_shown" | "related";
export const STATUS: Record<SkillStatusKey, { label: string; explain: string }> = {
  verified: { label: "Shown in your work", explain: "Your work on AI Tathastu (such as GitHub projects or assessments) shows this skill." },
  demonstrated: { label: "Shown in your work", explain: "A project, a job or a passed assessment on your profile uses this skill." },
  practiced: { label: "Practising", explain: "You've practised it or tried an assessment on AI Tathastu. It isn't shown in a project yet." },
  learning: { label: "Learning", explain: "You've been studying it on AI Tathastu recently. Studying a topic isn't proof of the skill yet." },
  declared: { label: "On your profile", explain: "You listed it, or it came from your resume or AI Tathastu profile. A project that uses it would show it in action." },
  not_shown: { label: "Not on your profile yet", explain: "Your profile doesn't mention this skill yet. That isn't the same as not having it." },
  related: { label: "Related skill", explain: "You have a closely related skill." },
};
export const STATE_LABEL: Record<SkillState, string> = Object.fromEntries(STATE_ORDER.map((s) => [s, STATUS[s].label])) as Record<SkillState, string>;

/** Precise words for a skill "shown in your work": says WHICH kind of work, so a job is never called a project. */
const SHOWN_BY: Partial<Record<EvidenceType, string>> = { project: "Shown in project", ait_project: "Shown in project", work_experience: "Used in a job", assessment: "Passed an assessment" };
export function statusLabel(e: Pick<SkillProfileEntry, "state" | "basisType">): string {
  return (e.state === "demonstrated" && e.basisType && SHOWN_BY[e.basisType]) || STATUS[e.state].label;
}
export const EVIDENCE_LABEL: Record<EvidenceType, string> = {
  declared: "You listed it",
  imported_profile: "On your AI Tathastu profile",
  resume_extracted: "From your resume",
  project: "Project",
  work_experience: "Work experience",
  certification: "Certificate",
  assessment: "Assessment",
  ait_learning: "Studied on AI Tathastu",
  ait_practice: "Practiced on AI Tathastu",
  ait_project: "Project on AI Tathastu",
  ait_verified_skill: "Your work on AI Tathastu",
};

export const LEARNING_RECENT_DAYS = 90;
export const STALE_AFTER_DAYS = 730;
const DAY = 86_400_000;

function stateOf(items: EvidenceItem[], now: Date): { state: SkillState; basis: string; basisType: EvidenceType | null } {
  const has = (pred: (e: EvidenceItem) => boolean) => items.find(pred);
  const v = has((e) => e.verification === "verified");
  if (v) return { state: "verified", basis: EVIDENCE_LABEL[v.type], basisType: v.type };
  const d = has((e) => (e.type === "assessment" && e.result?.passed === true) || e.type === "project" || e.type === "work_experience" || e.type === "ait_project");
  if (d) return { state: "demonstrated", basis: `${EVIDENCE_LABEL[d.type]}: ${d.label}`, basisType: d.type };
  const p = has((e) => e.type === "ait_practice" || (e.type === "assessment" && e.result?.passed !== true));
  if (p) return { state: "practiced", basis: `${EVIDENCE_LABEL[p.type]}: ${p.label}`, basisType: p.type };
  const l = has((e) => e.type === "ait_learning" && e.observedAt !== null && now.getTime() - e.observedAt.getTime() <= LEARNING_RECENT_DAYS * DAY);
  if (l) return { state: "learning", basis: "You've been studying this on AI Tathastu recently (no practice or result yet)", basisType: l.type };
  const decl = has((e) => ["declared", "imported_profile", "resume_extracted", "certification"].includes(e.type));
  return { state: "declared", basis: decl ? `${EVIDENCE_LABEL[decl.type]}, with no project, assessment or practice behind it yet` : "Older learning activity only", basisType: decl?.type ?? null };
}

function trajectoryOf(items: EvidenceItem[]): SkillProfileEntry["trajectory"] {
  // Only assessments with a numeric result are comparable; time spent is never progress.
  const results = items
    .filter((e) => e.type === "assessment" && e.result && e.result.maxScore > 0 && e.observedAt)
    .sort((a, b) => b.observedAt!.getTime() - a.observedAt!.getTime())
    .map((e) => Math.round((e.result!.score / e.result!.maxScore) * 100));
  if (results.length < 2) return { latest: results[0] ?? null, previous: null, change: "not_comparable" };
  const [latest, previous] = results;
  return { latest, previous, change: latest > previous ? "improved" : latest < previous ? "declined" : "unchanged" };
}

function nextActionFor(state: SkillState, name: string): string {
  switch (state) {
    case "declared": return `Add a project that uses ${name}, or practise it on AI Tathastu, so it has evidence behind it`;
    case "learning": return `Practise ${name} with a hands-on task on AI Tathastu`;
    case "practiced": return `Build a small project with ${name}, or pass an assessment, so it shows in your work`;
    case "demonstrated": return `Keep this work up to date and add new projects that use ${name}`;
    case "verified": return `Nothing needed; keep it current`;
  }
}

/** Groups evidence by canonical skill and derives each skill's state. `excluded` types are left out entirely (student's choice). */
export function buildSkillProfile(items: EvidenceItem[], reg: SkillRegistry, opts: { now?: Date; excluded?: readonly string[] } = {}): SkillProfileEntry[] {
  const now = opts.now ?? new Date();
  const excluded = new Set(opts.excluded ?? []);
  const groups = new Map<string, { name: string; items: EvidenceItem[] }>();
  for (const e of items) {
    if (excluded.has(e.type) || (excluded.has("ait_all") && e.provenance === "ai_tathastu")) continue;
    const key = reg.key(e.skillName);
    const g = groups.get(key) ?? { name: reg.displayName(key, e.skillName.trim()), items: [] };
    g.items.push(e);
    groups.set(key, g);
  }
  const out: SkillProfileEntry[] = [];
  for (const [key, g] of groups) {
    const { state, basis, basisType } = stateOf(g.items, now);
    const dates = g.items.map((e) => e.observedAt?.getTime()).filter((t): t is number => typeof t === "number");
    const last = dates.length ? new Date(Math.max(...dates)) : null;
    out.push({
      key,
      name: g.name,
      conceptId: key.startsWith("text:") ? null : key,
      state,
      basis,
      basisType,
      evidence: [...g.items].sort((a, b) => (b.observedAt?.getTime() ?? 0) - (a.observedAt?.getTime() ?? 0)),
      lastEvidenceAt: last,
      trajectory: trajectoryOf(g.items),
      stale: last !== null && now.getTime() - last.getTime() > STALE_AFTER_DAYS * DAY,
      nextAction: nextActionFor(state, g.name),
    });
  }
  return out.sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) || a.name.localeCompare(b.name));
}

// ─── Inputs → evidence items ──────────────────────────────────────────────
export interface EvidenceInputs {
  skills: { id: string; name: string; source: string; createdAt: Date | null }[];
  projects: { id: string; title: string; skills: string[]; source: string; createdAt: Date | null }[];
  experienceLinks: { skillName: string; experienceId: string; label: string; createdAt: Date | null }[];
  certifications: { id: string; name: string; source: string; issuedOn: string | null }[];
  aitSkills: { name: string; verified: boolean; evidenceStrength: number | null }[] | null;
  aitSyncedAt: Date | null;
  learning: { id: string; kind: string; skillName: string; title: string | null; score: number | null; maxScore: number | null; verified: boolean; occurredAt: Date; includedInProfile: boolean }[];
}

/** Builds evidence items from the profile records Avsar already has plus AI Tathastu learning events. */
export function collectEvidence(x: EvidenceInputs, reg: SkillRegistry): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  for (const s of x.skills) {
    items.push({ skillName: s.name, type: s.source === "ai_tathastu" ? "imported_profile" : "declared", ref: s.id, label: s.name, observedAt: s.createdAt, verification: s.source === "ai_tathastu" ? "source_reported" : "unverified", provenance: s.source === "ai_tathastu" ? "ai_tathastu" : "avsar" });
  }
  for (const p of x.projects) {
    for (const sk of p.skills) items.push({ skillName: sk, type: "project", ref: p.id, label: p.title, observedAt: p.createdAt, verification: p.source === "ai_tathastu" ? "source_reported" : "unverified", provenance: p.source === "ai_tathastu" ? "ai_tathastu" : "avsar" });
  }
  for (const l of x.experienceLinks) items.push({ skillName: l.skillName, type: "work_experience", ref: l.experienceId, label: l.label, observedAt: l.createdAt, verification: "unverified", provenance: "avsar" });
  for (const c of x.certifications) {
    // A certificate counts for a skill only when its name contains that skill's name or alias (no guessing).
    const id = reg.resolve(c.name) ?? reg.mentionedIn(c.name)[0] ?? null;
    if (!id) continue;
    items.push({ skillName: reg.displayName(id, c.name), type: "certification", ref: c.id, label: c.name, observedAt: c.issuedOn ? new Date(c.issuedOn) : null, verification: "unverified", provenance: c.source === "ai_tathastu" ? "ai_tathastu" : "avsar" });
  }
  for (const s of x.aitSkills ?? []) {
    if (!s.verified) continue; // unverified AI Tathastu skills already arrive as imported_profile skills
    items.push({ skillName: s.name, type: "ait_verified_skill", ref: null, label: "AI Tathastu verification", observedAt: x.aitSyncedAt, verification: "verified", provenance: "ai_tathastu", sourceStrength: s.evidenceStrength });
  }
  for (const e of x.learning) {
    if (!e.includedInProfile) continue;
    const result = e.score !== null && e.maxScore ? { score: e.score, maxScore: e.maxScore, passed: e.kind === "assessment_passed" ? true : e.kind === "assessment_attempted" ? false : null } : null;
    const type: EvidenceType =
      e.kind === "asked" ? "ait_learning"
      : e.kind === "practiced" || e.kind === "task_completed" ? "ait_practice"
      : e.kind === "project_demonstrated" ? "ait_project"
      : "assessment";
    items.push({
      skillName: e.skillName,
      type,
      ref: e.id,
      label: e.title ?? (type === "assessment" ? "Assessment" : "Learning activity"),
      observedAt: e.occurredAt,
      // Only a passed assessment or a demonstrated project can be verified; a "verified" flag on anything else is ignored.
      verification: e.verified && (e.kind === "assessment_passed" || e.kind === "project_demonstrated") ? "verified" : "source_reported",
      provenance: "ai_tathastu",
      result: type === "assessment" ? (result ?? { score: 0, maxScore: 0, passed: e.kind === "assessment_passed" }) : null,
    });
  }
  return items;
}
