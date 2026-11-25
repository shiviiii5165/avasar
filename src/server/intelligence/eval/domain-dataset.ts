/**
 * SYNTHETIC cross-domain evaluation (added 2026-11 for domain-aware discovery). Every student, employer and listing
 * is invented. Labels (0 = not relevant, 1 = reasonable / adjacent, 2 = strong) were written BY HAND from each
 * student's stated goal and skills before scoring was run. Domain students are ranked against the WHOLE pool
 * (these listings plus the original technical ones), so technical listings have to compete for a place.
 */
import type { CandidateFacts, OpportunityFacts } from "../../domain/types";
import type { ListingSkill } from "../career-match";
import type { EvidenceItem } from "../evidence";
import { EVAL_NOW, LISTINGS, type EvalListing } from "./dataset";

const D = (iso: string) => new Date(iso);
const opp = (title: string, skills: [string, boolean][], over: Partial<OpportunityFacts> = {}): OpportunityFacts & { skills: ListingSkill[] } => ({
  title, category: "internship", workMode: "remote", locations: [], country: "India", compMin: null, compMax: null, compPeriod: null, unpaid: false,
  deadline: D("2027-02-01"), startDate: null, experienceMinYears: null, eligibility: null, ...over,
  skills: skills.map(([name, required]) => ({ name, required, origin: "listed" as const })),
});

/** Each listing carries its hand-assigned field, used to check the classifier. null = no field can honestly be given. */
export const DOMAIN_LISTINGS: (EvalListing & { domain: string | null })[] = [
  { id: "L17", employer: "Synthetic Consulting", domain: "business_analysis", facts: opp("Business Analyst Intern", [["Requirements gathering", true], ["Excel", true], ["SQL", false], ["Stakeholder management", false]]) },
  { id: "L18", employer: "Synthetic Logistics", domain: "operations", facts: opp("Operations Intern", [["Excel", true], ["Operations", false], ["Problem solving", false]]) },
  { id: "L19", employer: "Synthetic Brands", domain: "digital_marketing", facts: opp("Marketing Intern", [["Digital marketing", true], ["Social media", false], ["Content writing", false]]) },
  { id: "L20", employer: "Synthetic Studio", domain: "social_media", facts: opp("Social Media Intern", [["Social media", true], ["Canva", false], ["Content writing", false]]) },
  { id: "L21", employer: "Synthetic Insights", domain: "market_research", facts: opp("Market Research Intern", [["Market research", true], ["Excel", false], ["Presentation skills", false]]) },
  { id: "L22", employer: "Synthetic Capital", domain: "finance", facts: opp("Finance Intern", [["Financial analysis", true], ["Excel", true], ["Financial modelling", false]]) },
  { id: "L23", employer: "Synthetic Securities", domain: "investment_research", facts: opp("Equity Research Intern", [["Financial analysis", true], ["Financial modelling", true], ["Investment research", false]]) },
  { id: "L24", employer: "Synthetic Product Co", domain: "ux_design", facts: opp("UI/UX Design Intern", [["UX design", true], ["Figma", true], ["Wireframing", false]]) },
  { id: "L25", employer: "Synthetic Print", domain: "graphic_design", facts: opp("Graphic Design Intern", [["Graphic design", true], ["Photoshop", false], ["Canva", false]]) },
  { id: "L26", employer: "Synthetic People Co", domain: "human_resources", facts: opp("HR Intern", [["Recruitment", true], ["English communication", false], ["MS Office", false]]) },
  { id: "L27", employer: "Synthetic Staffing", domain: "human_resources", facts: opp("Talent Acquisition Intern", [["Recruitment", true], ["HR operations", false]]) },
  { id: "L28", employer: "Synthetic Engines", domain: "mechanical_engineering", facts: opp("Mechanical Engineering Intern", [["AutoCAD", true], ["SolidWorks", true], ["Manufacturing processes", false]], { workMode: "onsite", locations: ["Pune"] }) },
  { id: "L29", employer: "Synthetic University Lab", domain: "research", facts: opp("Research Assistant", [["Research methods", true], ["SPSS", false], ["Academic writing", false]], { category: "research" }) },
  { id: "L30", employer: "Synthetic Policy Centre", domain: "public_policy", facts: opp("Policy Research Intern", [["Policy analysis", true], ["Research methods", false]]) },
  { id: "L31", employer: "Synthetic Vision AI", domain: "ai_ml", facts: opp("Machine Learning Intern", [["Python", true], ["Machine learning", true], ["Statistics", false]]) },
  { id: "L32", employer: "Synthetic Data Labs", domain: "data_science", facts: opp("Data Science Intern", [["Python", true], ["Statistics", true], ["pandas", false]]) },
  { id: "L33", employer: "Synthetic Media House", domain: "content_marketing", facts: opp("Content Writing Intern", [["Content writing", true], ["SEO", false]]) },
  { id: "L34", employer: "Synthetic Retail", domain: "sales", facts: opp("Sales Intern", [["Sales", true], ["English communication", true]]) },
  { id: "L35", employer: "Synthetic Web Works", domain: "software_engineering", facts: opp("Python Developer Intern", [["Python", true], ["Django", true], ["SQL", false]]) },
  { id: "L36", employer: "Synthetic Ads", domain: "digital_marketing", facts: opp("Marketing Analytics Intern (closed)", [["Campaign analytics", true], ["Excel", false]], { deadline: D("2026-10-15") }) },
  { id: "L37", employer: "Synthetic Builders", domain: "civil_engineering", facts: opp("Civil Site Intern", [["AutoCAD", true], ["STAAD.Pro", false]], { workMode: "onsite", locations: ["Nagpur"] }) },
  { id: "L38", employer: "Synthetic Group", domain: null, facts: opp("Summer Internship 2027", [["Excel", false], ["English communication", false]]) },
];

