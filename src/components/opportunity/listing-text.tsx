/**
 * Long listing descriptions (often pasted from a careers site) turned into readable story slides: split at their own
 * headings ("The Opportunity", "What You'll Do"…), list-like lines shown as bullets, "Label: text" with the label in
 * bold, and the double-escaped entities imported feeds carry ("&amp;") decoded for display. React still escapes the
 * result, so decoding here can never inject markup.
 */
const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " " };

export function decodeEntities(s: string): string {
  let out = s;
  // Twice: feeds sometimes escape already-escaped text ("&amp;amp;").
  for (let i = 0; i < 2; i++) out = out.replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m] ?? m);
  return out;
}

export interface TextSection { title: string; lines: string[] }

/** A heading line: short, no sentence ending, not a bullet, and not "Label: long text". */
function isHeading(line: string): boolean {
  const l = line.trim();
  if (l.length < 3 || l.length > 48) return false;
  if (/^[-•*·▪●]/.test(l) || /[.,;!?]$/.test(l)) return false;
  if (/:\s*\S/.test(l)) return false;
  return /^[A-Z0-9]/.test(l) && l.split(/\s+/).length <= 7;
}

/** Splits a description into titled sections; the first untitled block is "About the role". At most `max` sections. */
export function splitSections(text: string, max = 5): TextSection[] {
  const lines = decodeEntities(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const sections: TextSection[] = [];
  let cur: TextSection = { title: "About the role", lines: [] };
  for (const line of lines) {
    if (isHeading(line) && cur.lines.length > 0) {
      sections.push(cur);
      cur = { title: line.replace(/:$/, ""), lines: [] };
    } else if (isHeading(line) && cur.lines.length === 0 && sections.length > 0) {
      cur.title = line.replace(/:$/, "");
    } else {
      cur.lines.push(line);
    }
  }
  if (cur.lines.length) sections.push(cur);
  // Drop identifier-only lines (job codes like "GAQ126R44") at the very start.
  if (sections[0]) sections[0].lines = sections[0].lines.filter((l, i) => !(i === 0 && /^[A-Z0-9-]{5,14}$/.test(l)));
  const kept = sections.filter((s) => s.lines.length);
  if (kept.length <= max) return kept;
  const head = kept.slice(0, max - 1);
  const rest = kept.slice(max - 1);
  head.push({ title: rest[0].title, lines: rest.flatMap((s, i) => (i === 0 ? s.lines : [`${s.title}:`, ...s.lines])) });
  return head;
}

const DO = /(you'?ll do|you will do|responsibil|the role|role overview|day[- ]to[- ]day|opportunity|impact|what you'?ll|your work|the job)/i;
const NEED = /(bring|require|qualif|experience|looking for|skills|who you are|must have|nice to have|preferred|you have|about you)/i;
const SKIP = /(inclusion|diversity|equal|compliance|benefit|perks|privacy|eeo|accommodat|commitment|salary|compensation|legal|disclaimer|@)/i;
const COMPANY = /(about (us|the company)|who we are|our company|our mission)/i;
const OVERVIEW = /(opportunit|about the (role|position|job)|role overview|position summary|overview|summary|the role)/i;

function sentences(text: string): string[] {
  return text.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g)?.map((s) => s.trim()).filter((s) => s.length > 2) ?? [];
}
/** At most `n` characters, cut at a word boundary. */
function clip(s: string, n: number): string {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), n - 20)).replace(/[,;:\s]+$/, "")}…`;
}
/** Leading heading words glued into the first sentence ("About Team & About Role Identity is…"). */
function stripLeadIn(s: string): string {
  return s.replace(/^(about (the )?(team|role|us|company|position|job)\s*(&|and)?\s*)+/i, "").replace(/^[a-z]/, (c) => c.toUpperCase());
}
function bulletsOf(lines: string[], max = 5): string[] {
  const items = lines.some((l) => isListItem(l)) ? lines.filter((l) => isListItem(l)).map((l) => l.replace(/^[-•*·▪●]\s*/, "")) : lines.flatMap(sentences);
  // Whole first sentences (never cut with "…"); heading lines like "About the role" are not bullets.
  return [...new Set(items.map((i) => sentences(i.trim())[0] ?? i.trim()))].filter((i) => i.length > 8 && !isHeading(i)).slice(0, max);
}

export interface ListingSummary { overview: string; role: string[]; need: string[]; company: string | null }

/**
 * A short, organized summary of a long listing: a 2-sentence overview, up to 5 bullets for the role and for what
 * they want, and 2 sentences about the company. Legal/benefits boilerplate is left out (it stays in the full text).
 */
export function summarizeListing(description: string, opts: { summary?: string | null; responsibilities?: string | null; organization: string }): ListingSummary {
  const all = splitSections(description, 99);
  const org = opts.organization.toLowerCase();
  const isCompany = (t: string) => COMPANY.test(t) || (org.length > 2 && t.toLowerCase().includes(org) && /about|who/i.test(t));
  const kept = all.filter((s) => !SKIP.test(s.title));
  // The company blurb usually closes the posting; an "About <company>" at the top tends to describe the team.
  const companySecs = kept.filter((s) => isCompany(s.title));
  const companySec = companySecs.at(-1);
  const roleSecs = kept.filter((s) => s !== companySec && DO.test(s.title) && !NEED.test(s.title));
  const needSecs = kept.filter((s) => s !== companySec && NEED.test(s.title));
  const intro = kept.find((s) => OVERVIEW.test(s.title)) ?? kept.find((s) => s !== companySec && !needSecs.includes(s)) ?? kept[0];

  const overviewSource = opts.summary?.trim() || intro?.lines.join(" ") || "";
  const overview = clip(sentences(stripLeadIn(decodeEntities(overviewSource))).slice(0, 2).join(" "), 520);
  const respLines = opts.responsibilities ? decodeEntities(opts.responsibilities).split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : [];
  const role = bulletsOf(respLines.length ? respLines : roleSecs.flatMap((s) => s.lines));
  const need = bulletsOf(needSecs.flatMap((s) => s.lines));
  const company = companySec ? clip(sentences(stripLeadIn(companySec.lines.join(" "))).slice(0, 2).join(" "), 300) : null;
  return { overview, role, need, company };
}

/** Lines that read as list items: bullets, "Label: text", or short lines inside a run of similar lines. */
function isListItem(line: string): boolean {
  return /^[-•*·▪●]\s*/.test(line) || /^[A-Z][^:]{2,40}:\s+\S/.test(line);
}

export function SlideHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="font-serif text-[1.65rem] leading-tight text-navy">{children}</h2>;
}

export function SlideBullets({ items, dot }: { items: string[]; dot: string }) {
  return (
    <ul className="space-y-3">
      {items.map((b) => (
        <li key={b} className="flex gap-3 text-[16px] leading-relaxed text-[#2b2f5c]">
          <span aria-hidden className="mt-[0.6em] size-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
          <span>{(() => { const m = b.match(/^([A-Z][^:]{2,40}):\s+([\s\S]+)$/); return m ? <><strong className="font-semibold text-[#16183a]">{m[1]}:</strong> {m[2]}</> : b; })()}</span>
        </li>
      ))}
    </ul>
  );
}

export function SectionBody({ lines, dot }: { lines: string[]; dot: string }) {
  const blocks: { list: boolean; items: string[] }[] = [];
  for (const l of lines) {
    const list = isListItem(l);
    const last = blocks.at(-1);
    if (last && last.list === list && list) last.items.push(l);
    else blocks.push({ list, items: [l] });
  }
  return (
    <div className="space-y-3 text-[15.5px] leading-[1.7] text-[#2b2f5c]">
      {blocks.map((b, i) =>
        b.list ? (
          <ul key={i} className="space-y-2">
            {b.items.map((it, j) => {
              const clean = it.replace(/^[-•*·▪●]\s*/, "");
              const m = clean.match(/^([A-Z][^:]{2,40}):\s+([\s\S]+)$/);
              return (
                <li key={j} className="flex gap-2.5">
                  <span aria-hidden className="mt-[0.7em] size-1.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
                  <span>{m ? <><strong className="font-semibold text-[#16183a]">{m[1]}:</strong> {m[2]}</> : clean}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          b.items.map((p, j) => <p key={`${i}-${j}`}>{p}</p>)
        ),
      )}
    </div>
  );
}
