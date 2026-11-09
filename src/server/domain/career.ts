/**
 * Career intelligence: deterministic, explainable, and based only on the student's own skills and on
 * live listings. Nothing here invents experience; suggestions are labelled as suggestions.
 */
import { normalizeSkill } from "./skills";

export const KNOWN_SKILLS = [
  "JavaScript", "TypeScript", "React", "Next.js", "Node.js", "Express", "Angular", "Vue", "HTML", "CSS", "Tailwind", "Redux",
  "Python", "Django", "Flask", "FastAPI", "Java", "Spring", "Kotlin", "Swift", "Flutter", "Dart", "React Native", "Android",
  "C", "C++", "C#", ".NET", "Go", "Rust", "PHP", "Laravel", "Ruby", "Rails",
  "SQL", "MySQL", "PostgreSQL", "MongoDB", "Redis", "Firebase", "GraphQL", "REST",
  "Git", "GitHub", "Docker", "Kubernetes", "AWS", "Azure", "Google Cloud", "Linux", "CI/CD", "Testing", "Jest",
  "Machine Learning", "Deep Learning", "TensorFlow", "PyTorch", "scikit-learn", "Pandas", "NumPy", "NLP", "Computer Vision", "Statistics",
  "Data Analysis", "Excel", "Power BI", "Tableau", "R",
  "Figma", "UX Design", "Photoshop", "Illustrator", "Canva", "Video Editing",
  "Communication", "Content Writing", "Copywriting", "SEO", "Digital Marketing", "Social Media", "Sales", "Customer Support",
  "Accounting", "Tally", "AutoCAD", "SolidWorks", "MATLAB", "Embedded Systems",
] as const;

/** Skills the student listed more than once under different spellings (e.g. "ReactJS" and "React.js"). */
export function duplicateSkills(names: string[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const n of names) groups.set(normalizeSkill(n), [...(groups.get(normalizeSkill(n)) ?? []), n]);
  return [...groups.values()].filter((g) => g.length > 1);
}

/** Role profiles: the core skills that define each role. Hypotheses to be refined with listing data. */
export const ROLE_PROFILES: { role: string; core: string[] }[] = [
  { role: "Frontend Developer", core: ["JavaScript", "TypeScript", "React", "HTML", "CSS", "Git"] },
  { role: "Backend Developer", core: ["Node.js", "SQL", "REST", "Git", "Docker", "Python"] },
  { role: "Full-Stack Developer", core: ["JavaScript", "React", "Node.js", "SQL", "Git", "REST"] },
  { role: "Mobile Developer", core: ["Flutter", "Dart", "Kotlin", "Swift", "React Native", "Git"] },
  { role: "Data Analyst", core: ["SQL", "Excel", "Power BI", "Python", "Statistics", "Data Analysis"] },
  { role: "Machine Learning Engineer", core: ["Python", "Machine Learning", "PyTorch", "TensorFlow", "Pandas", "Statistics"] },
  { role: "DevOps / Cloud Engineer", core: ["Linux", "Docker", "Kubernetes", "AWS", "CI/CD", "Git"] },
  { role: "UI/UX Designer", core: ["Figma", "UX Design", "Illustrator", "Photoshop", "HTML", "CSS"] },
  { role: "Digital Marketing Associate", core: ["Digital Marketing", "SEO", "Social Media", "Content Writing", "Canva", "Excel"] },
  { role: "Content Writer", core: ["Content Writing", "Copywriting", "SEO", "Communication", "Social Media", "Canva"] },
];

export interface RoleSuggestion { role: string; have: string[]; missing: string[]; coverage: number }

/** Roles whose core skills the student already partly has, best first. Needs at least two matching skills. */
export function suggestRoles(skills: string[], limit = 3): RoleSuggestion[] {
  const mine = new Set(skills.map(normalizeSkill));
  return ROLE_PROFILES.map(({ role, core }) => {
    const have = core.filter((s) => mine.has(normalizeSkill(s)));
    return { role, have, missing: core.filter((s) => !mine.has(normalizeSkill(s))), coverage: have.length / core.length };
  })
    .filter((r) => r.have.length >= 2)
    .sort((a, b) => b.coverage - a.coverage || a.role.localeCompare(b.role))
    .slice(0, limit);
}

const PROJECT_IDEAS: Record<string, string> = {
  react: "Build a small React app with routing and a form that saves data, and deploy it.",
  typescript: "Convert one of your JavaScript projects to TypeScript with strict mode on.",
  sql: "Design a schema for a college library and write 10 queries answering real questions.",
  "power bi": "Build a dashboard from a public dataset (e.g. data.gov.in) and write up three insights.",
  excel: "Clean a messy public dataset in Excel and summarise it with pivot tables and charts.",
  python: "Write a script that automates a repetitive task you actually do, with a README.",
  docker: "Containerise one of your apps and document how to run it with one command.",
  git: "Publish your projects on GitHub with clear READMEs and meaningful commit history.",
  figma: "Redesign one screen of an app you use, with a short case study of your choices.",
  "machine learning": "Train and evaluate a model on a public dataset; report metrics honestly, including failures.",
  "node.js": "Build a REST API with validation and tests for a simple to-do or booking domain.",
  seo: "Audit a small website's SEO and write a prioritised list of fixes with evidence.",
};
export const projectIdea = (skill: string) => PROJECT_IDEAS[normalizeSkill(skill)] ?? `Build a small, real project that uses ${skill}, and link it from your profile as evidence.`;

export interface RoadmapStep { skill: string; why: string; project: string }

/**
 * A short, ordered plan: skills that open-listing demand and the chosen role both point to, then the rest.
 * `demand` maps a skill to how many open listings require it.
 */
export function roadmap(target: RoleSuggestion | null, demand: Map<string, number>, have: string[], steps = 4): RoadmapStep[] {
  const mine = new Set(have.map(normalizeSkill));
  const candidates = new Map<string, number>();
  for (const s of target?.missing ?? []) candidates.set(s, (candidates.get(s) ?? 0) + 3);
  for (const [s, n] of demand) if (!mine.has(normalizeSkill(s))) candidates.set(s, (candidates.get(s) ?? 0) + n);
  return [...candidates]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, steps)
    .map(([skill]) => ({
      skill,
      why: [target?.missing.includes(skill) ? `core to ${target.role}` : null, demand.get(skill) ? `required by ${demand.get(skill)} open listing${demand.get(skill)! > 1 ? "s" : ""}` : null].filter(Boolean).join(" and ") || "commonly requested",
      project: projectIdea(skill),
    }));
}

/** Suggests a category from listing text. Returns null when the text doesn't say clearly. */
export function classifyOpportunity(text: string): "internship" | "gig" | "job" | null {
  const t = text.toLowerCase();
  if (/\bintern(ship)?\b|\bstipend\b/.test(t)) return "internship";
  if (/\bfreelance\b|\bper project\b|\bgig\b|\bcontract (work|basis)\b|\bdeliverables?\b/.test(t)) return "gig";
  if (/\bfull[- ]time\b|\bctc\b|\blpa\b|\bper annum\b|\bjob\b|\bposition\b/.test(t)) return "job";
  return null;
}

/** Known skills named in a listing's text, for an author to confirm as requirements. */
export function extractRequirements(text: string): string[] {
  const found: string[] = [];
  for (const s of KNOWN_SKILLS) {
    const re = new RegExp(`(^|[^a-z0-9+#.])${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-z0-9+#])`, "i");
    if (re.test(text) && !found.some((f) => normalizeSkill(f) === normalizeSkill(s))) found.push(s);
  }
  return found;
}
