"use client";

import { useEffect, useState } from "react";

/**
 * "Your next chapter": a professional walks down the street, takes an office bag from a bench and walks into a glass office
 * tower whose doors slide open. Side-view illustration with jointed limbs (hip/knee, shoulder/elbow) so the walk
 * reads as real. Pure SVG + CSS on one 11 s timeline (keyframes generated below; static parts in globals.css .cw-*).
 * Decorative: hidden from screen readers. Reduced motion shows one still frame: standing with the bag at the door.
 */

/** Walking phases on the shared timeline (percent): in from the left, then from the bag to the door. */
const WALKING: [number, number][] = [[2, 28], [44, 80]];
const STEP = 5.4; // one full stride ≈ 0.6 s

/** 0 → 1 → 0 over the pick-up: reaching for the bag on the bench (29–33 %), taking it (33–38 %), back (38–43 %). */
function reach(t: number): number {
  if (t <= 29 || t >= 43) return 0;
  if (t < 33) return (t - 29) / 4;
  if (t <= 38) return 1;
  return (43 - t) / 5;
}
const isWalking = (t: number) => WALKING.some(([a, b]) => t >= a && t <= b);
const REACH = 55; // front shoulder angle (deg) reaching forward to the bench

/** One keyframes rule from a function of time (deg rotation or px translate). */
function frames(name: string, f: (t: number) => number, kind: "rotate" | "translateY" = "rotate"): string {
  const out: string[] = [];
  for (let t = 0; t <= 100; t += 0.5) out.push(`${t}%{transform:${kind}(${f(t).toFixed(2)}${kind === "rotate" ? "deg" : "px"})}`);
  return `@keyframes ${name}{${out.join("")}}`;
}

function gait(): string {
  const phase = (t: number, off: number) => ((t / STEP) * 2 + off) * Math.PI;
  const w = (t: number) => (isWalking(t) ? 1 : 0);
  // Thigh swings ±26°, knee flexes only behind (0..42°), shoulder swings opposite the leg, elbow stays a little bent.
  const thigh = (off: number) => (t: number) => w(t) * 26 * Math.sin(phase(t, off));
  const shin = (off: number) => (t: number) => w(t) * 42 * Math.max(0, Math.sin(phase(t, off + 0.55)));
  const shoulder = (off: number, reaches: boolean) => (t: number) => w(t) * 20 * Math.sin(phase(t, off)) - (reaches ? REACH * reach(t) : 0);
  const elbow = (t: number) => -14 - 8 * w(t) * Math.max(0, Math.sin(phase(t, 0.3))) + 10 * reach(t);
  return [
    frames("cw-thigh-f", thigh(0)), frames("cw-thigh-b", thigh(1)),
    frames("cw-shin-f", shin(0)), frames("cw-shin-b", shin(1)),
    frames("cw-arm-f", shoulder(1, true)), frames("cw-arm-b", shoulder(0, false)),
    frames("cw-elbow", elbow),
    frames("cw-bend", (t) => 6 * reach(t)), // a slight lean towards the bench
    frames("cw-bob", (t) => (isWalking(t) ? -1.8 * Math.abs(Math.sin(phase(t, 0))) : 0), "translateY"),
  ].join("");
}
const GAIT_CSS = `@media (prefers-reduced-motion: no-preference){${gait()}}`;

/** Well-known quotes with well-established sources, one per loop of the walk. */
const QUOTES = [
  { text: "Dream, dream, dream. Dreams transform into thoughts, and thoughts result in action.", by: "A. P. J. Abdul Kalam" },
  { text: "Arise, awake, and stop not till the goal is reached.", by: "Swami Vivekananda" },
  { text: "The only way to do great work is to love what you do.", by: "Steve Jobs" },
  { text: "You have to dream before your dreams can come true.", by: "A. P. J. Abdul Kalam" },
  { text: "Stay hungry. Stay foolish.", by: "Steve Jobs" },
] as const;
const LOOP_MS = 11_000;

/**
 * The speech bubble above the walker: a new quote each loop, shown while walking towards the bench and on towards the
 * office (CSS .cw-say timing). It moves with the walker, so it sits in the walker group, outside the body's scale.
 */
