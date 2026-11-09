import Link from "next/link";

import { CATEGORIES } from "@/server/domain/categories";

/** First step of creating a listing: the category decides which fields and application questions apply. */
export function CategoryPicker({ base }: { base: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-navy">What kind of opportunity is it?</h2>
      <p className="mt-1 text-sm text-muted">Each kind has its own details and application questions.</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((c) => (
          <li key={c.key}>
            <Link href={`${base}?category=${c.key}`} className="block rounded-xl border border-line bg-surface p-4 hover:border-purple">
              <span className="font-semibold text-navy">{c.label}</span>
              {c.fields.length > 0 && <span className="mt-1 block text-xs text-muted">{c.fields.filter((f) => f.required).map((f) => f.label).join(" · ") || c.fields.map((f) => f.label).join(" · ")}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
