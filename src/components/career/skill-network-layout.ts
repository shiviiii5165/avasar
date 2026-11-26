/**
 * Deterministic layout for the skill explorer's bubble network. Client-safe, no randomness and no dependencies:
 * the same skills at the same width always give the same picture.
 *
 * Ported from AI Tathastu's Skills Intelligence layout (src/lib/dashboard/skill-network-layout.ts) so both
 * products share one visual language; AVSAR does not depend on AI Tathastu at runtime.
 *
 * The best-evidenced skill sits at the centre and the rest are placed in rings, then relaxed so circles never
 * touch, while skills used in the same project or job are pulled gently together. Each circle is at least big
 * enough for its name; beyond that, its size comes only from the number of evidence items on record.
 */
export type LayoutInput = { id: string; name: string; evidenceCount: number };
export type LayoutEdge = { source: string; target: string };
export type PlacedNode = { id: string; x: number; y: number; r: number; lines: string[] };
export type NetworkLayout = { width: number; height: number; nodes: Map<string, PlacedNode>; labelPx: number };

/** Text metrics and sizing for the available width: larger labels and circles on wide screens, compact on phones. */
export interface Metrics { labelPx: number; charW: number; lineH: number; chars: number; scale: number }
export function metricsFor(width: number): Metrics {
  if (width >= 900) return { labelPx: 13, charW: 7.6, lineH: 15, chars: 16, scale: 1.2 };
  if (width >= 640) return { labelPx: 12, charW: 7.1, lineH: 14, chars: 14, scale: 1.1 };
  return { labelPx: 11.5, charW: 6.9, lineH: 13.5, chars: 13, scale: 1 };
}
const COMPACT = metricsFor(0);

const MAX_LINES = 3;
const GAP = 10;
const EDGE_MARGIN = 8;
/** Evidence counts above this all get the largest circle, so one very busy skill can't dwarf the rest. */
const COUNT_CAP = 8;

/** The name as drawn inside the circle: wrapped at spaces into up to three short lines. The full name is in the tooltip and details. */
export function labelLines(name: string, chars = COMPACT.chars): string[] {
  const clip = (s: string) => (s.length > chars ? `${s.slice(0, chars - 1).trimEnd()}…` : s);
  const lines: string[] = [];
  for (const word of name.trim().split(/\s+/)) {
    const last = lines[lines.length - 1];
    if (last !== undefined && `${last} ${word}`.length <= chars) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  if (lines.length > MAX_LINES) lines.splice(MAX_LINES - 1, lines.length, `${lines[MAX_LINES - 1]}…`);
  return lines.map(clip);
}

/** Fewer skills on screen, bigger circles all round (the same factor for every circle, so sizes stay comparable). */
export function roomFor(count: number): number {
  return count <= 4 ? 1.45 : count <= 10 ? 1.15 : 1;
}

/** Smallest circle that holds this name. */
function labelFloor(name: string, m: Metrics): number {
  const lines = labelLines(name, m.chars);
  const w = Math.max(...lines.map((l) => l.length * m.charW));
  const h = lines.length * m.lineH;
  return Math.hypot(w / 2, h / 2) + 6;
}

/**
 * One base size for every circle in the picture, big enough for the longest name, so a long name never makes a
 * skill look better evidenced. Only the evidence count adds to it.
 */
export function baseRadius(input: { name: string }[], scale = 1, m: Metrics = COMPACT): number {
  return Math.max(28 * scale, ...input.map((n) => labelFloor(n.name, m)));
}

export function nodeRadius(evidenceCount: number, base: number, scale = 1): number {
  const extra = (Math.min(Math.max(evidenceCount, 1), COUNT_CAP) - 1) / (COUNT_CAP - 1);
  return Math.round(base + 22 * scale * extra);
}/** Pairs of circles closer than the minimum gap. Exported for tests. */
export function overlaps(layout: NetworkLayout): [string, string][] {
  const list = [...layout.nodes.values()];
  const out: [string, string][] = [];
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + GAP / 2) out.push([a.id, b.id]);
    }
  return out;
}

/** Circles cut off by the drawing area. Exported for tests. */
export function outOfBounds(layout: NetworkLayout): string[] {
  return [...layout.nodes.values()].filter((n) => n.x - n.r < 0 || n.x + n.r > layout.width || n.y - n.r < 0 || n.y + n.r > layout.height).map((n) => n.id);
}

