/**
 * SAMPLE opportunities for local development, demos and tests. Every row is inserted with
 * is_sample = true and is labelled "Sample listing" in the UI; none is a real opening and none is
 * counted in metrics. Organizations are fictional.
 */
import { normalizeSkill } from "./domain/skills";

export interface SampleOpportunity {
  title: string;
  category: import("./domain/categories").CategoryKey;
  employmentType?: "full_time" | "part_time" | "temporary" | "contract";
  organizationName: string;
  summary: string;
  description: string;
  responsibilities: string;
  workMode: "remote" | "hybrid" | "onsite";
  locations: string[];
  compMin?: number;
  compMax?: number;
  compPeriod?: "year" | "month" | "project" | "total";
  unpaid?: boolean;
  durationWeeks?: number;
  experienceMinYears?: number;
  deadlineInDays: number;
  applicationMethod: "internal" | "external";
  externalUrl?: string;
  required: string[];
  preferred: string[];
  educationLevels?: ("diploma" | "bachelors" | "masters" | "higher_secondary")[];
  graduationYearMin?: number;
  graduationYearMax?: number;
  requiresWorkAuthorizationIndia?: boolean;
  details?: Record<string, unknown>;
  questions?: { key: string; label: string; required: boolean }[];
  verification?: "unverified" | "source_verified" | "org_verified";
}

const WHY = { key: "motivation", label: "Why are you interested in this role? (2–4 sentences)", required: true };

