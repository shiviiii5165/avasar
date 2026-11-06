import Link from "next/link";

import { Badge, buttonClass, Card, PageHeader, StateMessage } from "@/components/ui";
import { requireCandidate } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { candidateFactsFor, matchAll } from "@/server/services/candidate-context";
import { searchOpportunities, searchSchema } from "@/server/services/opportunities";
import { loadProfile } from "@/server/services/profiles";

export const metadata = { title: "Career insights" };

/**
 * Career insights grounded only in real data: the candidate's own profile and the currently open listings.
 * No AI-generated claims; every number here can be traced back to listings shown on the page.
 */
export default async function InsightsPage() {
  const session = await requireCandidate("/app/insights");
  const db = await getDb();
  const [profile, open] = await Promise.all([loadProfile(db, session.profileId), searchOpportunities(db, searchSchema.parse({}))]);
  const facts = await candidateFactsFor(db, session.profileId);
  const matches = matchAll(facts, open.items);
  const prefs = profile!.profile.preferredCategories;
  const relevant = open.items.filter((o) => !prefs.length || prefs.includes(o.category));

  const gaps = new Map<string, string[]>();
  for (const o of relevant) for (const s of matches.get(o.id)?.missingRequiredSkills ?? []) gaps.set(s, [...(gaps.get(s) ?? []), o.title]);
  const ranked = [...gaps].sort((a, b) => b[1].length - a[1].length).slice(0, 8);
  const unbacked = profile!.skills.filter((s) => s.evidenceCount === 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Career insights" description={`Based on your profile and the ${relevant.length} open listing${relevant.length === 1 ? "" : "s"} in the categories you're interested in. Recomputed every time you visit.`} />
      {!profile!.skills.length ? (
        <StateMessage kind="empty" title="Add your skills first" body="Insights compare your skills with what open opportunities ask for." action={<Link href="/app/profile" className={buttonClass("primary")}>Add skills</Link>} />
      ) : (
        <>
          <Card>
            <h2 className="text-lg font-semibold text-navy">Skills that would open the most doors</h2>
            <p className="mt-1 text-xs text-muted">Required skills you haven&apos;t listed, counted across open listings.</p>
            {ranked.length ? (
              <ul className="mt-4 space-y-3">
                {ranked.map(([skill, titles]) => (
                  <li key={skill}>
                    <p className="text-sm font-semibold text-navy">{skill} <Badge tone="purple">required by {titles.length}</Badge></p>
                    <p className="text-xs text-muted">{titles.slice(0, 3).join(" · ")}{titles.length > 3 ? ` and ${titles.length - 3} more` : ""}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">You already list every required skill in the open listings that interest you.</p>
            )}
          </Card>
          <Card>
            <h2 className="text-lg font-semibold text-navy">Strengthen your evidence</h2>
            <p className="mt-1 text-xs text-muted">Skills without a project or role behind them. Adding a project that uses them makes your profile more convincing.</p>
            {unbacked.length ? (
              <ul className="mt-3 flex flex-wrap gap-2">{unbacked.map((s) => <li key={s.id}><Badge>{s.name}</Badge></li>)}</ul>
            ) : (
              <p className="mt-3 text-sm text-muted">Every skill you list has evidence behind it.</p>
            )}
            <Link href="/app/profile" className="mt-4 inline-block text-sm font-semibold text-purple hover:underline">Add a project</Link>
          </Card>
          <p className="text-xs text-muted">Resume analysis, learning resources and AI-assisted roadmaps are planned for a later release and will always ask you to confirm anything they suggest.</p>
        </>
      )}
    </div>
  );
}
