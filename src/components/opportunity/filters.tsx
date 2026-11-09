import Link from "next/link";
import { Search } from "lucide-react";

import { buttonClass, inputClass } from "@/components/ui";
import { categoryDef } from "@/server/domain/categories";
import type { SearchInput } from "@/server/services/opportunities";

const select = `${inputClass} pr-8`;

/** Search and filters as a plain GET form: works without JavaScript; the URL is the state. */
/** `categories`: only those with live listings (empty categories aren't offered). */
export function OpportunityFilters({ value, action = "/opportunities", categories = ["job", "internship", "gig"] }: { value: Partial<SearchInput>; action?: string; categories?: string[] }) {
  return (
    <form action={action} method="get" role="search" aria-label="Search opportunities" className="space-y-4 rounded-xl border border-line bg-surface p-4 shadow-card">
      <div className="relative">
        <label htmlFor="q" className="sr-only">Search by title, organization or skill</label>
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input id="q" name="q" defaultValue={value.q ?? ""} placeholder="Title, organization or skill" className={`${inputClass} pl-9`} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <div>
          <label htmlFor="category" className="text-xs font-semibold text-navy">Category</label>
          <select id="category" name="category" defaultValue={value.category ?? ""} className={select}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{categoryDef(c)?.plural ?? c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="workMode" className="text-xs font-semibold text-navy">Work mode</label>
          <select id="workMode" name="workMode" defaultValue={value.workMode ?? ""} className={select}>
            <option value="">Any</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">On-site</option>
          </select>
        </div>
        <div>
          <label htmlFor="location" className="text-xs font-semibold text-navy">Location</label>
          <input id="location" name="location" defaultValue={value.location ?? ""} placeholder="City" className={inputClass} />
        </div>
        <div>
          <label htmlFor="employmentType" className="text-xs font-semibold text-navy">Job type</label>
          <select id="employmentType" name="employmentType" defaultValue={value.employmentType ?? ""} className={select}>
            <option value="">Any</option>
            <option value="full_time">Full-time</option>
            <option value="part_time">Part-time</option>
            <option value="contract">Contract</option>
            <option value="temporary">Temporary</option>
          </select>
        </div>
        <div>
          <label htmlFor="maxExperience" className="text-xs font-semibold text-navy">Experience required</label>
          <select id="maxExperience" name="maxExperience" defaultValue={value.maxExperience?.toString() ?? ""} className={select}>
            <option value="">Any</option>
            <option value="0">No experience needed</option>
            <option value="1">Up to 1 year</option>
            <option value="3">Up to 3 years</option>
          </select>
        </div>
        <div>
          <label htmlFor="minComp" className="text-xs font-semibold text-navy">Minimum pay (₹, same period as listing)</label>
          <input id="minComp" name="minComp" type="number" min={0} inputMode="numeric" defaultValue={value.minComp ?? ""} className={inputClass} />
        </div>
        <div>
          <label htmlFor="closingWithinDays" className="text-xs font-semibold text-navy">Deadline</label>
          <select id="closingWithinDays" name="closingWithinDays" defaultValue={value.closingWithinDays?.toString() ?? ""} className={select}>
            <option value="">Any time</option>
            <option value="7">Closing within 7 days</option>
            <option value="30">Closing within 30 days</option>
          </select>
        </div>
        <div>
          <label htmlFor="sort" className="text-xs font-semibold text-navy">Sort by</label>
          <select id="sort" name="sort" defaultValue={value.sort ?? "newest"} className={select}>
            <option value="newest">Newest</option>
            <option value="deadline">Deadline (soonest)</option>
            <option value="relevance">Best match (signed in)</option>
          </select>
        </div>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-navy">Show only</legend>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="verified" value="1" defaultChecked={value.verified === "1"} className="size-4 accent-purple" /> Verified or source-checked</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="paid" value="1" defaultChecked={value.paid === "1"} className="size-4 accent-purple" /> Paid opportunities</label>
      </fieldset>
      <div className="flex gap-2">
        <button type="submit" className={buttonClass("primary", "md", "flex-1")}>Apply filters</button>
        <Link href={action} className={buttonClass("ghost", "md")}>Reset</Link>
      </div>
    </form>
  );
}
