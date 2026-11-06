"use client";

import { useEffect } from "react";

import { buttonClass, StateMessage } from "@/components/ui";

/** Unexpected-error boundary: shows a recoverable state; details go to the server log, never to the page. */
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error.digest ?? error.message);
  }, [error]);
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-16">
      <StateMessage
        kind="error"
        body={`Something unexpected happened. Your data is safe. ${error.digest ? `Reference: ${error.digest}` : ""}`}
        action={<button onClick={reset} className={buttonClass("primary")}>Try again</button>}
      />
    </main>
  );
}
