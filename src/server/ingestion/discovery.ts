/**
 * Official-portal discovery links for sources Avsar may LINK to but not collect from (link-only, or an authorized
 * feed not configured yet). Each link opens the portal's own public search; nothing is fetched, copied or shown as
 * an Avsar listing. URL patterns were checked against the portals' own public navigation on 2026-11-24.
 */
export interface DiscoveryLink { family: string; portal: string; label: string; url: string; note: string }

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const clean = (s: string | undefined) => (s ?? "").replace(/[^\p{L}\p{N} +#./-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);

export function discoveryLinks(input: { query?: string; type?: "job" | "internship" | "apprenticeship" | null; families: Set<string> }): DiscoveryLink[] {
  const q = clean(input.query);
  const out: DiscoveryLink[] = [];
  const want = (f: string) => input.families.has(f);
  if (want("aicte_internship") && input.type !== "apprenticeship") {
    out.push({ family: "aicte_internship", portal: "AICTE National Internship Portal", label: q ? `"${q}" internships on AICTE` : "All live internships on AICTE", url: q ? `https://internship.aicte-india.org/internships?q=${encodeURIComponent(q)}` : "https://internship.aicte-india.org/internships", note: "Government internships; apply on the portal." });
    if (!q) out.push({ family: "aicte_internship", portal: "AICTE National Internship Portal", label: "Remote internships on AICTE", url: "https://internship.aicte-india.org/internships?mode=Remote", note: "Work-from-home internships." });
  }
  if (want("ncs") && input.type !== "internship") {
    out.push({ family: "ncs", portal: "National Career Service", label: "Jobs on National Career Service", url: "https://www.ncs.gov.in/job-listing", note: "Government and private jobs; free registration to apply." });
    out.push({ family: "ncs", portal: "National Career Service", label: "Government jobs on NCS", url: "https://www.ncs.gov.in/job-listing?isGovernmentJob=true", note: "Central and state government openings." });
  }
  if (want("nats") && (input.type === "apprenticeship" || !input.type)) {
    out.push({ family: "nats", portal: "NATS 2.0", label: "Graduate & diploma apprenticeships (NATS)", url: "https://nats.education.gov.in/", note: "Register as a student to see establishments' apprenticeship openings." });
  }
  if (want("naukri") && input.type !== "apprenticeship") {
    out.push({ family: "naukri", portal: "Naukri.com", label: q ? `"${q}" jobs on Naukri` : "Jobs on Naukri", url: q && slug(q) ? `https://www.naukri.com/${slug(q)}-jobs` : "https://www.naukri.com/", note: "Third-party job board. Listings there are not verified by Avsar." });
  }
  return out;
}