export const SAMPLE_OPPORTUNITIES: SampleOpportunity[] = [
  {
    title: "Frontend Developer Intern",
    category: "internship",
    organizationName: "Lumen Learning Labs (sample)",
    summary: "Build accessible React interfaces for a learning platform used by school students.",
    description: "Join a small product team building the student experience of an online learning platform. You'll ship real features in React and TypeScript, pair with senior engineers, and learn how accessible, fast interfaces are built and tested.",
    responsibilities: "Build UI components in React and TypeScript\nFix accessibility issues found in audits\nWrite component tests\nJoin weekly design reviews",
    workMode: "hybrid", locations: ["Pune"], compMin: 15000, compMax: 20000, compPeriod: "month", durationWeeks: 24, deadlineInDays: 21,
    applicationMethod: "internal", required: ["React", "TypeScript", "HTML", "CSS"], preferred: ["Figma", "Testing"],
    educationLevels: ["bachelors", "diploma"], graduationYearMin: 2025, graduationYearMax: 2028, requiresWorkAuthorizationIndia: true,
    details: { stipendNote: "₹15,000–20,000 per month", conversionPossible: true, certificate: true }, questions: [WHY], verification: "org_verified",
  },
  {
    title: "Data Analyst (Entry Level)",
    category: "job", employmentType: "full_time",
    organizationName: "Kaveri FinServe (sample)",
    summary: "Turn loan and repayment data into dashboards that help rural lenders decide faster.",
    description: "Work with the analytics team to clean data, build SQL reports and maintain Power BI dashboards used by branch managers across Karnataka. Good fit for recent graduates who enjoy numbers and clear communication.",
    responsibilities: "Write SQL queries and reports\nMaintain dashboards\nPresent findings to operations teams",
    workMode: "onsite", locations: ["Bengaluru"], compMin: 450000, compMax: 600000, compPeriod: "year", experienceMinYears: 0, deadlineInDays: 30,
    applicationMethod: "internal", required: ["SQL", "Excel"], preferred: ["Power BI", "Python", "Statistics"],
    educationLevels: ["bachelors", "masters"], graduationYearMin: 2023, requiresWorkAuthorizationIndia: true, questions: [WHY], verification: "source_verified",
  },
  {
    title: "Content Writer — Regional Languages (Freelance)",
    category: "gig",
    organizationName: "Sahyog Media (sample)",
    summary: "Write explainer articles on government schemes in Hindi or Marathi.",
    description: "We publish plain-language explainers on public schemes for first-time applicants. Write four 800-word articles per month in Hindi or Marathi, based on official sources we provide. Fully remote and flexible.",
    responsibilities: "Research from official sources\nWrite and revise four articles a month\nFollow our style guide",
    workMode: "remote", locations: [], compMin: 1500, compMax: 2500, compPeriod: "project", durationWeeks: 8, deadlineInDays: 14,
    applicationMethod: "internal", required: ["Content Writing", "Hindi"], preferred: ["Marathi", "Research"],
    details: { deliverables: "4 articles of ~800 words per month" }, questions: [{ key: "sample", label: "Link to a writing sample", required: true }], verification: "unverified",
  },
  {
    title: "Junior Backend Engineer (Node.js)",
    category: "job", employmentType: "full_time",
    organizationName: "Tiffinbox Technologies (sample)",
    summary: "Build APIs for a meal-delivery network serving tier-2 cities.",
    description: "Design and maintain Node.js services and PostgreSQL schemas behind our ordering and delivery apps. You'll own small services end-to-end with guidance from senior engineers, and learn production practices like monitoring and safe migrations.",
    responsibilities: "Build REST APIs in Node.js\nDesign PostgreSQL tables\nWrite tests and handle on-call with support",
    workMode: "hybrid", locations: ["Indore", "Bhopal"], compMin: 600000, compMax: 900000, compPeriod: "year", experienceMinYears: 1, deadlineInDays: 25,
    applicationMethod: "external", externalUrl: "https://example.com/careers/junior-backend",
    required: ["Node.js", "JavaScript", "SQL"], preferred: ["PostgreSQL", "Docker", "TypeScript"],
    educationLevels: ["bachelors", "diploma"], verification: "source_verified",
  },
  {
    title: "Marketing & Community Intern",
    category: "internship",
    organizationName: "GreenRoots Collective (sample)",
    summary: "Grow a volunteer community for urban tree-planting drives.",
    description: "Help plan social media campaigns, write newsletters and coordinate volunteer sign-ups for monthly tree-planting drives in Chennai. Great for students who like people, writing and organising.",
    responsibilities: "Plan and post social content\nWrite the monthly newsletter\nCoordinate volunteers",
    workMode: "hybrid", locations: ["Chennai"], unpaid: false, compMin: 5000, compMax: 8000, compPeriod: "month", durationWeeks: 12, deadlineInDays: 10,
    applicationMethod: "internal", required: ["Social Media", "Communication"], preferred: ["Canva", "Content Writing"],
    educationLevels: ["higher_secondary", "bachelors"], details: { stipendNote: "₹5,000–8,000 per month", conversionPossible: false, certificate: true }, questions: [WHY], verification: "org_verified",
  },
  {
    title: "Machine Learning Intern — Crop Health",
    category: "internship",
    organizationName: "AgriSense AI (sample)",
    summary: "Train image models that spot crop disease from smartphone photos.",
    description: "Work with agronomists and engineers to label data, train and evaluate image classification models, and help ship them to a farmer-facing app. You'll learn the full path from dataset to deployed model.",
    responsibilities: "Prepare and label datasets\nTrain and evaluate models in PyTorch\nWrite clear experiment notes",
    workMode: "remote", locations: [], compMin: 20000, compMax: 30000, compPeriod: "month", durationWeeks: 24, deadlineInDays: 35,
    applicationMethod: "internal", required: ["Python", "Machine Learning"], preferred: ["PyTorch", "Computer Vision", "Pandas"],
    educationLevels: ["bachelors", "masters"], graduationYearMin: 2025, graduationYearMax: 2028,
    details: { stipendNote: "₹20,000–30,000 per month", conversionPossible: true, certificate: true }, questions: [WHY, { key: "project", label: "Link to an ML project you built (optional)", required: false }], verification: "source_verified",
  },
  {
    title: "Customer Support Associate (Part-time)",
    category: "job", employmentType: "part_time",
    organizationName: "Swasthya Clinics (sample)",
    summary: "Help patients book appointments by phone and chat, four hours a day.",
    description: "Answer patient questions, book and reschedule appointments, and keep records accurate. Training provided. Good fit for students and anyone looking for flexible part-time work.",
    responsibilities: "Answer calls and chats\nBook appointments\nKeep records updated",
    workMode: "onsite", locations: ["Lucknow"], compMin: 12000, compMax: 15000, compPeriod: "month", deadlineInDays: 18,
    applicationMethod: "internal", required: ["Communication", "Hindi"], preferred: ["English", "Excel"],
    educationLevels: ["higher_secondary", "diploma", "bachelors"], requiresWorkAuthorizationIndia: true, verification: "unverified",
  },
  {
    title: "UI/UX Design Freelancer — App Redesign",
    category: "gig",
    organizationName: "Patang Studio (sample)",
    summary: "Redesign five key screens of a savings app for first-time smartphone users.",
    description: "Produce research-informed wireframes and high-fidelity designs for five screens, with a simple clickable prototype. We provide user interview notes and brand guidelines.",
    responsibilities: "Review interview notes\nDesign wireframes and final screens\nBuild a clickable prototype",
    workMode: "remote", locations: [], compMin: 25000, compMax: 40000, compPeriod: "project", durationWeeks: 4, deadlineInDays: 12,
    applicationMethod: "internal", required: ["UX Design", "Figma"], preferred: ["Prototyping", "User Research"],
    details: { deliverables: "Wireframes, 5 final screens, clickable prototype" }, questions: [{ key: "portfolio", label: "Portfolio link", required: true }], verification: "unverified",
  },
  {
    title: "Graduate Engineer Trainee — Electrical",
    category: "job", employmentType: "full_time",
    organizationName: "Narmada Power Systems (sample)",
    summary: "A one-year trainee programme rotating through substation design and maintenance.",
    description: "A structured trainee programme for electrical graduates with rotations across design, testing and field maintenance. Includes mentoring and a confirmed role on completion, subject to performance.",
    responsibilities: "Rotate through design, testing and maintenance\nSupport site engineers\nComplete training modules",
    workMode: "onsite", locations: ["Vadodara"], compMin: 420000, compMax: 480000, compPeriod: "year", deadlineInDays: 40,
    applicationMethod: "internal", required: ["Electrical Engineering", "AutoCAD"], preferred: ["MATLAB"],
    educationLevels: ["bachelors"], graduationYearMin: 2025, graduationYearMax: 2026, requiresWorkAuthorizationIndia: true, questions: [WHY], verification: "org_verified",
  },
  {
    title: "Smart Cities Hackathon 2026",
    category: "hackathon",
    organizationName: "Nagarik Tech Collective (sample)",
    summary: "48-hour hackathon building tools for city services, open to student teams.",
    description: "Form a team of two to four and build a working prototype that makes a city service easier to use: water, transport, waste or public health. Mentors from civic-tech groups help over the weekend; the best teams present to municipal officers.",
    responsibilities: "Form a team and pick a theme\nBuild and demo a working prototype\nPresent to the jury",
    workMode: "hybrid", locations: ["Bengaluru"], deadlineInDays: 18, applicationMethod: "internal",
    required: [], preferred: ["React", "Python", "Figma"],
    details: { eventStart: "2026-12-05", eventEnd: "2026-12-07", format: "hybrid", teamSizeMin: 2, teamSizeMax: 4, themes: "Water, transport, waste, public health", prizes: "₹1,00,000 total; incubation interviews" },
    verification: "source_verified",
  },
  {
    title: "First-Generation Learners Scholarship",
    category: "scholarship",
    organizationName: "Vidya Setu Foundation (sample)",
    summary: "Annual scholarship for first-generation college students in engineering and sciences.",
    description: "Supports students who are the first in their family to attend college. Recipients receive an annual award for tuition and books, plus a mentor for the academic year. Renewable each year subject to academic progress.",
    responsibilities: "Maintain academic progress\nMeet your mentor once a month",
    workMode: "remote", locations: [], deadlineInDays: 35, applicationMethod: "internal",
    required: [], preferred: [], educationLevels: ["bachelors", "diploma"], graduationYearMin: 2026, graduationYearMax: 2030,
    details: { awardAmount: "₹50,000 per year", academicRequirement: "At least 70% in Class 12 or CGPA 7.0 in the latest semester", seats: 40, renewable: true },
    verification: "org_verified",
  },
  {
    title: "Undergraduate Research Assistant: Low-cost Air Sensors",
    category: "research",
    organizationName: "Institute Environmental Lab (sample)",
    summary: "Help calibrate low-cost air-quality sensors against reference monitors.",
    description: "Join a university environmental lab for a semester to collect and clean sensor data, compare it with reference monitors, and write up calibration results. Suitable for students comfortable with Python and basic statistics.",
    responsibilities: "Collect and clean sensor data\nCompare with reference monitors\nWrite up calibration results",
    workMode: "onsite", locations: ["Pune"], compMin: 8000, compMax: 8000, compPeriod: "month", deadlineInDays: 25, applicationMethod: "internal",
    required: ["Python"], preferred: ["Statistics", "Pandas"], educationLevels: ["bachelors", "masters"],
    details: { researchArea: "Environmental sensing and calibration", requiredQualifications: "Undergraduate in engineering or sciences; Python", duration: "One semester (about 16 weeks)", supervisor: "Air Quality Group" },
    verification: "source_verified",
  },];

export function sampleSkillRows(opportunityId: string, s: SampleOpportunity) {
  const req = s.required.map((name) => ({ opportunityId, name, normalized: normalizeSkill(name), required: true }));
  const pref = s.preferred.filter((p) => !s.required.some((r) => normalizeSkill(r) === normalizeSkill(p))).map((name) => ({ opportunityId, name, normalized: normalizeSkill(name), required: false }));
  return [...req, ...pref];
}

export const slugFor = (s: SampleOpportunity, i: number) =>
  `${s.title}-${s.organizationName}`.toLowerCase().replace(/\(sample\)/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) + `-s${i + 1}`;
