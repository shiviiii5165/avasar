import Link from "next/link";
import { ArrowRight, BadgeCheck, Compass, FileCheck2, ListChecks, ShieldCheck, Sparkles } from "lucide-react";

import { ClimbScene } from "@/components/brand/climb-scene";
import { Doorway, Leaves, Waves } from "@/components/brand/doorway";
import { BrandSignature } from "@/components/site/site-footer";
import { buttonClass } from "@/components/ui";

const STEPS = [
  { icon: Compass, title: "Find", body: "Look at jobs and internships. All in one place." },
  { icon: ListChecks, title: "Check", body: "We tell you if you can apply, and why it is a good fit for you." },
  { icon: Sparkles, title: "Learn", body: "Missing a skill? We show you what to learn next." },
  { icon: FileCheck2, title: "Apply", body: "Apply with one profile. See what happens next, every time." },
];

const PROMISES = [
  { icon: ShieldCheck, text: "A real person checks every job before you see it. No fake posts." },
  { icon: BadgeCheck, text: "Free for you. Today, tomorrow, always. You never pay to apply." },
  { icon: Sparkles, text: "We always tell you why. No computer says “no” to you on its own." },
];

export default function HomePage() {
  return (
    <>
      <section aria-labelledby="hero-title" className="relative -mt-[72px] overflow-hidden bg-gradient-to-br from-ivory via-peach-soft/60 to-lavender-soft/70 pt-[72px]">
        <Leaves className="absolute -right-6 top-[72px] w-40 sm:w-56 lg:w-72" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 pb-28 pt-10 sm:px-6 sm:pb-36 lg:grid-cols-[1.05fr_1fr] lg:px-8 lg:pb-44 lg:pt-16">
          <div className="relative z-10 max-w-xl">
            <h1 id="hero-title" className="font-serif text-[2.6rem] leading-[1.05] tracking-tight text-navy xs:text-5xl sm:text-6xl lg:text-[4.4rem]">
              Every Dream Deserves a <em className="font-serif italic text-orange">Chance.</em>
            </h1>
            <p className="mt-5 text-lg text-navy-soft sm:text-xl">
              One Place. Equal Opportunity.
              <svg aria-hidden viewBox="0 0 220 14" className="mt-1 block h-3 w-44 text-orange"><path d="M3 10 C 60 2, 140 2, 217 8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/opportunities" className={buttonClass("primary", "lg")}>
                Explore Opportunities <ArrowRight aria-hidden className="size-5" />
              </Link>
              <Link href="/how-it-works" className="text-sm font-semibold text-navy underline-offset-4 hover:underline">How Avsar works</Link>
            </div>
            <BrandSignature className="mt-12" />
          </div>
          <Doorway className="w-full lg:-mr-10" />
        </div>
        <Waves className="absolute inset-x-0 bottom-0 h-28 w-full sm:h-36 lg:h-44" />
      </section>

      <section aria-labelledby="journey-title" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <h2 id="journey-title" className="font-serif text-3xl text-navy sm:text-4xl">Four easy steps to your job</h2>
        <p className="mt-2 max-w-2xl text-muted">No contacts? No problem. Avsar is for students and freshers who are starting out on their own.</p>
        <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-xl border border-line bg-surface p-6 shadow-card">
              <span className="flex size-10 items-center justify-center rounded-full bg-purple-soft text-purple"><s.icon aria-hidden className="size-5" /></span>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-orange-deep">Step {i + 1}</p>
              <h3 className="mt-1 text-lg font-semibold text-navy">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="promise-title" className="bg-ivory-deep/70">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <h2 id="promise-title" className="sr-only">Why you can trust Avsar</h2>
              <figure>
                <blockquote className="font-serif text-3xl leading-snug text-navy sm:text-4xl">
                  &ldquo;You don&apos;t need to know someone to become someone. <em className="italic text-orange">Your hard work is your introduction.</em>&rdquo;
                </blockquote>
                <svg aria-hidden viewBox="0 0 220 14" className="mt-3 block h-3 w-44 text-orange"><path d="M3 10 C 60 2, 140 2, 217 8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
              </figure>
              <ul className="mt-8 space-y-4">
                {PROMISES.map((p) => (
                  <li key={p.text} className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-purple-soft text-purple"><p.icon aria-hidden className="size-5" /></span>
                    <p className="pt-1.5 text-navy-soft">{p.text}</p>
                  </li>
                ))}
              </ul>
            </div>
            <ClimbScene className="mx-auto w-full max-w-md" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 lg:px-8">
        <h2 className="font-serif text-3xl text-navy sm:text-4xl">Your next door is open.</h2>
        <p className="mx-auto mt-2 max-w-xl text-muted">Browse without an account. Sign in with AI Tathastu when you&apos;re ready to save, check your fit and apply.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/opportunities" className={buttonClass("primary", "lg")}>Explore Opportunities</Link>
          <Link href="/sign-in" className={buttonClass("secondary", "lg")}>Sign in</Link>
        </div>
      </section>
    </>
  );
}
