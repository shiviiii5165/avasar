/**
 * Curated canonical skill registry (taxonomySource "avsar", version below).
 *
 * Honesty rules for this file:
 *  - No ESCO / O*NET URI is written here. Concepts are Avsar's own; an external taxonomy is imported with its
 *    real URIs and version through importTaxonomy() (services/skill-registry.ts), never typed in by hand.
 *  - Indian job terminology ("Tally", "ITI fitter", "MS Office") is kept as its own concept or alias; it is
 *    mapped onto a broader concept only when the meaning is the same.
 *  - `textExtractable: false` marks names too ambiguous to find in free text ("Go", "R", "C", "Excel" in
 *    "excellent"...): they are matched only when a source lists them as a skill.
 */
export const REGISTRY_VERSION = "avsar-skills/2026-11";

export interface ConceptDef {
  id: string;
  name: string;
  category: "programming" | "web" | "data" | "ai" | "cloud" | "design" | "business" | "finance" | "marketing" | "communication" | "trade" | "engineering" | "office";
  aliases?: string[];
  parent?: string;
  textExtractable?: boolean;
  locale?: string;
}

export const CONCEPTS: ConceptDef[] = [
  // Programming
  { id: "python", name: "Python", category: "programming", aliases: ["py", "python3", "python 3"] },
  { id: "java", name: "Java", category: "programming", aliases: ["core java", "java se"] },
  { id: "javascript", name: "JavaScript", category: "programming", aliases: ["js", "java script", "es6", "ecmascript"] },
  { id: "typescript", name: "TypeScript", category: "programming", aliases: ["ts"] },
  { id: "c", name: "C", category: "programming", aliases: ["c language", "c programming"], textExtractable: false },
  { id: "cpp", name: "C++", category: "programming", aliases: ["c++", "cpp", "c plus plus"] },
  { id: "csharp", name: "C#", category: "programming", aliases: ["c#", "c sharp"] },
  { id: "go", name: "Go", category: "programming", aliases: ["golang"], textExtractable: false },
  { id: "kotlin", name: "Kotlin", category: "programming" },
  { id: "dsa", name: "Data structures and algorithms", category: "programming", aliases: ["data structures", "algorithms", "data structures and algorithms", "dsa"] },
  { id: "git", name: "Git", category: "programming", aliases: ["github", "version control"] },
  // Web
  { id: "html", name: "HTML", category: "web", aliases: ["html5"] },
  { id: "css", name: "CSS", category: "web", aliases: ["css3"] },
  { id: "react", name: "React", category: "web", aliases: ["react.js", "reactjs", "react js"] },
  { id: "nextjs", name: "Next.js", category: "web", aliases: ["next.js", "nextjs", "next js"] },
  { id: "nodejs", name: "Node.js", category: "web", aliases: ["node.js", "node", "nodejs", "node js"] },
  { id: "express", name: "Express", category: "web", aliases: ["express.js", "expressjs"], textExtractable: false },
  { id: "django", name: "Django", category: "web" },
  { id: "spring", name: "Spring Boot", category: "web", aliases: ["spring boot", "springboot", "spring framework"] },
  { id: "rest_api", name: "REST APIs", category: "web", aliases: ["rest", "rest api", "restful", "restful apis", "api development"] },
  { id: "android", name: "Android development", category: "web", aliases: ["android", "android studio"] },
  // Data
  { id: "sql", name: "SQL", category: "data", aliases: ["structured query language", "rdbms"] },
  { id: "postgres", name: "PostgreSQL", category: "data", aliases: ["postgresql", "postgres"], parent: "sql" },
  { id: "mysql", name: "MySQL", category: "data", parent: "sql" },
  { id: "mongodb", name: "MongoDB", category: "data", aliases: ["mongo"] },
  { id: "excel", name: "Microsoft Excel", category: "office", aliases: ["excel", "ms excel", "microsoft excel", "advanced excel"], textExtractable: false },
  { id: "spreadsheets", name: "Spreadsheets", category: "office", aliases: ["google sheets"] },
  { id: "powerbi", name: "Power BI", category: "data", aliases: ["power bi", "powerbi"] },
  { id: "tableau", name: "Tableau", category: "data" },
  { id: "pandas", name: "pandas", category: "data" },
  { id: "numpy", name: "NumPy", category: "data" },
  { id: "statistics", name: "Statistics", category: "data", aliases: ["statistical analysis", "probability and statistics"] },
  { id: "data_analysis", name: "Data analysis", category: "data", aliases: ["data analytics"] },
  { id: "data_visualization", name: "Data visualization", category: "data", aliases: ["data visualisation"] },
  // AI
  { id: "machine_learning", name: "Machine learning", category: "ai", aliases: ["ml", "machine learning"] },
  { id: "deep_learning", name: "Deep learning", category: "ai", aliases: ["dl", "neural networks"] },
  { id: "nlp", name: "Natural language processing", category: "ai", aliases: ["nlp", "natural language processing"] },
  { id: "computer_vision", name: "Computer vision", category: "ai" },
  { id: "pytorch", name: "PyTorch", category: "ai" },
  { id: "tensorflow", name: "TensorFlow", category: "ai" },
  // Cloud / DevOps
  { id: "aws", name: "AWS", category: "cloud", aliases: ["amazon web services"] },
  { id: "azure", name: "Microsoft Azure", category: "cloud", aliases: ["azure"] },
  { id: "gcp", name: "Google Cloud", category: "cloud", aliases: ["gcp", "google cloud platform"] },
  { id: "docker", name: "Docker", category: "cloud", aliases: ["containers"] },
  { id: "kubernetes", name: "Kubernetes", category: "cloud", aliases: ["k8s"] },
  { id: "linux", name: "Linux", category: "cloud", aliases: ["unix"] },
  { id: "ci_cd", name: "CI/CD", category: "cloud", aliases: ["ci/cd", "continuous integration", "continuous delivery"] },
  // Design
  { id: "ux_design", name: "UX design", category: "design", aliases: ["ux", "ui/ux", "ui design", "user experience", "ux design"] },
  { id: "figma", name: "Figma", category: "design" },
  { id: "autocad", name: "AutoCAD", category: "engineering", aliases: ["auto cad"] },
  { id: "solidworks", name: "SolidWorks", category: "engineering", aliases: ["solid works"] },
  // Business / finance (Indian terminology kept)
  { id: "accounting", name: "Accounting", category: "finance", aliases: ["bookkeeping", "book keeping", "accounts"] },
  { id: "tally", name: "Tally", category: "finance", aliases: ["tally erp", "tally erp 9", "tally prime"], locale: "en-IN" },
  { id: "gst", name: "GST compliance", category: "finance", aliases: ["gst", "gst filing", "goods and services tax"], locale: "en-IN" },
  { id: "ms_office", name: "MS Office", category: "office", aliases: ["ms office", "microsoft office", "ms word", "powerpoint"], locale: "en-IN" },
  { id: "data_entry", name: "Data entry", category: "office", aliases: ["typing"], locale: "en-IN" },
  { id: "digital_marketing", name: "Digital marketing", category: "marketing", aliases: ["online marketing", "social media marketing", "smm"] },
  { id: "seo", name: "SEO", category: "marketing", aliases: ["search engine optimization", "search engine optimisation"] },
  { id: "content_writing", name: "Content writing", category: "marketing", aliases: ["copywriting", "content creation"] },
  { id: "sales", name: "Sales", category: "business", aliases: ["field sales", "inside sales"] },
  { id: "customer_support", name: "Customer support", category: "business", aliases: ["customer service", "customer care"], locale: "en-IN" },
  { id: "english_communication", name: "English communication", category: "communication", aliases: ["communication skills", "spoken english", "written communication", "verbal communication"], locale: "en-IN" },
  { id: "hindi", name: "Hindi", category: "communication", textExtractable: false },
  { id: "project_management", name: "Project management", category: "business", aliases: [] },
  // Trades (apprenticeships, NATS / NCS terminology)
  { id: "fitter", name: "Fitter (ITI trade)", category: "trade", aliases: ["fitter", "iti fitter"], locale: "en-IN" },
  { id: "electrician", name: "Electrician (ITI trade)", category: "trade", aliases: ["electrician", "iti electrician", "electrical wiring"], locale: "en-IN" },
  { id: "welding", name: "Welding", category: "trade", aliases: ["welder", "arc welding"] },
  { id: "turner", name: "Turner / machining", category: "trade", aliases: ["turner", "machinist", "lathe operation"], locale: "en-IN" },
  { id: "cnc", name: "CNC operation", category: "trade", aliases: ["cnc", "cnc operator", "cnc programming", "vmc"] },
  { id: "electronics", name: "Electronics", category: "engineering", aliases: ["electronics mechanic", "circuit design"] },
  { id: "quality_control", name: "Quality control", category: "engineering", aliases: ["qc", "quality assurance", "quality inspection"] },
];

