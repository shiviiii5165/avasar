/**
 * SYNTHETIC evaluation data. Every person, employer and listing here is invented for testing; none is real.
 * Relevance labels (0 = not relevant, 1 = reasonable, 2 = strong) were assigned BY HAND from the case each
 * student represents, before any scoring was run, and are not computed by the model under test.
 * Offline metrics on this set say how the ranking behaves on these cases; they do not predict placements.
 */
import type { CandidateFacts, OpportunityFacts } from "../../domain/types";
import type { ListingSkill } from "../career-match";
import type { EvidenceItem } from "../evidence";

const D = (iso: string) => new Date(iso);
export const EVAL_NOW = D("2026-11-24T00:00:00Z");

export interface EvalListing { id: string; employer: string; facts: OpportunityFacts & { skills: ListingSkill[] } }
export interface EvalStudent { id: string; case: string; group: "A" | "B"; facts: CandidateFacts; evidence: EvidenceItem[]; targetRoles: string[]; labels: Record<string, 0 | 1 | 2> }

const opp = (title: string, skills: [string, boolean][], over: Partial<OpportunityFacts> = {}): OpportunityFacts & { skills: ListingSkill[] } => ({
  title, category: "job", workMode: "remote", locations: [], country: "India", compMin: null, compMax: null, compPeriod: null, unpaid: false,
  deadline: D("2027-02-01"), startDate: null, experienceMinYears: null, eligibility: null, ...over,
  skills: skills.map(([name, required]) => ({ name, required, origin: "listed" as const })),
});
const elig = (e: Partial<NonNullable<OpportunityFacts["eligibility"]>>): OpportunityFacts["eligibility"] => ({ educationLevels: null, graduationYearMin: null, graduationYearMax: null, minExperienceYears: null, requiredCertifications: null, allowedLocations: null, requiresWorkAuthorizationIndia: false, ...e });

export const LISTINGS: EvalListing[] = [
  { id: "L01", employer: "Synthetic Analytics", facts: opp("Data analyst", [["SQL", true], ["Excel", true], ["Power BI", false]]) },
  { id: "L02", employer: "Synthetic Retail", facts: opp("MIS executive", [["Excel", true], ["Data analysis", true]], { workMode: "onsite", locations: ["Pune"] }) },
  { id: "L03", employer: "Synthetic Web", facts: opp("Frontend developer", [["JavaScript", true], ["React", true], ["CSS", true]]) },
  { id: "L04", employer: "Synthetic SaaS", facts: opp("Full stack developer", [["JavaScript", true], ["Node.js", true], ["SQL", true], ["React", false]]) },
  { id: "L05", employer: "Synthetic AI Labs", facts: opp("Machine learning engineer", [["Python", true], ["Machine learning", true], ["PyTorch", false]]) },
  { id: "L06", employer: "Synthetic AI Labs", facts: opp("Data scientist", [["Python", true], ["Statistics", true], ["Machine learning", true]], { eligibility: elig({ educationLevels: ["masters"] }) }) },
  { id: "L07", employer: "Synthetic Cloud", facts: opp("DevOps engineer", [["Linux", true], ["Docker", true], ["CI/CD", true], ["Kubernetes", false]], { eligibility: elig({ minExperienceYears: 2 }) }) },
  { id: "L08", employer: "Synthetic Accounts Co", facts: opp("Accounts executive", [["Tally", true], ["GST", true], ["Excel", false]], { workMode: "onsite", locations: ["Nagpur"] }) },
  { id: "L09", employer: "Synthetic Motors", facts: opp("Trade apprentice fitter", [["Fitter", true]], { category: "apprenticeship", workMode: "onsite", locations: ["Pune"], eligibility: elig({ educationLevels: ["diploma", "secondary"] }) }) },
  { id: "L10", employer: "Synthetic Motors", facts: opp("CNC operator", [["CNC", true], ["Quality control", false]], { workMode: "onsite", locations: ["Pune"] }) },
  { id: "L11", employer: "Synthetic Media", facts: opp("Digital marketing executive", [["Digital marketing", true], ["SEO", false], ["Content writing", false]]) },
  { id: "L12", employer: "Synthetic BPO", facts: opp("Customer support executive", [["English communication", true], ["Customer support", true], ["Hindi", false]]) },
  { id: "L13", employer: "Synthetic Design", facts: opp("UI/UX designer", [["UX design", true], ["Figma", true]]) },
  { id: "L14", employer: "Synthetic Analytics", facts: opp("Business analyst (closed)", [["SQL", true], ["Excel", true]], { deadline: D("2026-10-01") }) },
  { id: "L15", employer: "Synthetic New Co", facts: opp("Junior data analyst", [["SQL", true], ["Tableau", false]]) }, // a brand-new listing (no interactions anywhere)
  { id: "L16", employer: "Synthetic Apps", facts: opp("Android developer", [["Android development", true], ["Kotlin", false]]) },
];

