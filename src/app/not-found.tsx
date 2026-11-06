import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { buttonClass, StateMessage } from "@/components/ui";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-16">
      <Logo />
      <div className="mt-10">
        <StateMessage kind="notFound" title="This door doesn't lead anywhere" body="The page you're looking for doesn't exist or has moved." action={<Link href="/" className={buttonClass("primary")}>Back to Avsar</Link>} />
      </div>
    </main>
  );
}
