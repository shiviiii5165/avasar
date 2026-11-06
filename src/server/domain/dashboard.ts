/** Pure dashboard helpers (time is a parameter so they're deterministic and testable). */
export function upcomingDeadlines<T extends { id: string; deadline: Date | null }>(saved: T[], applied: Set<string>, now: Date, windowDays = 14, limit = 4): T[] {
  const t = now.getTime();
  return saved
    .filter((o) => o.deadline && o.deadline.getTime() > t && o.deadline.getTime() - t < windowDays * 86_400_000 && !applied.has(o.id))
    .sort((a, b) => a.deadline!.getTime() - b.deadline!.getTime())
    .slice(0, limit);
}
