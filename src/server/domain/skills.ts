/** Skill normalization: one canonical key per skill so "React.js", "ReactJS" and "react" match. */

const ALIASES: Record<string, string> = {
  js: "javascript",
  "java script": "javascript",
  ts: "typescript",
  "react.js": "react",
  reactjs: "react",
  "node.js": "nodejs",
  node: "nodejs",
  "next.js": "nextjs",
  py: "python",
  "c plus plus": "c++",
  cpp: "c++",
  postgresql: "postgres",
  "ms excel": "excel",
  "microsoft excel": "excel",
  ml: "machine learning",
  dl: "deep learning",
  "ui/ux": "ux design",
  ux: "ux design",
  "ui design": "ux design",
  k8s: "kubernetes",
  gcp: "google cloud",
  "amazon web services": "aws",
  "power bi": "powerbi",
  "google sheets": "spreadsheets",
};

export function normalizeSkill(raw: string): string {
  const key = raw
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return ALIASES[key] ?? key;
}

/** Splits a comma/newline separated list into distinct display names (first spelling wins). */
export function parseSkillList(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of input.split(/[,\n]/)) {
    const name = part.trim().replace(/\s+/g, " ").slice(0, 60);
    const key = normalizeSkill(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out.slice(0, 50);
}
