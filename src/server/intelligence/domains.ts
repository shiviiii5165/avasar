/**
 * Career domains: what field an opportunity belongs to, so a marketing student sees marketing and an ML student sees ML.
 *
 * Classification is deterministic and explainable, in order of strength:
 *   1. title   the listing title names a known role ("Business Analyst Intern" → business_analyst → business_analysis)
 *   2. skills  the listed skills point mostly to one domain (≥ 60% of their weight)
 *   3. unknown nothing reliable: shown as "Field not specified", never guessed
 * Adding a domain = one entry here (and roles that point to it). The matcher never names a domain itself.
 */
import type { SkillRegistry } from "./registry";

export type DomainGroup = "technology" | "business" | "finance" | "marketing" | "creative" | "people" | "science" | "engineering" | "society" | "service";

export interface DomainDef { id: string; label: string; group: DomainGroup }

export const DOMAIN_GROUPS: Record<DomainGroup, { label: string }> = {
  technology: { label: "Technology" },
  business: { label: "Business & management" },
  finance: { label: "Finance & commerce" },
  marketing: { label: "Marketing & communication" },
  creative: { label: "Creative & design" },
  people: { label: "People, education & psychology" },
  science: { label: "Research, health & sciences" },
  engineering: { label: "Core engineering & architecture" },
  society: { label: "Law, policy & social impact" },
  service: { label: "Customer service" },
};

export const DOMAINS: DomainDef[] = [
  { id: "software_engineering", label: "Software engineering", group: "technology" },
  { id: "web_development", label: "Web development", group: "technology" },
  { id: "mobile_development", label: "Mobile development", group: "technology" },
  { id: "ai_ml", label: "AI / Machine learning", group: "technology" },
  { id: "data_science", label: "Data science", group: "technology" },
  { id: "data_analytics", label: "Data analytics", group: "technology" },
  { id: "cybersecurity", label: "Cybersecurity", group: "technology" },
  { id: "cloud_devops", label: "Cloud / DevOps", group: "technology" },
  { id: "qa_testing", label: "QA / Testing", group: "technology" },
  { id: "it_support", label: "IT support", group: "technology" },
  { id: "business_analysis", label: "Business analysis", group: "business" },
  { id: "business_development", label: "Business development", group: "business" },
  { id: "operations", label: "Operations", group: "business" },
  { id: "product_management", label: "Product management", group: "business" },
  { id: "project_management", label: "Project management", group: "business" },
  { id: "strategy_consulting", label: "Strategy & consulting", group: "business" },
  { id: "entrepreneurship", label: "Entrepreneurship", group: "business" },
  { id: "finance", label: "Finance & financial analysis", group: "finance" },
  { id: "accounting", label: "Accounting & commerce", group: "finance" },
  { id: "banking", label: "Banking", group: "finance" },
  { id: "investment_research", label: "Investment research", group: "finance" },
  { id: "risk_compliance", label: "Risk & compliance", group: "finance" },
  { id: "digital_marketing", label: "Digital marketing", group: "marketing" },
  { id: "social_media", label: "Social media", group: "marketing" },
  { id: "content_marketing", label: "Content marketing", group: "marketing" },
  { id: "brand_management", label: "Brand management", group: "marketing" },
  { id: "market_research", label: "Market research", group: "marketing" },
  { id: "public_relations", label: "PR & communication", group: "marketing" },
  { id: "sales", label: "Sales", group: "marketing" },
  { id: "ux_design", label: "UI/UX design", group: "creative" },
  { id: "graphic_design", label: "Graphic & visual design", group: "creative" },
  { id: "video_animation", label: "Video & animation", group: "creative" },
  { id: "photography", label: "Photography", group: "creative" },
  { id: "creative_writing", label: "Creative writing", group: "creative" },
  { id: "human_resources", label: "Human resources", group: "people" },
  { id: "psychology", label: "Psychology", group: "people" },
  { id: "education", label: "Education", group: "people" },
  { id: "research", label: "Research", group: "science" },
  { id: "healthcare_admin", label: "Healthcare administration", group: "science" },
  { id: "biotechnology", label: "Biotechnology", group: "science" },
  { id: "environmental", label: "Environment & sustainability", group: "science" },
  { id: "agriculture", label: "Agriculture", group: "science" },
  { id: "civil_engineering", label: "Civil engineering", group: "engineering" },
  { id: "mechanical_engineering", label: "Mechanical engineering", group: "engineering" },
  { id: "electrical_engineering", label: "Electrical & electronics", group: "engineering" },
  { id: "architecture", label: "Architecture", group: "engineering" },
  { id: "skilled_trades", label: "Skilled trades", group: "engineering" },
  { id: "legal", label: "Legal", group: "society" },
  { id: "public_policy", label: "Public policy", group: "society" },
  { id: "social_impact", label: "Social impact", group: "society" },
  { id: "customer_support", label: "Customer support", group: "service" },
];

