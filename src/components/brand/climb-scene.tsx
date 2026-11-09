/**
 * "Step by step to the job": a small person hops up four steps (Find, Check, Learn, Apply)
 * and reaches a glowing briefcase, then a "You got the job!" badge pops up. Pure SVG + CSS
 * (climb-* keyframes in globals.css); decorative, so hidden from assistive technology.
 * Colours come only from the brand tokens.
 */
const STEPS = ["Find", "Check", "Learn", "Apply"];

export function ClimbScene({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 400 320" className={`pointer-events-none select-none ${className}`}>
      {/* Soft backdrop */}
      <circle cx="210" cy="170" r="140" className="fill-peach-soft" />
      <circle cx="300" cy="100" r="70" className="fill-lavender-soft" opacity="0.9" />

      {/* Steps */}
      {STEPS.map((label, i) => {
        const x = 40 + i * 70;
        const top = 250 - i * 40;
        return (
          <g key={label}>
            <rect x={x} y={top} width="70" height={300 - top} rx="8" className="fill-surface" stroke="var(--color-lavender)" strokeWidth="1.5" />
            <rect x={x} y={top} width="70" height="8" rx="4" className={`climb-lit climb-lit-${i} fill-orange`} />
            <text x={x + 35} y={top + 30} textAnchor="middle" className="fill-navy-soft text-[12px] font-semibold">{label}</text>
          </g>
        );
      })}

      {/* Top platform with the briefcase */}
      <rect x="320" y="110" width="60" height="190" rx="8" className="fill-surface" stroke="var(--color-lavender)" strokeWidth="1.5" />
      <g transform="translate(350 110)">
        <circle cy="-22" r="30" className="climb-glow fill-peach" />
        <g className="climb-case">
          <rect x="-9" y="-38" width="18" height="10" rx="4" fill="none" stroke="var(--color-purple-deep)" strokeWidth="3" />
          <rect x="-20" y="-30" width="40" height="28" rx="6" className="fill-purple" />
          <rect x="-20" y="-20" width="40" height="3" className="fill-purple-deep" />
          <rect x="-4" y="-22" width="8" height="7" rx="2" className="fill-orange" />
        </g>
        {/* Sparkles */}
        <path className="climb-spark climb-spark-a fill-orange" d="M-34 -52 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" />
        <path className="climb-spark climb-spark-b fill-purple" d="M30 -62 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" />
        <path className="climb-spark climb-spark-c fill-orange" d="M36 -20 l2 4 4 2 -4 2 -2 4 -2 -4 -4 -2 4 -2z" />
      </g>

      {/* Badge */}
      <g className="climb-badge" style={{ transformOrigin: "300px 40px" }}>
        <rect x="222" y="22" width="156" height="36" rx="18" className="fill-success-soft" stroke="var(--color-success)" strokeWidth="1.5" />
        <circle cx="244" cy="40" r="9" className="fill-success" />
        <path d="M239.5 40.5 l3 3 6-6.5" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <text x="262" y="45" className="fill-success text-[14px] font-bold">You got the job!</text>
      </g>

      {/* The climber (feet at the group origin) */}
      <g className="climb-person">
        <ellipse cy="2" rx="12" ry="3" className="fill-navy" opacity="0.12" />
        <rect x="-9" y="-28" width="18" height="28" rx="8" className="fill-purple" />
        <circle cy="-38" r="10" className="fill-navy" />
        <path d="M-9 -20 l-8 -10" stroke="var(--color-purple)" strokeWidth="5" strokeLinecap="round" className="climb-arm" />
        <path d="M9 -20 l8 -10" stroke="var(--color-purple)" strokeWidth="5" strokeLinecap="round" className="climb-arm" />
      </g>
    </svg>
  );
}
