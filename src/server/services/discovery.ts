import "server-only";

import { classifyOpportunity, DOMAIN_GROUPS, DOMAINS, searchIntent, type DomainGroup } from "../intelligence/domains";
import { registry } from "../intelligence/registry";
import type { OpportunityFull, SearchInput } from "./opportunities";

/**
 * Discovery rules shared by public Explore and the signed-in Opportunities page, so a listing is classified,
 * filtered and counted the same way everywhere (they may present it differently, never contradict each other).
 *
 *  - Field filter: the listing's career field from intelligence/domains.ts (title role first, then a clear majority
 *    of its own listed skills; generic skills such as Excel or communication point to no field).
 *  - Role-intent search: a query naming a role ("ML intern", "BA internship") searches that role's field, plus
 *    listings whose title, employer, summary or skills contain the words.
 */
export function discoveryRules(query: Pick<SearchInput, "q" | "field">) {
  const reg = registry();
  const cache = new Map<string, string | null>();
  const fieldOf = (o: OpportunityFull) => {
    if (!cache.has(o.id)) cache.set(o.id, classifyOpportunity(reg, o).domain);
    return cache.get(o.id)!;
  };
  const intent = query.q ? searchIntent(reg, query.q) : null;
  const needle = query.q?.toLowerCase() ?? "";
  const textHit = (o: OpportunityFull) => [o.title, o.organizationName, o.summary ?? "", ...o.skills.map((s) => s.name)].some((t) => t.toLowerCase().includes(needle));
  const keep = query.field || intent ? (o: OpportunityFull) => (!query.field || fieldOf(o) === query.field) && (!intent || fieldOf(o) === intent.domain || textHit(o)) : undefined;
  /** The query sent to the database: a role-intent query is matched in memory (field OR text), not as plain SQL text. */
  const dbQuery = <T extends Pick<SearchInput, "q">>(q: T): T => ({ ...q, q: intent ? undefined : q.q });
  return { fieldOf, intent, keep, dbQuery };
}

/** Field filter options: fields the open (canonical) listings actually have, grouped, with unique-opening counts. */
export function fieldOptions(open: OpportunityFull[], fieldOf: (o: OpportunityFull) => string | null, selected?: string) {
  const counts = new Map<string, number>();
  for (const o of open) {
    const f = fieldOf(o);
    if (f) counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  if (selected && !counts.has(selected)) counts.set(selected, 0);
  return (Object.keys(DOMAIN_GROUPS) as DomainGroup[])
    .map((g) => ({ group: g, label: DOMAIN_GROUPS[g].label, fields: DOMAINS.filter((d) => d.group === g && counts.has(d.id)).map((d) => ({ id: d.id, label: d.label, count: counts.get(d.id)! })) }))
    .filter((x) => x.fields.length);
}
export type FieldOptions = ReturnType<typeof fieldOptions>;