const BY_ID = new Map(DOMAINS.map((d) => [d.id, d]));
export const domainDef = (id: string | null | undefined): DomainDef | undefined => (id ? BY_ID.get(id) : undefined);

/**
 * Domains close enough that a listing in one is a sensible "explore next door" pick for the other. Symmetric.
 * Kept short on purpose: adjacency earns partial role credit, so it must be a real overlap of work.
 */
const ADJACENT: [string, string][] = [
  ["data_analytics", "business_analysis"], ["data_analytics", "data_science"], ["data_science", "ai_ml"],
  ["software_engineering", "web_development"], ["software_engineering", "mobile_development"], ["software_engineering", "cloud_devops"],
  ["software_engineering", "qa_testing"], ["cloud_devops", "cybersecurity"], ["it_support", "cybersecurity"],
  ["business_analysis", "product_management"], ["business_analysis", "operations"], ["business_analysis", "strategy_consulting"],
  ["product_management", "project_management"], ["operations", "project_management"], ["strategy_consulting", "entrepreneurship"],
  ["business_development", "sales"], ["finance", "investment_research"], ["finance", "accounting"], ["finance", "banking"],
  ["banking", "risk_compliance"], ["finance", "strategy_consulting"],
  ["digital_marketing", "social_media"], ["digital_marketing", "content_marketing"], ["content_marketing", "social_media"],
  ["brand_management", "public_relations"], ["brand_management", "digital_marketing"], ["market_research", "brand_management"],
  ["market_research", "business_analysis"], ["content_marketing", "creative_writing"],
  ["ux_design", "graphic_design"], ["ux_design", "product_management"], ["graphic_design", "video_animation"], ["video_animation", "photography"],
  ["graphic_design", "social_media"], ["human_resources", "psychology"], ["psychology", "research"], ["education", "psychology"],
  ["research", "biotechnology"], ["research", "public_policy"], ["environmental", "agriculture"], ["environmental", "civil_engineering"],
  ["civil_engineering", "architecture"], ["mechanical_engineering", "electrical_engineering"], ["mechanical_engineering", "skilled_trades"],
  ["electrical_engineering", "skilled_trades"], ["legal", "public_policy"], ["public_policy", "social_impact"], ["customer_support", "sales"],
];
const ADJ = new Map<string, Set<string>>();
for (const [a, b] of ADJACENT) {
  if (!ADJ.has(a)) ADJ.set(a, new Set());
  if (!ADJ.has(b)) ADJ.set(b, new Set());
  ADJ.get(a)!.add(b);
  ADJ.get(b)!.add(a);
}

/** same: one domain · adjacent: listed above · group: same broad field · none. Ordered strongest first. */
export type DomainRelation = "same" | "adjacent" | "group" | "none";
export function domainRelation(a: string | null | undefined, b: string | null | undefined): DomainRelation {
  if (!a || !b) return "none";
  if (a === b) return "same";
  if (ADJ.get(a)?.has(b)) return "adjacent";
  return BY_ID.get(a)?.group && BY_ID.get(a)?.group === BY_ID.get(b)?.group ? "group" : "none";
}

