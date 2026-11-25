"use client";

import { ArrowRight, BadgeCheck, CalendarDays, Info, List, Network, Sparkles, Target, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { STATUS, type SkillState } from "@/server/intelligence/evidence";

import { layoutSkillNetwork, LABEL_PX, type NetworkLayout } from "./skill-network-layout";
import type { SkillLink, SkillView } from "./skill-view";
import { StatusPill } from "./status-pill";
import { STATUS_ORDER, STATUS_STYLE } from "./status-style";

/**
 * The student's skills as a colourful bubble network (visual language shared with AI Tathastu's Skills
 * Intelligence), with a list view as the text alternative.
 *  - Colour = evidence status (legend + filters). Size = number of evidence items on record. Nothing else.
 *  - Lines join skills used in the same project or job on the profile. No other line is ever drawn.
 *  - Tap, click, Enter or Space on a skill opens its details below the picture; Escape closes them.
 */
const MAX_DRAWN = 24;
const STATES = STATUS_ORDER.filter((s): s is SkillState => s !== "related" && s !== "not_shown");

export function SkillExplorer({ skills, links, aitLearnUrl }: { skills: SkillView[]; links: SkillLink[]; aitLearnUrl: string | null }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [view, setView] = useState<"bubbles" | "list">("bubbles");
  const [filter, setFilter] = useState<SkillState | "all">("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = Object.fromEntries(STATES.map((s) => [s, 0])) as Record<SkillState, number>;
    for (const s of skills) c[s.state]++;
    return c;
  }, [skills]);
  const ordered = useMemo(() => [...skills].sort((a, b) => STATES.indexOf(a.state) - STATES.indexOf(b.state) || b.evidenceCount - a.evidenceCount || a.name.localeCompare(b.name)), [skills]);
  const shown = useMemo(() => ordered.filter((s) => filter === "all" || s.state === filter), [ordered, filter]);
  const drawn = useMemo(() => shown.slice(0, MAX_DRAWN), [shown]);
  const drawnKeys = useMemo(() => new Set(drawn.map((s) => s.key)), [drawn]);
  const drawnLinks = useMemo(() => links.filter((l) => drawnKeys.has(l.source) && drawnKeys.has(l.target)), [links, drawnKeys]);
  const selected = skills.find((s) => s.key === selectedKey) ?? null;
  const byKey = useMemo(() => new Map(skills.map((s) => [s.key, s])), [skills]);
  const usedWith = useMemo(
    () => (selected ? links.filter((l) => l.source === selected.key || l.target === selected.key).map((l) => ({ skill: byKey.get(l.source === selected.key ? l.target : l.source)!, via: l.via })).filter((x) => x.skill) : []),
    [selected, links, byKey],
  );
  const focusKey = selectedKey ?? hoverKey;
  const neighbours = useMemo(() => {
    if (!focusKey) return null;
    const n = new Set([focusKey]);
    for (const l of drawnLinks) if (l.source === focusKey || l.target === focusKey) n.add(l.source === focusKey ? l.target : l.source);
    return n;
  }, [focusKey, drawnLinks]);

  // Laid out at the real pixel width, so labels stay at their true size on every screen.
  const [width, setWidth] = useState(0);
  const frame = useCallback((el: HTMLDivElement | null) => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const layout = useMemo<NetworkLayout | null>(() => (width > 0 && drawn.length ? layoutSkillNetwork(drawn.map((s) => ({ id: s.key, name: s.name, evidenceCount: s.evidenceCount })), drawnLinks, width) : null), [drawn, drawnLinks, width]);

  const opener = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const open = (key: string) => {
    if (key === selectedKey) return close();
    if (!selectedKey) opener.current = document.activeElement as HTMLElement | null;
    setSelectedKey(key);
  };
  const close = useCallback(() => {
    setSelectedKey(null);
    opener.current?.focus();
  }, []);
  useEffect(() => {
    if (!selectedKey) return;
    // Bring the details into view (on a phone they sit below a tall picture). Instant when motion is reduced.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    panel.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedKey, close]);

  const total = skills.length;

  return (
    <section aria-labelledby={`${uid}-title`} className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6" data-testid="skill-explorer">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${uid}-title`} className="text-xl font-semibold text-navy">Your skills</h2>
          <p className="mt-0.5 text-sm text-muted">What your profile shows today, and how each skill is backed up. Tap a skill to see its evidence.</p>
        </div>
        <div role="group" aria-label="Show skills as" className="flex rounded-full border border-line bg-surface-muted p-0.5 text-xs font-semibold">
          {(["bubbles", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple ${view === v ? "bg-surface text-navy shadow-card" : "text-muted hover:text-navy"}`}
            >
              {v === "bubbles" ? <Network aria-hidden className="size-3.5" /> : <List aria-hidden className="size-3.5" />}
              {v === "bubbles" ? "Bubbles" : "List"}
            </button>
          ))}
        </div>
      </div>

      {/* Evidence mix: how many skills sit at each status. Doubles as the legend and the filter. */}
      <div className="mt-5">
        <p className="text-sm font-semibold text-navy">
          {total} {total === 1 ? "skill" : "skills"} on your profile
        </p>
        <div className="mt-2 flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={`Skills by evidence: ${STATES.filter((s) => counts[s]).map((s) => `${counts[s]} ${STATUS[s].label}`).join(", ")}`}>
          {STATES.filter((s) => counts[s]).map((s) => (
            <span key={s} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(counts[s] / total) * 100}%`, background: STATUS_STYLE[s].outlined ? STATUS_STYLE[s].dot : STATUS_STYLE[s].light }} title={`${STATUS[s].label}: ${counts[s]}`} />
          ))}
        </div>
        <div role="group" aria-label="Filter skills by evidence" className="mt-3 flex flex-wrap gap-2">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="All" count={total} />
          {STATES.filter((s) => counts[s]).map((s) => (
            <FilterChip key={s} active={filter === s} onClick={() => setFilter(filter === s ? "all" : s)} label={STATUS[s].label} count={counts[s]} dot={STATUS_STYLE[s].dot} hint={STATUS[s].explain} />
          ))}
        </div>
      </div>

      {view === "bubbles" ? (
        <div
          ref={frame}
          className="relative mt-4 w-full overflow-hidden rounded-xl border border-line/70"
          style={{ backgroundColor: "#fcfbff", backgroundImage: "radial-gradient(circle, #e7e2f3 1px, transparent 1px)", backgroundSize: "18px 18px" }}
          data-testid="skill-network"
        >
          {layout ? (
            <svg width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} className="block" role="group" aria-label={`${drawn.length} skills as bubbles. Bigger means more evidence on record. The list view shows the same skills as text.`}>
              <defs>
                {STATES.map((s) => (
                  <radialGradient key={s} id={`${uid}-${s}`} cx="32%" cy="28%" r="80%">
                    <stop offset="0%" stopColor={STATUS_STYLE[s].light} />
                    <stop offset="55%" stopColor={STATUS_STYLE[s].deep} stopOpacity={STATUS_STYLE[s].outlined ? 0 : 1} />
                    <stop offset="100%" stopColor={STATUS_STYLE[s].deep} stopOpacity={STATUS_STYLE[s].outlined ? 0 : 1} />
                  </radialGradient>
                ))}
              </defs>
              <g aria-hidden>
                {drawnLinks.map((l) => {
                  const a = layout.nodes.get(l.source);
                  const b = layout.nodes.get(l.target);
                  if (!a || !b) return null;
                  const touches = focusKey !== null && (l.source === focusKey || l.target === focusKey);
                  const faded = focusKey !== null && !touches;
                  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
                  const dx = b.x - a.x, dy = b.y - a.y;
                  const len = Math.hypot(dx, dy) || 1;
                  const bend = Math.min(20, len * 0.12);
                  return (
                    <path
                      key={`${l.source}|${l.target}`}
                      d={`M ${a.x} ${a.y} Q ${mx - (dy / len) * bend} ${my + (dx / len) * bend} ${b.x} ${b.y}`}
                      fill="none"
                      stroke={STATUS_STYLE[byKey.get(l.source)?.state ?? "declared"].dot}
                      strokeLinecap="round"
                      strokeWidth={touches ? 2.25 : 1.25}
                      strokeOpacity={faded ? 0.1 : touches ? 0.9 : 0.45}
                      className="motion-safe:transition-[stroke-opacity,stroke-width] motion-safe:duration-200"
                    />
                  );
                })}
              </g>
              {drawn.map((s) => {
                const p = layout.nodes.get(s.key);
                if (!p) return null;
                return (
                  <Bubble
                    key={s.key}
                    skill={s}
                    x={p.x}
                    y={p.y}
                    r={p.r}
                    lines={p.lines}
                    fill={`url(#${uid}-${s.state})`}
                    active={s.key === selectedKey}
                    dimmed={neighbours !== null && !neighbours.has(s.key)}
                    onSelect={() => open(s.key)}
                    onHover={(on) => setHoverKey(on ? s.key : null)}
                  />
                );
              })}
            </svg>
          ) : (
            <div aria-hidden className="h-72 motion-safe:animate-pulse bg-surface-muted/60" />
          )}
          {shown.length > drawn.length && (
            <p className="border-t border-line/70 bg-surface/90 px-3 py-2 text-xs text-muted">
              Showing your {drawn.length} best-evidenced skills of {shown.length}.{" "}
              <button type="button" onClick={() => setView("list")} className="font-semibold text-purple underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-purple">
                See all in the list
              </button>{" "}
              or pick a filter above.
            </p>
          )}
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line" aria-label="Your skills" data-testid="skill-list">
          {shown.map((s) => (
            <li key={s.key}>
              <button
                type="button"
                aria-pressed={s.key === selectedKey}
                onClick={() => open(s.key)}
                className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-purple aria-pressed:bg-purple-soft/50"
              >
                <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: STATUS_STYLE[s.state].dot }} />
                <span className="min-w-0 flex-1 truncate font-semibold text-navy">{s.name}</span>
                <span className="shrink-0 text-xs text-muted">{s.label}</span>
                <span className="hidden w-24 shrink-0 text-right text-xs tabular-nums text-muted sm:block">{s.evidenceCount} evidence</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div ref={panel} aria-live="polite" className="scroll-mt-24">
        {selected && <SkillDetail skill={selected} usedWith={usedWith} onSelect={(k) => setSelectedKey(k)} onClose={close} aitLearnUrl={aitLearnUrl} />}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <svg aria-hidden width="22" height="12"><circle cx="5" cy="6" r="3.5" fill="#a59fc0" /><circle cx="15" cy="6" r="5.5" fill="#a59fc0" /></svg>
          Bigger bubble = more evidence on record
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg aria-hidden width="18" height="8"><path d="M1 6 Q 9 0 17 6" fill="none" stroke="#a59fc0" strokeWidth="1.5" /></svg>
          Line = used in the same project or job
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg aria-hidden width="12" height="12"><circle cx="6" cy="6" r="5" fill="#eef4ff" stroke="#3b82f6" strokeWidth="1.2" strokeDasharray="2 1.5" /></svg>
          Dashed = added to profile, nothing backs it yet
        </span>
      </div>
    </section>
  );
}

function FilterChip({ active, onClick, label, count, dot, hint }: { active: boolean; onClick: () => void; label: string; count: number; dot?: string; hint?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      title={hint}
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple ${active ? "border-navy bg-navy text-white" : "border-line bg-surface text-navy hover:bg-surface-muted"}`}
    >
      {dot && <span aria-hidden className="size-2.5 rounded-full ring-1 ring-white/70" style={{ background: dot }} />}
      {label}
      <span className={`tabular-nums ${active ? "text-white/80" : "text-muted"}`}>{count}</span>
    </button>
  );
}

function Bubble({ skill, x, y, r, lines, fill, active, dimmed, onSelect, onHover }: { skill: SkillView; x: number; y: number; r: number; lines: string[]; fill: string; active: boolean; dimmed: boolean; onSelect: () => void; onHover: (on: boolean) => void }) {
  const style = STATUS_STYLE[skill.state];
  const outlined = Boolean(style.outlined);
  const lineH = LABEL_PX + 1.5;
  const block = lines.length * lineH + 11;
  const firstY = y - block / 2 + LABEL_PX - 1;
  const onKeyDown = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  };
  return (
    <g
      role="button"
      tabIndex={0}
      data-skill={skill.name}
      data-status={skill.state}
      aria-pressed={active}
      aria-label={`${skill.name}: ${skill.label}, ${skill.evidenceCount} evidence ${skill.evidenceCount === 1 ? "item" : "items"}. Show details.`}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      className="cursor-pointer outline-none motion-safe:transition-opacity motion-safe:duration-200 [&:focus-visible>.focus-ring]:opacity-100"
      style={{ opacity: dimmed ? 0.3 : 1 }}
    >
      <title>{`${skill.name} · ${skill.label}`}</title>
      {active && <circle cx={x} cy={y} r={r + 7} fill={style.dot} fillOpacity={0.18} />}
      <circle className="focus-ring opacity-0" cx={x} cy={y} r={r + 4} fill="none" stroke="#1c1f4a" strokeWidth={2} />
      {outlined ? (
        <circle cx={x} cy={y} r={r} fill={style.light} stroke={style.dot} strokeWidth={active ? 2.5 : 1.75} strokeDasharray="5 4" />
      ) : (
        <circle cx={x} cy={y} r={r} fill={fill} stroke="#ffffff" strokeWidth={active ? 3 : 2} />
      )}
      <text x={x} textAnchor="middle" fontSize={LABEL_PX} fontWeight={700} fill={outlined ? style.deep : "#ffffff"} className="pointer-events-none select-none" style={outlined ? undefined : { textShadow: "0 1px 2px rgba(15, 23, 42, 0.35)" }}>
        {lines.map((line, i) => (
          <tspan key={i} x={x} y={firstY + i * lineH}>
            {line}
          </tspan>
        ))}
      </text>
      <text x={x} y={firstY + lines.length * lineH + 0.5} textAnchor="middle" fontSize={9.5} fontWeight={600} fill={outlined ? style.deep : "#ffffff"} fillOpacity={0.9} className="pointer-events-none select-none tabular-nums">
        {skill.evidenceCount} evidence
      </text>
    </g>
  );
}

function SkillDetail({ skill, usedWith, onSelect, onClose, aitLearnUrl }: { skill: SkillView; usedWith: { skill: SkillView; via: string }[]; onSelect: (key: string) => void; onClose: () => void; aitLearnUrl: string | null }) {
  const style = STATUS_STYLE[skill.state];
  const needsEvidence = skill.state !== "verified" && skill.state !== "demonstrated";
  return (
    <div role="region" aria-label={`${skill.name} details`} className="mt-4 overflow-hidden rounded-xl border border-line bg-surface" data-testid="skill-detail">
      <div aria-hidden className="h-1" style={{ background: style.dot }} />
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-navy">{skill.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StatusPill state={skill.state} label={skill.label} />
              {skill.goal && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-navy-soft">
                  <Target aria-hidden className="size-3.5" /> {skill.goal}
                </span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={`Close ${skill.name} details`} className="rounded-full p-2 text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-navy focus-visible:outline-2 focus-visible:outline-purple">
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <p className="mt-2 flex gap-1.5 text-sm text-navy-soft">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
          {skill.explain}
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Where this comes from</h4>
            <ul className="mt-2 space-y-1.5 text-sm">
              {skill.sources.map((e, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-1.5">
                  {e.verified && <BadgeCheck aria-label="Verified" className="size-3.5 shrink-0 self-center text-success" />}
                  <span className="font-medium text-navy">{e.kind}</span>
                  {e.detail && <span className="min-w-0 break-words text-navy-soft">· {e.detail}</span>}
                  {e.date && <span className="text-xs tabular-nums text-muted">· {e.date}</span>}
                </li>
              ))}
              {skill.evidenceCount > skill.sources.length && <li className="text-xs text-muted">and {skill.evidenceCount - skill.sources.length} more</li>}
            </ul>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
              <CalendarDays aria-hidden className="size-3.5" />
              Last evidence: {skill.lastEvidence ?? "date not recorded"}
              {skill.stale && <span className="font-semibold text-warning"> · over 2 years old</span>}
            </p>
            {skill.assessments && <p className="mt-1 text-xs text-navy-soft">{skill.assessments}</p>}
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">What you can do next</h4>
            <p className="mt-2 flex gap-1.5 text-sm text-navy">
              <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-purple" />
              {skill.nextAction}.
            </p>
            {needsEvidence && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <Link href="/app/profile" className="inline-flex items-center gap-1 font-semibold text-purple underline-offset-4 hover:underline">
                  Add a project <ArrowRight aria-hidden className="size-3.5" />
                </Link>
                {aitLearnUrl && (
                  <a href={aitLearnUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-purple underline-offset-4 hover:underline">
                    Practise on AI Tathastu <ArrowRight aria-hidden className="size-3.5" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                )}
              </div>
            )}
            {usedWith.length > 0 && (
              <>
                <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Used together with</h4>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {usedWith.slice(0, 8).map((u) => (
                    <li key={u.skill.key}>
                      <button type="button" onClick={() => onSelect(u.skill.key)} title={`Both in: ${u.via}`} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 text-xs font-semibold text-navy transition-colors duration-150 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-purple">
                        <span aria-hidden className="size-2 rounded-full" style={{ background: STATUS_STYLE[u.skill.state].dot }} />
                        {u.skill.name}
                        <span className="sr-only">, both in {u.via}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