export const DOMAIN_POOL: EvalListing[] = [...LISTINGS, ...DOMAIN_LISTINGS];

const facts = (over: Partial<CandidateFacts> = {}): CandidateFacts => ({
  education: [{ level: "bachelors", graduationYear: 2026, field: null }], experiences: [], skills: [], certifications: [], city: null, country: "India",
  workAuthorizedIndia: null, preferredLocations: [], workModes: [], preferredRoles: [], preferredCategories: [], expectedCompMin: null, compPeriod: null, availableFrom: null, ...over,
});
const e = (skillName: string, type: EvidenceItem["type"]): EvidenceItem => ({ skillName, type, ref: null, label: skillName, observedAt: D("2026-11-01"), verification: "unverified", provenance: "avsar" });

export interface DomainStudent { id: string; domain: string; technical: boolean; targetRoles: string[]; facts: CandidateFacts; evidence: EvidenceItem[]; labels: Record<string, 0 | 1 | 2> }

export const DOMAIN_STUDENTS: DomainStudent[] = [
  { id: "D01", domain: "ai_ml", technical: true, targetRoles: ["Machine Learning Engineer"], facts: facts(), evidence: [e("Python", "project"), e("Machine learning", "project"), e("Statistics", "declared"), e("pandas", "project")],
    labels: { L31: 2, L05: 2, L32: 2, L35: 1, L06: 0, L36: 0 } },
  { id: "D02", domain: "business_analysis", technical: false, targetRoles: ["Business Analyst"], facts: facts(), evidence: [e("Excel", "project"), e("SQL", "declared"), e("Requirements gathering", "declared"), e("English communication", "declared"), e("Problem solving", "declared")],
    labels: { L17: 2, L01: 1, L15: 1, L18: 1, L21: 1, L14: 0 } },
  { id: "D03", domain: "digital_marketing", technical: false, targetRoles: ["Digital Marketing Executive"], facts: facts(), evidence: [e("Digital marketing", "project"), e("Social media", "project"), e("Content writing", "declared"), e("Canva", "declared")],
    labels: { L19: 2, L11: 2, L20: 2, L33: 1, L21: 1, L36: 0 } },
  { id: "D04", domain: "finance", technical: false, targetRoles: ["Financial Analyst"], facts: facts(), evidence: [e("Excel", "project"), e("Financial analysis", "project"), e("Accounting", "declared")],
    labels: { L22: 2, L23: 1, L08: 1 } },
  { id: "D05", domain: "ux_design", technical: false, targetRoles: ["UI/UX Designer"], facts: facts(), evidence: [e("UX design", "project"), e("Figma", "project"), e("Canva", "declared"), e("Photoshop", "declared")],
    labels: { L24: 2, L13: 2, L25: 1, L20: 1 } },
  { id: "D06", domain: "human_resources", technical: false, targetRoles: ["HR Executive"], facts: facts(), evidence: [e("Recruitment", "declared"), e("English communication", "project"), e("MS Office", "declared")],
    labels: { L26: 2, L27: 2, L12: 1 } },
  { id: "D07", domain: "mechanical_engineering", technical: false, targetRoles: ["Mechanical Engineer"], facts: facts(), evidence: [e("AutoCAD", "project"), e("SolidWorks", "project"), e("Quality control", "declared")],
    labels: { L28: 2, L10: 1, L37: 1, L09: 0 } },
  { id: "D08", domain: "research", technical: false, targetRoles: ["Research Assistant"], facts: facts(), evidence: [e("Research methods", "project"), e("Statistics", "declared"), e("SPSS", "declared"), e("Academic writing", "project")],
    labels: { L29: 2, L30: 1 } },
];

/** Search phrasing → the role it should find (searchIntent). */
export const SEARCH_CASES: { q: string; roleId: string | null }[] = [
  { q: "BA internship", roleId: "business_analyst" },
  { q: "ML intern", roleId: "ml_engineer" },
  { q: "marketing internship", roleId: "digital_marketer" },
  { q: "HR intern", roleId: "hr_recruiter" },
  { q: "finance internship", roleId: "financial_analyst" },
  { q: "ui ux intern", roleId: "ux_designer" },
  { q: "mechanical engineering internship", roleId: "mechanical_trainee" },
  { q: "research intern", roleId: "research_assistant" },
  { q: "Acme Corp", roleId: null },
];

export { EVAL_NOW };
