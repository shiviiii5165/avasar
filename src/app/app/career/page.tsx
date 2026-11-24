import Link from "next/link";

import { evidencePreferencesAction, toggleLearningEvidenceAction } from "@/app/actions/career";
import { CATEGORY_LABEL } from "@/components/opportunity/format";
import { VerificationBadge } from "@/components/opportunity/opportunity-card";
import { OfficialPortalLinks } from "@/components/opportunity/portal-links";
import { discoveryLinks } from "@/server/ingestion/discovery";
import { discoveryFamilies } from "@/server/services/ingestion";
import { Badge, buttonClass, Card, PageHeader, StateMessage } from "@/components/ui";
import { requireCandidate } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { ELIGIBILITY_LABEL } from "@/server/domain/eligibility";
import { EVIDENCE_LABEL, STATE_LABEL, type SkillState } from "@/server/intelligence/evidence";
import { careerIntelligence, CONTROLLABLE_EVIDENCE } from "@/server/services/career";

export const metadata = { title: "Career intelligence" };

const STATE_TONE: Record<SkillState, "success" | "purple" | "orange" | "warning" | "neutral"> = { verified: "success", demonstrated: "purple", practiced: "orange", learning: "warning", declared: "neutral" };
const KIND_LABEL = { observed: "From your profile", inferred: "Inferred (related skill)", unknown: "Not known yet" } as const;
const fmt = (d: Date | null) => (d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "unknown");

/**
 * Evidence-based career intelligence for the signed-in student only. Every statement here comes from the
 * student's own records or from listings shown on the page; nothing is generated, and nothing promises a job.
 */
