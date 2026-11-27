"use client";

import Link from "next/link";
import { ArrowDown, Compass, Sparkles, Target } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { CareerWalk } from "./career-walk";

/**
 * Home's welcome: a bright sunrise stage (sky → lilac → pink → apricot) with drifting colour light, a time-of-day greeting, a live line cycling
 * through the student's real numbers, counting stats, and the career-walk scene. Every number comes from their data;
 * motion is decoration only and stops for people who prefer reduced motion.
 */
export interface HomeHeroProps {
  firstName: string;
  fits: number;
  fresh: number;
  inProgress: number;
  deadlines: number;
  goal: string | null;
  goalInferred: boolean;
}

const noSubscribe = () => () => {};
function localGreeting() {
  const h = new Date().getHours();
  return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const REDUCED = "(prefers-reduced-motion: reduce)";
function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(REDUCED);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

function CountUp({ to, reduced }: { to: number; reduced: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 1200);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, reduced]);
  return <>{reduced ? to : n}</>;
}

export function HomeHero({ firstName, fits, fresh, inProgress, deadlines, goal, goalInferred }: HomeHeroProps) {
  const reduced = useReducedMotion();
  // The viewer's local time, read on the client only (the server says "Hello", so hydration never mismatches).
  const greeting = useSyncExternalStore(noSubscribe, localGreeting, () => "Hello");

  const lines = [
    fits > 0 ? `${fits} ${fits === 1 ? "opening fits" : "openings fit"} you right now` : "We're matching new openings to you",
    fresh > 0 ? `${fresh} new ${fresh === 1 ? "listing" : "listings"} posted this week` : null,
    goal ? `Aiming for ${goal}` : "Set a career goal to sharpen your matches",
    deadlines > 0 ? `${deadlines} saved ${deadlines === 1 ? "deadline" : "deadlines"} coming up` : null,
  ].filter((l): l is string => Boolean(l));
  const [line, setLine] = useState(0);
  useEffect(() => {
    if (reduced || lines.length < 2) return;
    const id = setInterval(() => setLine((i) => (i + 1) % lines.length), 3200);
    return () => clearInterval(id);
  }, [reduced, lines.length]);

  const stats = [
    { label: "Openings for you", value: fits, tone: "from-[#6d28d9] to-[#db2777]" },
    { label: "New this week", value: fresh, tone: "from-[#047857] to-[#0891b2]" },
    { label: "Applications active", value: inProgress, tone: "from-[#c2410c] to-[#e11d48]" },
  ];

  return (
    <section aria-labelledby="hero-title" className="hero relative isolate overflow-hidden rounded-[2rem] bg-[linear-gradient(120deg,#dbeafe_0%,#ede9fe_35%,#fce7f3_68%,#ffedd5_100%)] px-6 py-8 text-[#16183a] shadow-[0_30px_80px_-40px_rgba(124,92,255,0.55)] ring-1 ring-white sm:px-10 sm:py-10">
      {/* Aurora light + star grid: decoration only. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <span className="aurora aurora-1" />
        <span className="aurora aurora-2" />
        <span className="aurora aurora-3" />
        <span className="aurora aurora-4" />
        <span className="absolute inset-0 bg-[radial-gradient(rgba(22,24,58,0.10)_1px,transparent_1px)] [background-size:26px_26px] [mask-image:radial-gradient(ellipse_at_30%_40%,black_20%,transparent_70%)]" />
        <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
      </div>

      <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.1fr]">
        <div className="tile-in">
          <p className="inline-flex items-center gap-2 rounded-full border border-white bg-white/80 px-3.5 py-1.5 text-sm font-semibold text-[#3a1f9a] shadow-sm backdrop-blur">
            <span className="relative flex size-2"><span className="live-ping absolute inline-flex size-full rounded-full bg-[#10b981]" /><span className="relative inline-flex size-2 rounded-full bg-[#10b981]" /></span>
            Your AI career companion · live
          </p>

          <h1 id="hero-title" className="mt-4 font-serif text-[clamp(2.25rem,4.6vw,3.5rem)] leading-[1.08] tracking-tight">
            {greeting},<br />
            <span className="hero-name">{firstName}</span>
            <Sparkles aria-hidden className="twinkle ml-2 inline size-7 text-[#f59e0b] sm:size-9" />
          </h1>

          <div className="mt-4 h-8 overflow-hidden text-lg font-medium text-[#2b2f5c] sm:text-xl" aria-hidden>
            <p key={line} className="hero-line flex items-center gap-2">
              <span className="size-1.5 shrink-0 rounded-full bg-gradient-to-r from-[#7c3aed] to-[#db2777]" />
              {lines[line]}
            </p>
          </div>
          <p className="sr-only">{lines.join(". ")}.</p>

          <dl className="mt-6 grid max-w-xl grid-cols-3 gap-3">
            {stats.map((s, i) => (
              <div key={s.label} className="tile-in rounded-2xl border border-white bg-white/75 p-3 shadow-[0_8px_24px_-14px_rgba(22,24,58,0.35)] backdrop-blur-md transition-transform hover:-translate-y-0.5 sm:p-4" style={{ animationDelay: `${150 + i * 90}ms` }}>
                <dd className={`bg-gradient-to-r bg-clip-text text-3xl font-extrabold tabular-nums text-transparent sm:text-4xl ${s.tone}`}><CountUp to={s.value} reduced={reduced} /></dd>
                <dt className="mt-1 text-[13px] font-semibold text-[#3b3f6b] sm:text-sm">{s.label}</dt>
              </div>
            ))}
          </dl>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a href="#recs-title" className="cta-glow inline-flex min-h-11 items-center gap-2 rounded-full bg-[#16183a] px-6 text-[15px] font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5">
              See your matches <ArrowDown aria-hidden className="size-4" />
            </a>
            <Link href="/app/discover" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white bg-white/80 px-6 text-[15px] font-semibold text-[#16183a] shadow-sm backdrop-blur transition-colors hover:bg-white">
              <Compass aria-hidden className="size-4" /> Explore all
            </Link>
            <Link href={goal ? "/app/profile#goal" : "/app/profile#preferences"} className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-[#5b21b6] underline-offset-4 hover:underline">
              <Target aria-hidden className="size-4" />
              {goal ? `${goalInferred ? "Suggested goal" : "Goal"}: ${goal}` : "Set your career goal"}
            </Link>
          </div>
        </div>

        <div className="relative mx-auto aspect-[480/300] w-full max-w-[42rem] overflow-hidden rounded-[1.75rem] border-4 border-white bg-white shadow-[0_24px_60px_-28px_rgba(22,24,58,0.45)]">
          <CareerWalk />
        </div>
      </div>
    </section>
  );
}