const facts = (over: Partial<CandidateFacts> = {}): CandidateFacts => ({
  education: [{ level: "bachelors", graduationYear: 2026, field: null }], experiences: [], skills: [], certifications: [], city: null, country: "India",
  workAuthorizedIndia: null, preferredLocations: [], workModes: [], preferredRoles: [], preferredCategories: [], expectedCompMin: null, compPeriod: null, availableFrom: null, ...over,
});
const e = (skillName: string, type: EvidenceItem["type"], extra: Partial<EvidenceItem> = {}): EvidenceItem => ({ skillName, type, ref: null, label: skillName, observedAt: D("2026-11-01"), verification: "unverified", provenance: "avsar", ...extra });

export const STUDENTS: EvalStudent[] = [
  { id: "S01", case: "strong exact skill match (data)", group: "A", facts: facts(), targetRoles: ["Data analyst"], evidence: [e("SQL", "project"), e("Excel", "project"), e("Power BI", "declared"), e("Data analysis", "project")], labels: { L01: 2, L02: 2, L15: 2, L14: 0, L04: 0 } },
  { id: "S02", case: "same student, different institution (fairness twin of S01)", group: "B", facts: facts(), targetRoles: ["Data analyst"], evidence: [e("SQL", "project"), e("Excel", "project"), e("Power BI", "declared"), e("Data analysis", "project")], labels: { L01: 2, L02: 2, L15: 2, L14: 0, L04: 0 } },
  { id: "S03", case: "semantic match: Tableau and PostgreSQL instead of Power BI and SQL", group: "A", facts: facts(), targetRoles: [], evidence: [e("PostgreSQL", "project"), e("Tableau", "project"), e("Excel", "declared")], labels: { L01: 2, L15: 2, L02: 1 } },
  { id: "S04", case: "required skill missing (has CSS/HTML, lacks JavaScript)", group: "B", facts: facts(), targetRoles: ["Frontend developer"], evidence: [e("HTML", "project"), e("CSS", "project")], labels: { L03: 1, L13: 0, L04: 0 } },
  { id: "S05", case: "only preferred skill missing (React)", group: "A", facts: facts(), targetRoles: [], evidence: [e("JavaScript", "project"), e("Node.js", "project"), e("SQL", "declared")], labels: { L04: 2, L03: 1 } },
  { id: "S06", case: "eligibility not met (bachelor's for a master's-only role)", group: "B", facts: facts(), targetRoles: ["Data scientist"], evidence: [e("Python", "project"), e("Statistics", "assessment", { result: { score: 40, maxScore: 50, passed: true } }), e("Machine learning", "project")], labels: { L05: 2, L06: 0 } },
  { id: "S07", case: "eligibility unknown (education not given) for a master's-only role", group: "A", facts: facts({ education: [] }), targetRoles: [], evidence: [e("Python", "project"), e("Statistics", "project"), e("Machine learning", "project")], labels: { L06: 2, L05: 2 } },
  { id: "S08", case: "new student, no skills, no interactions", group: "B", facts: facts(), targetRoles: [], evidence: [], labels: {} },
  { id: "S09", case: "AI Tathastu learning evidence (practising React, asked about Docker)", group: "A", facts: facts(), targetRoles: ["Frontend developer"], evidence: [e("JavaScript", "project"), e("CSS", "declared"), e("React", "ait_practice", { provenance: "ai_tathastu" }), e("Docker", "ait_learning", { provenance: "ai_tathastu" })], labels: { L03: 2, L04: 1, L07: 0 } },
  { id: "S10", case: "verified project, no certificate (ML)", group: "B", facts: facts(), targetRoles: ["Machine learning engineer"], evidence: [e("Python", "ait_project", { verification: "verified", provenance: "ai_tathastu" }), e("Machine learning", "ait_project", { verification: "verified", provenance: "ai_tathastu" }), e("PyTorch", "project")], labels: { L05: 2, L06: 1 } },
  { id: "S11", case: "nontraditional path: ITI diploma, trade skills, no degree", group: "A", facts: facts({ education: [{ level: "diploma", graduationYear: 2025, field: null }] }), targetRoles: ["Fitter apprentice"], evidence: [e("Fitter", "work_experience"), e("Turner", "declared")], labels: { L09: 2, L10: 1 } },
  { id: "S12", case: "no work experience, accounts", group: "B", facts: facts(), targetRoles: ["Accountant"], evidence: [e("Tally", "project"), e("GST", "declared"), e("Excel", "declared")], labels: { L08: 2, L02: 1 } },
  { id: "S13", case: "sparse profile: one declared skill", group: "A", facts: facts(), targetRoles: [], evidence: [e("Figma", "declared")], labels: { L13: 2 } },
  { id: "S14", case: "DevOps learner without the required 2 years", group: "B", facts: facts({ experiences: [] }), targetRoles: [], evidence: [e("Linux", "project"), e("Docker", "project"), e("CI/CD", "ait_practice", { provenance: "ai_tathastu" })], labels: { L07: 1 } },
];

