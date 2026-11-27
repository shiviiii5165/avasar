"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type ReactNode, type TouchEvent } from "react";

export interface StorySlide { id: string; label: string; content: ReactNode }

/**
 * The listing as a story: segment bars on top, one slide at a time on the company's colour. Move with the arrows,
 * the segment labels, the keyboard (←/→) or a swipe. Nothing advances on its own, so every slide can be read at
 * any pace; all slides stay in the page (inactive ones are hidden) so the content is searchable and printable.
 */
export function OpportunityStory({ slides, tile, deep }: { slides: StorySlide[]; tile: string; deep: string }) {
  const [i, setI] = useState(0);
  const touchX = useRef<number | null>(null);
  const go = (n: number) => setI(Math.max(0, Math.min(slides.length - 1, n)));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
  };
  const onTouchEnd = (e: TouchEvent) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1));
    touchX.current = null;
  };

  return (
    <section
      aria-roledescription="story"
      aria-label="Listing details"
      tabIndex={0}
      onKeyDown={onKey}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={onTouchEnd}
      className="relative overflow-clip rounded-[1.5rem] p-4 focus-visible:outline-2 focus-visible:outline-purple sm:p-6"
      style={{ backgroundColor: tile }}
    >
      <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full opacity-50 blur-3xl" style={{ backgroundColor: deep }} />
      <span aria-hidden className="pointer-events-none absolute -bottom-20 -left-10 size-48 rounded-full opacity-40 blur-3xl" style={{ backgroundColor: deep }} />

      {/* Segment bars, each also a button with its label. */}
      <div className="relative flex gap-1.5" role="tablist" aria-label="Story pages">
        {slides.map((s, n) => (
          <button key={s.id} type="button" role="tab" aria-selected={n === i} aria-controls={`story-${s.id}`} onClick={() => go(n)} className="group/seg min-w-0 flex-1 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-purple">
            <span className="block h-1 overflow-hidden rounded-full bg-white/60">
              {n <= i && <span key={n === i ? `on-${i}` : "done"} className={`block h-full rounded-full bg-[#16183a] ${n === i ? "story-fill" : ""}`} />}
            </span>
            <span className={`mt-2 hidden truncate text-[13px] font-semibold sm:block ${n === i ? "text-[#16183a]" : "text-[#16183a]/55 group-hover/seg:text-[#16183a]"}`}>{s.label}</span>
          </button>
        ))}
      </div>

      <div className="relative mt-4 h-[26rem] overflow-x-hidden overflow-y-auto overscroll-contain rounded-2xl bg-white/90 p-5 shadow-sm backdrop-blur-sm [scrollbar-width:thin] sm:h-[28rem] sm:p-7">
        {slides.map((s, n) => (
          <div key={s.id} id={`story-${s.id}`} role="tabpanel" aria-label={`${s.label} (${n + 1} of ${slides.length})`} hidden={n !== i} className={n === i ? "story-in" : undefined}>
            {s.content}
          </div>
        ))}
      </div>

      <div className="relative mt-4 flex items-center justify-between gap-3">
        <button type="button" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous page" className="grid size-11 place-items-center rounded-full bg-white/85 text-navy shadow-sm transition hover:bg-white disabled:opacity-40">
          <ChevronLeft aria-hidden className="size-5" />
        </button>
        <p className="text-sm font-semibold text-[#16183a]" aria-live="polite">{slides[i].label} · {i + 1} of {slides.length}</p>
        <button type="button" onClick={() => go(i + 1)} disabled={i === slides.length - 1} aria-label="Next page" className="grid size-11 place-items-center rounded-full bg-[#16183a] text-white shadow-sm transition hover:bg-purple disabled:opacity-40">
          <ChevronRight aria-hidden className="size-5" />
        </button>
      </div>
    </section>
  );
}