/** related: overlapping ability (partial, labelled credit). prerequisite: [from] is usually learned before [to]. */
export const RELATIONS: [string, string, "related" | "prerequisite"][] = [
  ["javascript", "typescript", "related"],
  ["javascript", "react", "prerequisite"],
  ["html", "react", "prerequisite"],
  ["css", "react", "prerequisite"],
  ["react", "nextjs", "prerequisite"],
  ["javascript", "nodejs", "prerequisite"],
  ["nodejs", "express", "prerequisite"],
  ["python", "django", "prerequisite"],
  ["java", "spring", "prerequisite"],
  ["java", "kotlin", "related"],
  ["kotlin", "android", "prerequisite"],
  ["java", "android", "prerequisite"],
  ["c", "cpp", "related"],
  ["cpp", "dsa", "related"],
  ["java", "dsa", "related"],
  ["python", "dsa", "related"],
  ["postgres", "mysql", "related"],
  ["sql", "data_analysis", "prerequisite"],
  ["excel", "data_analysis", "prerequisite"],
  ["excel", "spreadsheets", "related"],
  ["powerbi", "tableau", "related"],
  ["powerbi", "data_visualization", "related"],
  ["tableau", "data_visualization", "related"],
  ["python", "pandas", "prerequisite"],
  ["python", "numpy", "prerequisite"],
  ["pandas", "data_analysis", "related"],
  ["python", "machine_learning", "prerequisite"],
  ["statistics", "machine_learning", "prerequisite"],
  ["machine_learning", "deep_learning", "prerequisite"],
  ["deep_learning", "nlp", "prerequisite"],
  ["deep_learning", "computer_vision", "prerequisite"],
  ["pytorch", "tensorflow", "related"],
  ["deep_learning", "pytorch", "related"],
  ["deep_learning", "tensorflow", "related"],
  ["aws", "azure", "related"],
  ["aws", "gcp", "related"],
  ["azure", "gcp", "related"],
  ["linux", "docker", "prerequisite"],
  ["docker", "kubernetes", "prerequisite"],
  ["git", "ci_cd", "prerequisite"],
  ["ux_design", "figma", "related"],
  ["accounting", "tally", "prerequisite"],
  ["accounting", "gst", "prerequisite"],
  ["ms_office", "excel", "related"],
  ["digital_marketing", "seo", "related"],
  ["content_writing", "seo", "related"],
  ["fitter", "turner", "related"],
  ["turner", "cnc", "prerequisite"],
  ["electrician", "electronics", "related"],
];

