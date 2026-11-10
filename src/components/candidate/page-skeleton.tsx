/**
 * Loading state for candidate sections whose data takes a while (Home, Opportunities, Career insights, Profile;
 * each measured above 300 ms per navigation against a 50 ms round-trip database).
 * Used from those routes' loading.tsx: Next.js then prefetches the route up to this boundary, so a click switches
 * immediately and the page's data streams in behind it. Deliberately NOT used for light sections: once a fallback
 * is shown, React keeps it for at least 300 ms, which would make pages that render faster than that slower.
 * No artificial delay of its own; existing colour tokens only.
 */
export function PageSkeleton() {
  const bar = "rounded-md bg-line motion-safe:animate-pulse";
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading…</span>
      <div aria-hidden className="space-y-3">
        <div className={`${bar} h-9 w-64 max-w-full`} />
        <div className={`${bar} h-4 w-[28rem] max-w-full`} />
      </div>
      <div aria-hidden className="grid grid-cols-[repeat(auto-fill,minmax(min(18rem,100%),1fr))] gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3 rounded-xl border border-line bg-surface p-5 shadow-card">
            <div className={`${bar} h-5 w-24`} />
            <div className={`${bar} h-5 w-3/4`} />
            <div className={`${bar} h-4 w-1/2`} />
            <div className={`${bar} h-4 w-2/3`} />
          </div>
        ))}
      </div>
    </div>
  );
}