function QuoteBubble() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((n) => (n + 1) % QUOTES.length), LOOP_MS);
    return () => clearInterval(id);
  }, []);
  const q = QUOTES[i];
  return (
    <foreignObject key={i} className="cw-say" x="-24" y="-214" width="196" height="104">
      <div className="flex h-full flex-col justify-end">
        <div className="relative rounded-2xl rounded-bl-sm bg-white px-3 py-2 shadow-[0_8px_20px_-8px_rgba(22,24,58,0.35)] ring-1 ring-[#e6defe]">
          <p className="text-[11px] font-semibold leading-snug text-[#16183a]">“{q.text}”</p>
          <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-[#6d28d9]">— {q.by}</p>
          <span aria-hidden className="absolute -bottom-1.5 left-3 size-3 rotate-45 bg-white ring-0" />
        </div>
      </div>
    </foreignObject>
  );
}

/** One leg: thigh from the hip (0,0), shin from the knee, shoe pointing forward (right). */
function Leg({ cls, trouser, shoe }: { cls: "f" | "b"; trouser: string; shoe: string }) {
  return (
    <g className={`cw-thigh cw-thigh-${cls}`}>
      <path d="M-6 0 L6 0 L5.2 28 L-5.2 28 Z" fill={trouser} />
      <g transform="translate(0 27)"><g className={`cw-shin cw-shin-${cls}`}>
        <path d="M-5.2 0 L5.2 0 L4.4 27 L-4.4 27 Z" fill={trouser} />
        <path d="M-5 25 L6 25 Q14 26 15 31 L15 32 L-5.5 32 Z" fill={shoe} />
        <rect x="-5.5" y="31" width="21" height="1.6" rx="0.8" fill="#000" opacity="0.35" />
      </g></g>
    </g>
  );
}

/** One arm: upper arm from the shoulder (0,0), forearm from the elbow, hand; the front arm can carry the bag. */
function Arm({ cls, sleeve, cuff, bag = false }: { cls: "f" | "b"; sleeve: string; cuff: string; bag?: boolean }) {
  return (
    <g className={`cw-arm cw-arm-${cls}`}>
      <path d="M-5 -1 Q0 -4 5 -1 L4.4 23 L-4.4 23 Z" fill={sleeve} />
      <g transform="translate(0 22)"><g className="cw-forearm">
        <path d="M-4.2 0 L4.2 0 L3.6 21 L-3.6 21 Z" fill={sleeve} />
        <rect x="-3.6" y="19" width="7.2" height="2.6" fill={cuff} />
        <ellipse cx="0.4" cy="25" rx="3.6" ry="4.2" fill="#d79a72" />
        {bag && (
          <g className="cw-bag-hand">
            <path d="M-5 27 q5.5 -8 11 0" fill="none" stroke="#3a2414" strokeWidth="2" />
            <rect x="-11" y="27" width="23" height="15" rx="3" fill="#7a4a24" />
            <rect x="-11" y="27" width="23" height="5" rx="2.5" fill="#94592c" />
            <rect x="-1.5" y="31" width="4" height="3" rx="0.8" fill="#e2b86b" />
          </g>
        )}
      </g></g>
    </g>
  );
}