export default async function CareerPage() {
  const session = await requireCandidate("/app/career");
  const data = await careerIntelligence(await getDb(), session.profileId);
  if (!data) return <StateMessage kind="error" title="Profile not found" />;
  const { skills, readiness, recommendations, roadmap, learning, excluded } = data;
  const families = await discoveryFamilies(await getDb()).catch(() => new Set<string>());
  const portalLinks = discoveryLinks({ query: data.targetRoles[0] ?? skills.find((s) => s.state === "demonstrated" || s.state === "verified")?.name, families });
  const groups: { title: string; states: SkillState[] }[] = [
    { title: "Verified", states: ["verified"] },
    { title: "Demonstrated", states: ["demonstrated"] },
    { title: "Learning and practising", states: ["practiced", "learning"] },
    { title: "Declared, not yet evidenced", states: ["declared"] },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Career intelligence" description="What your evidence shows, how it fits open opportunities, and what to learn next. Recomputed on every visit from your own profile; no score here is a prediction of getting a job." />

      <Card>
        <h2 className="text-lg font-semibold text-navy">My skill profile</h2>
        <p className="mt-1 text-xs text-muted">Each skill&apos;s state comes from the evidence behind it: listing a skill is not the same as showing it. Asking AI Tathastu about a topic counts as learning, never as proficiency.</p>
        {skills.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No skills yet. <Link href="/app/profile" className="font-semibold text-purple hover:underline">Add skills or a project</Link>; an empty profile says nothing about your ability.</p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {groups.map((g) => {
              const list = skills.filter((s) => g.states.includes(s.state));
              if (!list.length) return null;
              return (
                <section key={g.title}>
                  <h3 className="text-sm font-semibold text-navy">{g.title}</h3>
                  <ul className="mt-2 space-y-2">
                    {list.map((s) => (
                      <li key={s.key} className="rounded-lg border border-line p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-navy">{s.name}</span>
                          <Badge tone={STATE_TONE[s.state]}>{STATE_LABEL[s.state]}</Badge>
                          {s.stale && <Badge tone="warning">Evidence over 2 years old</Badge>}
                        </div>
                        <p className="mt-1 text-xs text-muted">{s.basis}. Last evidence: {fmt(s.lastEvidenceAt)}.</p>
                        <p className="mt-1 text-xs text-muted">Sources: {[...new Set(s.evidence.map((e) => EVIDENCE_LABEL[e.type]))].join(" · ")}</p>
                        {s.trajectory.change !== "not_comparable" && (
                          <p className="mt-1 text-xs text-navy">Assessments: {s.trajectory.previous}% → {s.trajectory.latest}% ({s.trajectory.change})</p>
                        )}
                        <p className="mt-1 text-xs text-purple">Next: {s.nextAction}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-navy">Career readiness</h2>
        {readiness.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Set a target role in <Link href="/app/profile" className="font-semibold text-purple hover:underline">your preferred roles</Link> (for example &ldquo;Data analyst&rdquo; or &ldquo;Fitter apprentice&rdquo;) to see what it needs.</p>
        ) : (
          <div className="mt-3 space-y-5">
            {readiness.map((r) => (
              <section key={r.role.id}>
                <h3 className="font-semibold text-navy">{r.role.title}</h3>
                <p className="text-xs text-muted">{r.essentialEvidenced} of {r.essentialTotal} essential skills demonstrated or verified. This is a count of evidence, not a readiness score.</p>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {r.skills.map((s) => (
                    <li key={s.conceptId} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-navy">{s.name}</span>
                      <Badge>{s.importance}</Badge>
                      {s.supportedBy ? (
                        <Badge tone={STATE_TONE[s.supportedBy.state]}>{s.supportedBy.relation === "related" ? `related: ${s.supportedBy.name}` : STATE_LABEL[s.supportedBy.state]}</Badge>
                      ) : (
                        <Badge tone="danger">not yet shown</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-navy">Recommended opportunities</h2>
        <p className="mt-1 text-xs text-muted">Ranked by documented rules (skills first, then your stated preferences). Listings whose stated requirements you don&apos;t meet are left out; unknown eligibility is shown, not held against you.</p>
        {recommendations.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No open listings to recommend right now.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {recommendations.map(({ o, match }) => (
              <li key={o.id} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="purple">{CATEGORY_LABEL[o.category] ?? o.category}</Badge>
                  <VerificationBadge level={o.verification} />
                  <Badge>{ELIGIBILITY_LABEL[match.eligibility.status]}</Badge>
                  {match.score === null && <Badge tone="warning">Not ranked: add skills to compare</Badge>}
                </div>
                <h3 className="mt-2 font-semibold text-navy"><Link href={`/opportunities/${o.slug}`} className="hover:underline">{o.title}</Link></h3>
                <p className="text-sm text-muted">{o.organizationName}</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {match.explanations.slice(0, 6).map((e, i) => (
                    <li key={i}><span className="text-xs font-semibold text-muted">{KIND_LABEL[e.kind]}:</span> <span className="text-navy">{e.text}</span></li>
                  ))}
                </ul>
                {match.learnNext.length > 0 && <p className="mt-2 text-sm text-purple">Learn next: {match.learnNext.join(", ")}</p>}
                <p className="mt-2 text-xs text-muted">
                  Source: {o.sourceProvider ?? "Posted on Avsar"}
                  {o.sourceUrl && <> · <a href={o.sourceUrl} rel="noopener noreferrer nofollow" target="_blank" className="hover:underline">original listing</a></>}
                  {" · "}Last checked: {fmt(o.lastCheckedAt ?? o.lastVerifiedAt ?? o.updatedAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
        <OfficialPortalLinks links={portalLinks} title={data.targetRoles[0] ? `Search official portals for ${data.targetRoles[0]}` : "Search official portals"} />
      </Card>

      {roadmap.length > 0 && (
        <Card>
          <h2 className="text-lg font-semibold text-navy">Skill gap roadmap{readiness[0] ? ` toward ${readiness[0].role.title}` : ""}</h2>
          <ol className="mt-3 space-y-3">
            {roadmap.map((r, i) => (
              <li key={r.conceptId} className="text-sm">
                <p className="font-semibold text-navy">{i + 1}. {r.skill} <span className="font-normal text-muted">({r.why}{r.openListings ? `; asked for by ${r.openListings} open listing${r.openListings === 1 ? "" : "s"}` : ""})</span></p>
                {r.buildsOn && <p className="text-muted">Builds on your {r.buildsOn}.</p>}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-muted">
            Practise these on {data.aitLearnUrl ? <a href={data.aitLearnUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-purple hover:underline">AI Tathastu Learning</a> : "AI Tathastu"}, then add the project here so it counts as evidence. Completing a roadmap doesn&apos;t guarantee an interview or a job.
          </p>
        </Card>
      )}

      <Card>
        <h2 className="text-lg font-semibold text-navy">What counts toward your career profile</h2>
        <p className="mt-1 text-xs text-muted">You decide which evidence is used. Unticked types are ignored everywhere on this page and in your recommendations.</p>
        <form action={evidencePreferencesAction} className="mt-3 space-y-2">
          {CONTROLLABLE_EVIDENCE.map((c) => (
            <label key={c.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="exclude" value={c.key} defaultChecked={excluded.includes(c.key)} />
              Don&apos;t use: {c.label}
            </label>
          ))}
          <button className={buttonClass("secondary", "sm")}>Save</button>
        </form>
        {learning.length > 0 && (
          <>
            <h3 className="mt-5 text-sm font-semibold text-navy">Learning activity received from AI Tathastu</h3>
            <p className="text-xs text-muted">Only what happened, for which skill and when. Avsar never receives your conversations.</p>
            <ul className="mt-2 divide-y divide-line text-sm">
              {learning.slice(0, 30).map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className={e.includedInProfile ? "text-navy" : "text-muted line-through"}>{e.skillName}: {e.kind.replace(/_/g, " ")}{e.title ? ` (${e.title})` : ""}{e.score !== null && e.maxScore ? `, ${e.score}/${e.maxScore}` : ""} · {fmt(e.occurredAt)}</span>
                  <form action={toggleLearningEvidenceAction.bind(null, e.id, !e.includedInProfile)}>
                    <button className={buttonClass("ghost", "sm")}>{e.includedInProfile ? "Exclude" : "Include"}</button>
                  </form>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
