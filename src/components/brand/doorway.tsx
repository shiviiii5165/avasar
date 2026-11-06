/**
 * The Avsar doorway: a real, animated scene (no video, no image). The door leaf swings on its hinge
 * with a CSS 3D transform while warm light behind it brightens and spills across the floor.
 * Decorative only: hidden from assistive technology, pointer-events off so it never blocks clicks.
 * Timing lives in globals.css (door-* keyframes, --door-cycle).
 */
export function Doorway({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none relative select-none ${className}`}>
      {/* Halo of warm light around the frame */}
      <div className="door-halo absolute left-1/2 top-[8%] h-[78%] w-[70%] -translate-x-1/2 rounded-[45%] bg-[radial-gradient(ellipse_at_center,rgba(255,196,110,0.55),rgba(255,214,160,0.18)_45%,transparent_70%)] blur-2xl" />

      {/* Wall and frame */}
      <div className="relative mx-auto aspect-[3/5] w-[62%] max-w-[360px]">
        {/* Frame moulding */}
        <div className="absolute -inset-[5%] rounded-t-[6px] bg-gradient-to-b from-[#f3ece7] to-[#e7ddd8] shadow-[inset_0_0_0_2px_rgba(255,255,255,0.7),0_20px_40px_-20px_rgba(60,40,90,0.35)]" />
        <div className="absolute -inset-[2.5%] rounded-t-[4px] bg-[#efe7e2] shadow-[inset_0_2px_6px_rgba(90,70,110,0.18)]" />

        {/* The opening: light that is revealed as the door swings */}
        <div className="absolute inset-0 overflow-hidden rounded-t-[2px] bg-[#f4dcc0]">
          <div className="door-light absolute inset-0 bg-[radial-gradient(ellipse_at_50%_60%,#fff7e6_0%,#ffd99a_30%,#ffb35c_62%,#f08a3c_100%)]" />
          <div className="door-light absolute inset-x-[30%] inset-y-0 bg-gradient-to-b from-white/80 via-[#fff1d6]/70 to-[#ffd38a]/40 blur-md" />
        </div>

        {/* Door leaf (hinged on the left) */}
        <div className="absolute inset-0 [perspective:2600px]">
          <div className="door-leaf absolute inset-0 rounded-t-[2px] bg-gradient-to-r from-[#f6f1ee] via-[#ece5e1] to-[#e2d9d4] shadow-[inset_-2px_0_0_rgba(255,255,255,0.6),inset_0_0_0_1px_rgba(120,100,130,0.15)] [backface-visibility:hidden] [transform-style:preserve-3d]">
            {/* Panels */}
            <div className="absolute inset-x-[12%] top-[6%] h-[38%] rounded-[2px] shadow-[inset_0_0_0_1px_rgba(120,100,130,0.18),inset_2px_2px_6px_rgba(255,255,255,0.7)]" />
            <div className="absolute inset-x-[12%] bottom-[6%] h-[44%] rounded-[2px] shadow-[inset_0_0_0_1px_rgba(120,100,130,0.18),inset_2px_2px_6px_rgba(255,255,255,0.7)]" />
            {/* Handle */}
            <div className="absolute right-[9%] top-[52%] h-[3%] w-[5%] rounded-full bg-gradient-to-b from-[#d9c9b8] to-[#a8917a] shadow-sm" />
          </div>
        </div>

        {/* Seam of light along the closed edge */}
        <div className="door-seam absolute inset-y-0 right-0 w-[3px] bg-gradient-to-b from-[#fff6dd] via-[#ffc36b] to-[#ff9a3c] shadow-[0_0_18px_6px_rgba(255,179,71,0.65)]" />

        {/* Light spilling onto the floor */}
        <div className="door-spill absolute left-[-30%] right-[-30%] top-full h-[34%] bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,214,140,0.95),rgba(255,180,100,0.45)_35%,transparent_70%)] [clip-path:polygon(28%_0,72%_0,100%_100%,0_100%)] blur-[2px]" />
      </div>
    </div>
  );
}

/** Leaves in the upper right, gently swaying (still under reduced motion). */
export function Leaves({ className = "" }: { className?: string }) {
  const leaf = "M0 0 C 18 -10, 42 -6, 56 10 C 40 18, 16 16, 0 0 Z";
  const leaves = [
    { x: 40, y: 30, r: -20, s: 1.1, c: "#7fb34a" },
    { x: 90, y: 10, r: 15, s: 0.9, c: "#9ccc5a" },
    { x: 130, y: 55, r: 40, s: 1.0, c: "#6aa23c" },
    { x: 70, y: 80, r: -55, s: 0.85, c: "#8fc152" },
    { x: 160, y: 20, r: 70, s: 0.8, c: "#a7d468" },
    { x: 110, y: 100, r: 5, s: 0.95, c: "#76ab44" },
    { x: 180, y: 75, r: 100, s: 0.75, c: "#9ccc5a" },
  ];
  return (
    <svg aria-hidden viewBox="0 0 240 160" className={`leaf-sway pointer-events-none ${className}`}>
      <path d="M240 0 C 200 30, 150 60, 60 70" stroke="#5d7f35" strokeWidth="2" fill="none" opacity="0.7" />
      <path d="M240 20 C 210 60, 170 95, 110 110" stroke="#5d7f35" strokeWidth="1.6" fill="none" opacity="0.6" />
      {leaves.map((l, i) => (
        <path key={i} d={leaf} fill={l.c} opacity="0.92" transform={`translate(${l.x} ${l.y}) rotate(${l.r}) scale(${l.s})`} />
      ))}
    </svg>
  );
}

/** Flowing peach, lavender and blue waves along the bottom of the hero. */
export function Waves({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 1440 320" preserveAspectRatio="none" className={`pointer-events-none ${className}`}>
      <defs>
        <linearGradient id="w1" x1="0" x2="1">
          <stop offset="0%" stopColor="#f7d9c4" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ece8fa" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="w2" x1="0" x2="1">
          <stop offset="0%" stopColor="#d9d3f2" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#cfe0f3" stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id="w3" x1="0" x2="1">
          <stop offset="0%" stopColor="#fbe9dc" />
          <stop offset="60%" stopColor="#e9e2f8" />
          <stop offset="100%" stopColor="#dce8f6" />
        </linearGradient>
      </defs>
      <path d="M0 170 C 240 110, 480 230, 760 180 C 1040 130, 1240 200, 1440 150 L1440 320 L0 320 Z" fill="url(#w1)" />
      <path d="M0 220 C 300 170, 560 280, 860 230 C 1120 190, 1300 250, 1440 220 L1440 320 L0 320 Z" fill="url(#w2)" />
      <path d="M0 270 C 320 240, 640 310, 980 275 C 1200 255, 1340 285, 1440 270 L1440 320 L0 320 Z" fill="url(#w3)" />
    </svg>
  );
}
