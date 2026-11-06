import Link from "next/link";

import { buttonClass, StateMessage } from "@/components/ui";

export default function OpportunityNotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <StateMessage kind="notFound" title="This opportunity isn't available" body="It may have closed, expired or been removed after review." action={<Link href="/opportunities" className={buttonClass("primary")}>Explore open opportunities</Link>} />
    </div>
  );
}