export interface RoleDef { id: string; title: string; aliases: string[]; essential: string[]; optional: string[] }

export const ROLES: RoleDef[] = [
  { id: "frontend_developer", title: "Frontend developer", aliases: ["frontend developer", "front end developer", "front-end developer", "react developer", "ui developer", "web developer"], essential: ["html", "css", "javascript"], optional: ["react", "typescript", "git", "nextjs"] },
  { id: "backend_developer", title: "Backend developer", aliases: ["backend developer", "back end developer", "back-end developer", "node developer", "java developer", "python developer", "api developer"], essential: ["sql", "rest_api"], optional: ["nodejs", "java", "python", "spring", "django", "docker", "git"] },
  { id: "full_stack_developer", title: "Full-stack developer", aliases: ["full stack developer", "full-stack developer", "fullstack developer", "mern developer", "software developer", "software engineer", "sde"], essential: ["javascript", "html", "css", "sql"], optional: ["react", "nodejs", "git", "rest_api", "typescript"] },
  { id: "data_analyst", title: "Data analyst", aliases: ["data analyst", "business analyst", "mis executive", "mis analyst", "reporting analyst"], essential: ["sql", "excel", "data_analysis"], optional: ["powerbi", "tableau", "python", "statistics", "data_visualization"] },
  { id: "data_scientist", title: "Data scientist", aliases: ["data scientist", "data science"], essential: ["python", "statistics", "machine_learning"], optional: ["sql", "pandas", "numpy", "deep_learning"] },
  { id: "ml_engineer", title: "Machine learning engineer", aliases: ["machine learning engineer", "ml engineer", "ai engineer", "ai/ml engineer"], essential: ["python", "machine_learning"], optional: ["deep_learning", "pytorch", "tensorflow", "docker", "aws", "nlp"] },
  { id: "devops_engineer", title: "DevOps engineer", aliases: ["devops engineer", "cloud engineer", "site reliability engineer", "sre"], essential: ["linux", "docker", "ci_cd"], optional: ["kubernetes", "aws", "azure", "gcp", "git"] },
  { id: "android_developer", title: "Android developer", aliases: ["android developer", "mobile developer", "app developer"], essential: ["android"], optional: ["kotlin", "java", "git", "rest_api"] },
  { id: "ux_designer", title: "UI/UX designer", aliases: ["ux designer", "ui designer", "ui/ux designer", "product designer"], essential: ["ux_design", "figma"], optional: ["html", "css"] },
  { id: "accountant", title: "Accountant", aliases: ["accountant", "accounts executive", "accounts assistant", "junior accountant", "accounts trainee"], essential: ["accounting", "tally"], optional: ["gst", "excel", "ms_office"] },
  { id: "digital_marketer", title: "Digital marketing executive", aliases: ["digital marketing executive", "digital marketer", "social media executive", "seo executive", "marketing intern"], essential: ["digital_marketing"], optional: ["seo", "content_writing", "english_communication"] },
  { id: "customer_support_exec", title: "Customer support executive", aliases: ["customer support executive", "customer care executive", "telecaller", "bpo executive", "customer service representative"], essential: ["english_communication", "customer_support"], optional: ["hindi", "ms_office", "data_entry"] },
  { id: "data_entry_operator", title: "Data entry operator", aliases: ["data entry operator", "computer operator", "back office executive"], essential: ["data_entry", "ms_office"], optional: ["excel", "english_communication"] },
  { id: "fitter_apprentice", title: "Fitter apprentice", aliases: ["fitter apprentice", "apprentice fitter", "trade apprentice fitter"], essential: ["fitter"], optional: ["quality_control", "turner"] },
  { id: "electrician_apprentice", title: "Electrician apprentice", aliases: ["electrician apprentice", "apprentice electrician", "trade apprentice electrician"], essential: ["electrician"], optional: ["electronics", "quality_control"] },
  { id: "cnc_operator", title: "CNC operator", aliases: ["cnc operator", "vmc operator", "machine operator"], essential: ["cnc"], optional: ["turner", "quality_control", "autocad"] },
  { id: "mechanical_trainee", title: "Mechanical engineer trainee", aliases: ["graduate engineer trainee mechanical", "mechanical engineer trainee", "get mechanical", "design engineer"], essential: ["autocad"], optional: ["solidworks", "quality_control"] },
];
