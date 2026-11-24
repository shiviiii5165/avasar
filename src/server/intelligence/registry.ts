/**
 * Skill registry: resolves any spelling to one canonical concept, and answers how two concepts relate.
 * Pure (no database): build it from the curated data, or from rows loaded by services/skill-registry.ts.
 */
import { normalizeSkill } from "../domain/skills";
import { CONCEPTS, RELATIONS, ROLES, type ConceptDef, type RoleDef } from "./registry-data";

export interface Concept { id: string; name: string; category: string; parentId: string | null; textExtractable: boolean }
export interface Role { id: string; title: string; aliases: string[]; essential: string[]; optional: string[] }

/** Aliases that are ordinary English words or surnames ("the rest of", "spring internship", "Mr Turner"): never matched in free text. */
const AMBIGUOUS_IN_TEXT = new Set(["rest", "spring", "nodejs", "node", "accounts", "sales", "typing", "turner", "fitter", "android", "containers", "accounting"]);

/** How a candidate's concept relates to a required one. Ordered from strongest to weakest. */
export type Relation = "exact" | "specialization" | "related" | "none";

export class SkillRegistry {
  private readonly byId = new Map<string, Concept>();
  private readonly alias = new Map<string, string>();
  /** Spellings as written (lowercase), for free-text search: normalization can join words ("power bi" → "powerbi"). */
  private readonly textAlias = new Map<string, string>();
  private readonly related = new Map<string, Set<string>>();
  private readonly prereqOf = new Map<string, Set<string>>(); // concept → its prerequisites
  readonly roles: Role[];

  constructor(concepts: (Omit<Concept, "textExtractable"> & { textExtractable?: boolean; aliases?: string[] })[], relations: [string, string, "related" | "prerequisite"][], roles: Role[]) {
    for (const c of concepts) {
      this.byId.set(c.id, { id: c.id, name: c.name, category: c.category, parentId: c.parentId ?? null, textExtractable: c.textExtractable !== false });
      for (const a of [c.id.replace(/_/g, " "), c.name, ...(c.aliases ?? [])]) {
        const k = normalizeSkill(a);
        if (k && !this.alias.has(k)) this.alias.set(k, c.id);
        for (const t of [k, a.toLowerCase().trim()]) if (t && !this.textAlias.has(t)) this.textAlias.set(t, c.id);
      }
    }
    for (const [from, to, kind] of relations) {
      if (!this.byId.has(from) || !this.byId.has(to) || from === to) continue;
      if (kind === "related") {
        this.add(this.related, from, to);
        this.add(this.related, to, from);
      } else this.add(this.prereqOf, to, from);
    }
    this.roles = roles.filter((r) => [...r.essential, ...r.optional].every((id) => this.byId.has(id)));
  }

  private add(m: Map<string, Set<string>>, k: string, v: string) {
    if (!m.has(k)) m.set(k, new Set());
    m.get(k)!.add(v);
  }

  /** Canonical concept id for a skill name, or null when the registry doesn't know it (kept as free text). */
  resolve(name: string): string | null {
    return this.alias.get(normalizeSkill(name)) ?? null;
  }

  /** Stable comparison key: the concept id when known, else the normalized text. */
  key(name: string): string {
    return this.resolve(name) ?? `text:${normalizeSkill(name)}`;
  }

  concept(id: string): Concept | undefined {
    return this.byId.get(id);
  }

  displayName(key: string, fallback: string): string {
    return this.byId.get(key)?.name ?? fallback;
  }

  prerequisites(id: string): string[] {
    return [...(this.prereqOf.get(id) ?? [])];
  }

  relatedTo(id: string): string[] {
    return [...(this.related.get(id) ?? [])];
  }

  /**
   * How having `have` relates to a requirement for `want`:
   *  exact          same concept
   *  specialization `have` is a child of `want` (PostgreSQL demonstrates SQL); never the reverse
   *  related        an explicit "related" link (partial, always labelled as related, never as the skill itself)
   */
  relation(have: string, want: string): Relation {
    if (have === want) return "exact";
    let p = this.byId.get(have)?.parentId ?? null;
    for (let depth = 0; p && depth < 5; depth++) {
      if (p === want) return "specialization";
      p = this.byId.get(p)?.parentId ?? null;
    }
    return this.related.get(have)?.has(want) ? "related" : "none";
  }

  /**
   * Skills mentioned verbatim in free text (word-bounded, ambiguous names excluded). Used only to label a
   * listing's description ("mentioned"), never to create a required skill or to claim a student has one.
   */
  mentionedIn(text: string): string[] {
    const t = ` ${text.toLowerCase().replace(/[^a-z0-9+#./ ]+/g, " ").replace(/\s+/g, " ")} `;
    const found = new Set<string>();
    for (const [alias, id] of this.textAlias) {
      const c = this.byId.get(id)!;
      if (!c.textExtractable || alias.length < 3 || AMBIGUOUS_IN_TEXT.has(alias)) continue;
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`(?<![a-z0-9+#])${escaped}(?![a-z0-9+#])`).test(t)) found.add(id);
    }
    return [...found].sort();
  }

  /** Target role for a free-text role or job title: exact alias first, then an alias contained in the title. */
  roleFor(title: string): Role | null {
    const t = title.toLowerCase().replace(/[^a-z0-9/+ -]+/g, " ").replace(/\s+/g, " ").trim();
    if (!t) return null;
    const exact = this.roles.find((r) => r.aliases.includes(t) || r.title.toLowerCase() === t);
    if (exact) return exact;
    let best: { role: Role; len: number } | null = null;
    for (const r of this.roles) for (const a of r.aliases) if (a.length >= 6 && t.includes(a) && (!best || a.length > best.len)) best = { role: r, len: a.length };
    return best?.role ?? null;
  }

  get size() {
    return this.byId.size;
  }
}

export function curatedRegistry(): SkillRegistry {
  return new SkillRegistry(
    CONCEPTS.map((c: ConceptDef) => ({ id: c.id, name: c.name, category: c.category, parentId: c.parent ?? null, aliases: c.aliases, textExtractable: c.textExtractable })),
    RELATIONS,
    ROLES.map((r: RoleDef) => ({ ...r })),
  );
}

let cached: SkillRegistry | null = null;
/** The curated registry (process-wide). Imported taxonomies are merged by services/skill-registry.ts. */
export function registry(): SkillRegistry {
  return (cached ??= curatedRegistry());
}
