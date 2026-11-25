import { PageSkeleton } from "@/components/candidate/page-skeleton";

/** Instant, prefetched loading state for Career intelligence: it matches every open listing, so it's a heavy page. */
export default function Loading() {
  return <PageSkeleton />;
}