/** Skill-extraction ground truth: skills a reader would say each text mentions (registry concept ids). */
export const EXTRACTION_CASES: { text: string; skills: string[] }[] = [
  { text: "We need strong SQL and Power BI skills. Python is a plus.", skills: ["sql", "powerbi", "python"] },
  { text: "Spring internship for the rest of the summer. Excellent communication skills required.", skills: ["english_communication"] },
  { text: "Build REST APIs in Node.js with PostgreSQL; Docker and Kubernetes experience preferred.", skills: ["rest_api", "nodejs", "postgres", "docker", "kubernetes"] },
  { text: "Tally Prime, GST filing and advanced Excel for our accounts team.", skills: ["tally", "gst", "excel"] },
  { text: "Apprentice in CNC operation and quality inspection at our Pune plant.", skills: ["cnc", "quality_control"] },
  { text: "Design mobile screens in Figma; know UI/UX design principles.", skills: ["figma", "ux_design"] },
];

/** Duplicate-detection ground truth: pairs of synthetic records and whether they are the same vacancy. */
export const DUPLICATE_PAIRS = (() => {
  const base = { sourceId: "s1", sourceRecordId: "1", urls: ["https://jobs.synthetic.example/1"], fingerprint: "f", title: "Data Analyst", organization: "Synthetic Analytics Pvt Ltd", locations: ["Pune"], workMode: "onsite", description: "Analyse sales data with SQL and build weekly dashboards for the operations team.", deadline: D("2026-12-31") as Date | null };
  const other = (o: Partial<typeof base>) => ({ ...base, sourceId: "s2", sourceRecordId: "x", urls: [], fingerprint: "g", ...o });
  return [
    { a: base, b: other({ urls: ["https://jobs.synthetic.example/1?utm_source=feed"] }), same: true },
    { a: base, b: other({ organization: "Synthetic Analytics Private Limited", description: base.description + " Apply by December." }), same: true },
    { a: base, b: other({ locations: ["Pune", "Mumbai"], deadline: D("2026-12-31"), description: "Data analyst role: SQL dashboards for operations." }), same: true },
    { a: base, b: other({ organization: "Other Synthetic Corp" }), same: false },
    { a: base, b: other({ locations: ["Chennai"] }), same: false },
    { a: base, b: other({ description: "Marketing analytics: campaign reporting, attribution and media budgets.", deadline: null }), same: false },
    { a: base, b: other({ title: "Senior Data Analyst", description: base.description }), same: false },
  ];
})();
