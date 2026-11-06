/** Profile completeness: which sections are filled, and the next most useful thing to add. */
export interface CompletenessInput {
  basics: boolean; // name + career stage
  education: number;
  skills: number;
  experienceOrProjects: number;
  preferences: boolean; // roles/categories/work modes/locations
  resume: boolean;
  links: boolean;
}

const SECTIONS: { key: keyof CompletenessInput; label: string; weight: number; action: string; href: string }[] = [
  { key: "basics", label: "Basic information", weight: 15, action: "Add your name and career stage", href: "/app/onboarding?step=1" },
  { key: "education", label: "Education", weight: 20, action: "Add your education", href: "/app/onboarding?step=3" },
  { key: "skills", label: "Skills", weight: 20, action: "Add at least three skills", href: "/app/onboarding?step=4" },
  { key: "experienceOrProjects", label: "Experience or projects", weight: 15, action: "Add a project or experience", href: "/app/onboarding?step=6" },
  { key: "preferences", label: "Preferences", weight: 10, action: "Set your career preferences", href: "/app/onboarding?step=8" },
  { key: "resume", label: "Resume", weight: 15, action: "Upload your resume", href: "/app/profile#resumes" },
  { key: "links", label: "Professional links", weight: 5, action: "Add GitHub, LinkedIn or a portfolio", href: "/app/onboarding?step=15" },
];

export function profileCompleteness(input: CompletenessInput) {
  const filled = (k: keyof CompletenessInput) => {
    const v = input[k];
    return typeof v === "number" ? (k === "skills" ? v >= 3 : v > 0) : v;
  };
  const percent = SECTIONS.reduce((s, x) => s + (filled(x.key) ? x.weight : 0), 0);
  const missing = SECTIONS.filter((x) => !filled(x.key)).map(({ label, action, href }) => ({ label, action, href }));
  return { percent, missing, next: missing[0] ?? null };
}