export function CareerWalk() {
  return (
    <svg viewBox="0 0 480 300" className="cw h-full w-full" aria-hidden focusable="false">
      <style>{GAIT_CSS}</style>
      <defs>
        <linearGradient id="cw-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9fd3ff" />
          <stop offset="0.55" stopColor="#d9ecff" />
          <stop offset="1" stopColor="#ffe6d2" />
        </linearGradient>
        <radialGradient id="cw-sunglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff6d8" />
          <stop offset="0.35" stopColor="#ffe08a" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ffd27a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="cw-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c9e4ff" />
          <stop offset="0.5" stopColor="#7fb0ea" />
          <stop offset="1" stopColor="#4f7fc9" />
        </linearGradient>
        <linearGradient id="cw-glass-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5d86c8" />
          <stop offset="1" stopColor="#3c5f9e" />
        </linearGradient>
        <linearGradient id="cw-shine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="cw-lobby" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe9b0" />
          <stop offset="1" stopColor="#ffc56b" />
        </linearGradient>
        <linearGradient id="cw-suit" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1d2b5c" />
          <stop offset="1" stopColor="#2e4384" />
        </linearGradient>
        <linearGradient id="cw-walk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eceff5" />
          <stop offset="1" stopColor="#d6dbe6" />
        </linearGradient>
        <clipPath id="cw-tower"><rect x="318" y="58" width="132" height="200" rx="4" /></clipPath>
        <clipPath id="cw-doorway"><rect x="364" y="150" width="48" height="108" /></clipPath>
      </defs>

      {/* Sky, sun, clouds */}
      <rect width="480" height="300" fill="url(#cw-sky)" />
      <circle className="cw-sun" cx="92" cy="70" r="46" fill="url(#cw-sunglow)" />
      <circle className="cw-sun" cx="92" cy="70" r="15" fill="#fff3c4" />
      <g className="cw-cloud" fill="#ffffff">
        <ellipse cx="200" cy="52" rx="30" ry="9" opacity="0.9" />
        <ellipse cx="220" cy="46" rx="18" ry="10" opacity="0.9" />
        <ellipse cx="184" cy="49" rx="12" ry="7" opacity="0.9" />
      </g>
      <g className="cw-cloud cw-cloud-2" fill="#ffffff" opacity="0.75">
        <ellipse cx="282" cy="86" rx="22" ry="6.5" />
        <ellipse cx="295" cy="81" rx="13" ry="7" />
      </g>

      {/* Birds crossing the sky */}
      {[[0, 0, "0s"], [16, 8, "0.35s"], [30, -4, "0.7s"]].map(([dx, dy, d]) => (
        <g key={String(dx)} className="cw-bird-path" style={{ animationDelay: d as string }}>
          <g transform={`translate(${-30 + (dx as number)} ${96 + (dy as number)})`}>
            <path className="cw-wing" d="M0 0 q4 -5 8 0 q4 -5 8 0" fill="none" stroke="#33415f" strokeWidth="1.6" strokeLinecap="round" />
          </g>
        </g>
      ))}

      {/* Distant skyline in haze */}
      <g fill="#a9c3e6" opacity="0.55">
        <rect x="12" y="150" width="30" height="108" />
        <rect x="46" y="124" width="22" height="134" />
        <rect x="72" y="166" width="38" height="92" />
        <rect x="186" y="140" width="26" height="118" />
        <rect x="216" y="160" width="40" height="98" />
        <rect x="260" y="132" width="24" height="126" />
      </g>
      <g fill="#ffffff" opacity="0.35">
        {[0, 1, 2, 3, 4, 5].map((r) => <rect key={r} x="50" y={132 + r * 18} width="14" height="3" />)}
        {[0, 1, 2, 3, 4, 5].map((r) => <rect key={r} x="264" y={140 + r * 18} width="16" height="3" />)}
      </g>

      {/* Office tower: glass curtain wall with mullions, reflections and a lit lobby */}
      <g>
        <rect x="312" y="52" width="144" height="8" rx="2" fill="#2f4a80" />
        <rect x="318" y="58" width="132" height="200" rx="4" fill="url(#cw-glass)" />
        <rect x="430" y="58" width="20" height="200" fill="url(#cw-glass-side)" opacity="0.75" />
        <g clipPath="url(#cw-tower)">
          {Array.from({ length: 9 }, (_, i) => <rect key={`h${i}`} x="318" y={78 + i * 16} width="132" height="1.6" fill="#ffffff" opacity="0.55" />)}
          {Array.from({ length: 6 }, (_, i) => <rect key={`v${i}`} x={340 + i * 22} y="58" width="1.4" height="160" fill="#ffffff" opacity="0.45" />)}
          <polygon className="cw-reflect" points="300,58 330,58 270,258 240,258" fill="url(#cw-shine)" />
          <polygon className="cw-reflect cw-reflect-2" points="350,58 362,58 302,258 290,258" fill="url(#cw-shine)" opacity="0.7" />
          {[[2, 1], [4, 3], [5, 1], [3, 4], [6, 2], [1, 5]].map(([r, c]) => (
            <rect key={`${r}${c}`} className="cw-win" x={319 + c * 22} y={79 + r * 16} width="20.5" height="14.4" fill="#fff2c2" opacity="0.55" />
          ))}
        </g>
        <text x="384" y="74" textAnchor="middle" fontSize="9" fontWeight="800" letterSpacing="3" fill="#ffffff" fontFamily="Inter, system-ui, sans-serif">CAREERS</text>
        {/* lobby + canopy */}
        <rect x="318" y="146" width="132" height="112" fill="#2b4170" />
        <rect x="364" y="150" width="48" height="108" fill="url(#cw-lobby)" />
        <ellipse className="cw-glow" cx="388" cy="240" rx="52" ry="30" fill="#ffd27a" opacity="0" />
        <g clipPath="url(#cw-doorway)">
          <g className="cw-door-l">
            <rect x="364" y="150" width="24" height="108" fill="#bcd7f5" opacity="0.8" />
            <rect x="384" y="200" width="1.6" height="14" rx="0.8" fill="#425a85" />
          </g>
          <g className="cw-door-r">
            <rect x="388" y="150" width="24" height="108" fill="#a9c9ef" opacity="0.8" />
            <rect x="390.4" y="200" width="1.6" height="14" rx="0.8" fill="#425a85" />
          </g>
        </g>
        <rect x="354" y="140" width="68" height="6" rx="2" fill="#1d2f57" />
        <rect x="354" y="145" width="68" height="1.5" fill="#ffe7a8" opacity="0.8" />
        {[322, 340, 422, 438].map((x) => <rect key={x} x={x} y="154" width="12" height="96" fill="#ffd98a" opacity="0.5" />)}
      </g>

      {/* Street lamp and trees */}
      <g>
        <rect x="292" y="176" width="3" height="82" fill="#3b4a66" />
        <path d="M293.5 176 q0 -8 10 -8 h4" fill="none" stroke="#3b4a66" strokeWidth="3" />
        <rect x="304" y="166" width="10" height="5" rx="2" fill="#3b4a66" />
        <ellipse className="cw-lamp" cx="309" cy="174" rx="8" ry="4" fill="#ffe7a8" opacity="0.7" />
      </g>
      {[[150, 1], [270, 0.85]].map(([x, s]) => (
        <g key={x} transform={`translate(${x} 258) scale(${s})`}>
          <rect x="-2.5" y="-34" width="5" height="34" rx="2" fill="#7a5638" />
          <circle cx="0" cy="-48" r="18" fill="#58b368" />
          <circle cx="-11" cy="-40" r="12" fill="#4aa45c" />
          <circle cx="11" cy="-41" r="13" fill="#66c177" />
          <circle cx="4" cy="-56" r="9" fill="#7dd08b" opacity="0.8" />
        </g>
      ))}

      {/* Pavement */}
      <rect x="0" y="258" width="480" height="42" fill="url(#cw-walk)" />
      <rect x="0" y="258" width="480" height="2.5" fill="#b9c1d1" />
      {Array.from({ length: 13 }, (_, i) => <rect key={i} x={i * 40 - 6} y="260" width="1.4" height="40" fill="#c3cad8" />)}
      <rect x="0" y="282" width="480" height="1.2" fill="#c3cad8" />

      {/* Park bench; the bag waits on its seat at hand height, where the reaching hand meets it. */}
      <g>
        <rect x="182" y="182" width="60" height="6" rx="2" fill="#a0673a" />
        <rect x="182" y="191" width="60" height="6" rx="2" fill="#8a5630" />
        <rect x="178" y="213" width="68" height="6" rx="2" fill="#b4743f" />
        <rect x="178" y="218" width="68" height="2" fill="#7a4a24" opacity="0.6" />
        {[184, 237].map((x) => <rect key={x} x={x} y="182" width="4" height="76" rx="1" fill="#3b4a66" />)}
        <ellipse cx="212" cy="258.5" rx="38" ry="2.6" fill="#000" opacity="0.1" />
      </g>
      <g className="cw-bag-ground" transform="translate(200 201.5) scale(0.75)">
        <path d="M-5 0 q5.5 -8 11 0" fill="none" stroke="#3a2414" strokeWidth="2" />
        <rect x="-11" y="0" width="23" height="15" rx="3" fill="#7a4a24" />
        <rect x="-11" y="0" width="23" height="5" rx="2.5" fill="#94592c" />
        <rect x="-1.5" y="4" width="4" height="3" rx="0.8" fill="#e2b86b" />
      </g>

      {/* The professional, side view facing right. Origin = feet on the pavement. */}
      <g transform="translate(0 258)">
        <g className="cw-walker"><QuoteBubble /><g transform="scale(0.75)">
          <ellipse cx="2" cy="0.5" rx="16" ry="2.4" fill="#000" opacity="0.14" />
          <g className="cw-bob">
            <g transform="translate(0 -58)">
              <Leg cls="b" trouser="#1a254d" shoe="#141414" />
            </g>
            <g className="cw-torso">
              <g transform="translate(-1 -102)">
                <Arm cls="b" sleeve="#16214a" cuff="#e9eef7" />
              </g>
            </g>
            <g transform="translate(0 -58)">
              <Leg cls="f" trouser="#24336a" shoe="#1c1c1c" />
            </g>
            <g className="cw-torso">
              {/* jacket */}
              <path d="M-10 -58 L-11 -95 Q-9 -106 0 -107 Q9 -106 11 -96 L12 -70 Q13 -60 10 -56 L-10 -56 Z" fill="url(#cw-suit)" />
              <path d="M2 -105 L9 -97 L4 -74 Z" fill="#f4f6fb" />
              <path d="M5.5 -99 L8 -96 L6 -78 L4 -76 Z" fill="#e2445f" />
              <path d="M0 -106 L7 -95 L3 -88 Z" fill="#17234f" />
              <rect x="-10" y="-62" width="22" height="2.2" fill="#121b3f" opacity="0.6" />
              <rect x="4" y="-88" width="5" height="1.6" rx="0.8" fill="#f4f6fb" opacity="0.9" />
              {/* neck + head (profile), at adult proportions (head ≈ 1/7.5 of height) */}
              <g transform="translate(2 -108) scale(0.84) translate(-2 108)">
              <rect x="-2" y="-112" width="7" height="8" rx="2" fill="#c98a63" />
              <path d="M-9 -122 Q-10 -136 1 -138 Q13 -138 13 -126 L14.5 -121 Q15 -119 13 -118.5 L13 -115 Q12 -111 6 -111 L-1 -111 Q-8 -112 -9 -122 Z" fill="#dfa47c" />
              <path d="M13.6 -121.5 L17 -119 L13.4 -117.6 Z" fill="#d39570" />
              <ellipse cx="-2" cy="-122" rx="2.6" ry="3.4" fill="#c98a63" />
              <path d="M-10.5 -123 Q-12 -140 2 -141 Q15 -141 15 -130 Q11 -133 7 -131 Q3 -134 -1 -131 Q-4 -128 -6 -124 Q-8 -120 -10.5 -123 Z" fill="#2a1a12" />
              <path d="M8.5 -124.5 h3" stroke="#2a1a12" strokeWidth="1.2" strokeLinecap="round" />
              <circle cx="10.2" cy="-121.6" r="1.25" fill="#1b1b1b" />
              <path d="M9.6 -114.4 q1.8 0.5 3.6 0" fill="none" stroke="#9a5440" strokeWidth="1" strokeLinecap="round" />
              <path d="M-4 -139 Q4 -142 11 -137" fill="none" stroke="#4a3426" strokeWidth="1.3" strokeLinecap="round" opacity="0.7" />
              <path d="M12.6 -113 Q11 -110.6 7 -110.6" fill="none" stroke="#c98a63" strokeWidth="1" opacity="0.8" />
              </g>
              {/* front arm (carries the bag after the pick-up) */}
              <g transform="translate(1 -102)">
                <Arm cls="f" sleeve="#2a3d7a" cuff="#f4f6fb" bag />
              </g>
            </g>
          </g>
        </g></g>
      </g>

      {/* Arrival */}
      <g className="cw-confetti">
        {[["#ff7eb6", -30, -40], ["#ffb347", 26, -46], ["#4fd1c5", -12, -58], ["#8b7bff", 34, -24], ["#ff9f5a", -38, -16], ["#5b8cff", 10, -64], ["#a3e635", -22, -30]].map(([c, x, y], i) => (
          <rect key={i} className="cw-bit" x="388" y="180" width="5" height="5" rx="1" fill={c as string} style={{ ["--x" as string]: `${x}px`, ["--y" as string]: `${y}px` }} />
        ))}
      </g>
      <g className="cw-badge">
        <rect x="334" y="22" width="104" height="26" rx="13" fill="#ffffff" />
        <rect x="334" y="22" width="104" height="26" rx="13" fill="none" stroke="#e6defe" />
        <text x="386" y="39" textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#3a1f9a" fontFamily="Inter, system-ui, sans-serif">Day one ✨</text>
      </g>
    </svg>
  );
}