function attempt(input: LayoutInput[], edges: LayoutEdge[], width: number, height: number): NetworkLayout {
  const m = metricsFor(width);
  const scale = roomFor(input.length) * m.scale;
  const base = baseRadius(input, scale, m);
  const cx = width / 2, cy = height / 2;
  const order = input.map((n, i) => ({ n, i })).sort((a, b) => b.n.evidenceCount - a.n.evidenceCount || a.i - b.i);
  const nodes: PlacedNode[] = [];
  let ring = 0, placedInRing = 0, ringCapacity = 1, ringRadius = 0;
  for (const { n } of order) {
    if (placedInRing >= ringCapacity) {
      ring++;
      placedInRing = 0;
      ringRadius = ring * 92;
      ringCapacity = Math.max(5, Math.floor((2 * Math.PI * ringRadius) / 100));
    }
    const angle = ring === 0 ? 0 : -Math.PI / 2 + (2 * Math.PI * placedInRing) / ringCapacity + ring * 0.5;
    const s = Math.max(width, height);
    nodes.push({ id: n.id, x: cx + ringRadius * Math.cos(angle) * (width / s), y: cy + ringRadius * Math.sin(angle) * (height / s), r: nodeRadius(n.evidenceCount, base, scale), lines: labelLines(n.name, m.chars) });
    placedInRing++;
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const links = edges.map((e) => [byId.get(e.source), byId.get(e.target)] as const).filter((p): p is readonly [PlacedNode, PlacedNode] => Boolean(p[0] && p[1]));

  for (let iter = 0; iter < 500; iter++) {
    if (iter < 380) {
      for (const n of nodes) {
        n.x += (cx - n.x) * 0.012;
        n.y += (cy - n.y) * 0.012;
      }
      for (const [a, b] of links) {
        const dx = b.x - a.x, dy = b.y - a.y;
        a.x += dx * 0.006; a.y += dy * 0.006; b.x -= dx * 0.006; b.y -= dy * 0.006;
      }
    }
    for (let i = 0; i < nodes.length; i++)
      for (let k = i + 1; k < nodes.length; k++) {
        const a = nodes[i], b = nodes[k];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        const need = a.r + b.r + GAP;
        if (d >= need) continue;
        if (d < 0.01) { dx = Math.cos(i + k); dy = Math.sin(i + k); d = 1; } // coincident: a fixed, not random, direction
        const push = (need - d) / 2 + 0.25;
        a.x -= (dx / d) * push; a.y -= (dy / d) * push;
        b.x += (dx / d) * push; b.y += (dy / d) * push;
      }
    for (const n of nodes) {
      n.x = Math.min(width - n.r - EDGE_MARGIN, Math.max(n.r + EDGE_MARGIN, n.x));
      n.y = Math.min(height - n.r - EDGE_MARGIN, Math.max(n.r + EDGE_MARGIN, n.y));
    }
  }
  return { width, height, nodes: byId, labelPx: m.labelPx };
}

/** Lays the network out at the given pixel width, growing the height until no circles touch or are clipped. */
export function layoutSkillNetwork(input: LayoutInput[], edges: LayoutEdge[], width: number): NetworkLayout {
  const w = Math.max(260, Math.floor(width));
  const m = metricsFor(w);
  const scale = roomFor(input.length) * m.scale;
  const base = baseRadius(input, scale, m);
  const area = input.reduce((s, n) => s + (2 * nodeRadius(n.evidenceCount, base, scale) + GAP) ** 2, 0);
  let height = Math.round(Math.min(1600, Math.max(w < 480 ? 320 : 300, Math.min(w * 0.6, 480), (area * 1.4) / w)));
  let layout = attempt(input, edges, w, height);
  for (let tries = 0; tries < 10 && (overlaps(layout).length || outOfBounds(layout).length); tries++) {
    height = Math.round(height * 1.12);
    layout = attempt(input, edges, w, height);
  }
  return crop(layout);
}

/** Trims empty space above and below the drawing (positions shift; nothing else changes). */
function crop(layout: NetworkLayout, margin = 14): NetworkLayout {
  const list = [...layout.nodes.values()];
  if (!list.length) return layout;
  const top = Math.min(...list.map((n) => n.y - n.r));
  const bottom = Math.max(...list.map((n) => n.y + n.r));
  const height = Math.max(200, Math.ceil(bottom - top + 2 * margin));
  const shift = margin - top + (height - (bottom - top + 2 * margin)) / 2;
  return { width: layout.width, height, nodes: new Map(list.map((n) => [n.id, { ...n, y: n.y + shift }])), labelPx: layout.labelPx };
}
