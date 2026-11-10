import { PageSkeleton } from "@/components/candidate/page-skeleton";

/** Instant, prefetched loading state for Opportunities (see PageSkeleton for why only some sections have one). */
export default function Loading() {
  return <PageSkeleton />;
}