/** Which domain a skill concept points to, by its category. Generic categories (office, communication) point nowhere. */
const CATEGORY_DOMAIN: Record<string, string | null> = {
  programming: "software_engineering", web: "web_development", data: "data_analytics", ai: "ai_ml", cloud: "cloud_devops",
  security: "cybersecurity", design: "ux_design", creative: "graphic_design", business: null, finance: "finance",
  marketing: "digital_marketing", communication: null, people: "human_resources", research: "research", science: "research",
  legal: "legal", society: "public_policy", trade: "skilled_trades", engineering: "mechanical_engineering", office: null,
};
/** Concepts whose domain is more specific than their category's default. */
const CONCEPT_DOMAIN: Record<string, string> = {
  machine_learning: "ai_ml", deep_learning: "ai_ml", statistics: "data_science", pandas: "data_science", numpy: "data_science",
  accounting: "accounting", tally: "accounting", gst: "accounting", taxation: "accounting", auditing: "accounting",
  banking_operations: "banking", risk_management: "risk_compliance", investment_research: "investment_research",
  business_analysis: "business_analysis", requirements_gathering: "business_analysis", business_development: "business_development",
  operations_management: "operations", product_management: "product_management", project_management: "project_management", agile: "project_management",
  business_strategy: "strategy_consulting", entrepreneurship: "entrepreneurship", sales: "sales", crm: "sales", negotiation: "sales",
  customer_support: "customer_support", market_research: "market_research", social_media: "social_media", content_writing: "content_marketing",
  seo: "digital_marketing", brand_management: "brand_management", public_relations: "public_relations",
  video_editing: "video_animation", animation: "video_animation", photography: "photography", creative_writing: "creative_writing",
  psychology: "psychology", teaching: "education", lab_techniques: "biotechnology", bioinformatics: "biotechnology",
  gis: "environmental", environmental_assessment: "environmental", agronomy: "agriculture", healthcare_admin: "healthcare_admin",
  staad_pro: "civil_engineering", structural_analysis: "civil_engineering", revit: "architecture", architectural_design: "architecture",
  electronics: "electrical_engineering", plc: "electrical_engineering", power_systems: "electrical_engineering", matlab: "electrical_engineering",
  android: "mobile_development", flutter: "mobile_development", react_native: "mobile_development", swift: "mobile_development", kotlin: "mobile_development",
  manual_testing: "qa_testing", selenium: "qa_testing", it_support: "it_support", networking: "it_support", policy_analysis: "public_policy",
  community_engagement: "social_impact", legal_research: "legal",
};

export function domainOfConcept(reg: SkillRegistry, conceptId: string): string | null {
  if (CONCEPT_DOMAIN[conceptId]) return CONCEPT_DOMAIN[conceptId];
  const c = reg.concept(conceptId);
  return c ? (CATEGORY_DOMAIN[c.category] ?? null) : null;
}

export type ClassificationBasis = "title" | "skills" | "unknown";
export interface Classification {
  domain: string | null;
  roleId: string | null;
  roleTitle: string | null;
  basis: ClassificationBasis;
  /** high: the title names a known role · medium: listed skills point clearly to one domain · low/none: unreliable. */
  confidence: "high" | "medium" | "low" | "none";
}

/** Required skills count double, as in matching. */
export function classifyOpportunity(reg: SkillRegistry, o: { title: string; skills: { name: string; required: boolean; origin?: string }[] }): Classification {
  const role = reg.roleFor(o.title);
  if (role && BY_ID.has(role.domain)) return { domain: role.domain, roleId: role.id, roleTitle: role.title, basis: "title", confidence: "high" };

  const votes = new Map<string, number>();
  let total = 0;
  for (const s of o.skills) {
    if (s.origin === "text_mentioned") continue; // only what the listing itself lists
    const id = reg.resolve(s.name);
    const d = id ? domainOfConcept(reg, id) : null;
    const w = s.required ? 2 : 1;
    total += w;
    if (d) votes.set(d, (votes.get(d) ?? 0) + w);
  }
  const [best] = [...votes.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  if (best && total && best[1] / total >= 0.6) return { domain: best[0], roleId: null, roleTitle: null, basis: "skills", confidence: best[1] >= 3 ? "medium" : "low" };
  return { domain: null, roleId: null, roleTitle: null, basis: "unknown", confidence: "none" };
}

/** The student's domains: from their chosen target roles (explicit), never from protected attributes. */
export function domainsForTargets(reg: SkillRegistry, targetRoles: string[]): string[] {
  const out: string[] = [];
  for (const t of targetRoles) {
    const d = reg.roleFor(t)?.domain;
    if (d && !out.includes(d)) out.push(d);
  }
  return out;
}

/**
 * Search intent: "BA internship", "ML intern", "marketing internship" → the role/domain they mean, plus whatever
 * words are left over (searched as text). Null when the query names no known role (plain text search then).
 */
export function searchIntent(reg: SkillRegistry, q: string): { domain: string; roleId: string; label: string } | null {
  const role = reg.roleFor(q);
  return role ? { domain: role.domain, roleId: role.id, label: role.title } : null;
}
