import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { Doorway } from "@/components/brand/doorway";
import { buttonClass } from "@/components/ui";
import { getSession } from "@/server/auth/session";
import { safeReturnTo } from "@/server/auth/tathastu";
import { devAuthEnabled, tathastuConfig } from "@/server/config";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

const ERRORS: Record<string, string> = {
  invalid_state: "Your sign-in session expired or was already used. Please try again.",
  provider_error: "Sign-in was cancelled or refused by AI Tathastu.",
  token_invalid: "We couldn't verify your sign-in. Please try again.",
  provider_unavailable: "AI Tathastu isn't responding right now. Please try again in a few minutes.",
  sso_not_configured: "Sign-in with AI Tathastu isn't available yet in this environment.",
  account_disabled: "This account has been disabled. Contact support if you think this is a mistake.",
  unavailable: "Sign-in is temporarily unavailable. Please try again.",
};

type SP = Promise<{ returnTo?: string; error?: string }>;

export default async function SignInPage({ searchParams }: { searchParams: SP }) {
  const { returnTo: rawReturn, error } = await searchParams;
  const returnTo = rawReturn ? safeReturnTo(rawReturn) : "/app/discover"; // straight to personalized opportunities
  const session = await getSession();
  if (session) redirect(returnTo);
  const ssoReady = Boolean(tathastuConfig().config);
  const dev = devAuthEnabled();

  return (
    <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:px-8">
      <div className="max-w-md">
        <h1 className="font-serif text-4xl text-navy sm:text-5xl">Welcome to <em className="italic text-orange">Avsar</em></h1>
        <p className="mt-3 text-muted">Sign in with your AI Tathastu account. Avsar keeps its own profile for you, and nothing is shared without your choice.</p>
        {error && (
          <p role="alert" className="mt-6 rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">{ERRORS[error] ?? ERRORS.unavailable}</p>
        )}
        <div className="mt-8 space-y-3">
          {ssoReady ? (
            <a href={`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`} className={buttonClass("primary", "lg", "w-full")}>Continue with AI Tathastu</a>
          ) : (
            <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted">
              Sign-in with AI Tathastu is being connected. You can keep exploring opportunities without an account.
            </p>
          )}
          <p className="flex items-start gap-2 text-xs text-muted">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
            Avsar never sees your AI Tathastu password. We verify your identity with signed tokens and keep our own secure session.
          </p>
        </div>

        {dev && (
          <section aria-labelledby="dev-title" className="mt-10 rounded-xl border-2 border-dashed border-orange/60 bg-peach-soft/50 p-5">
            <h2 id="dev-title" className="text-sm font-bold uppercase tracking-wide text-orange-deep">Development sign-in (simulated, not AI Tathastu)</h2>
            <p className="mt-1 text-xs text-navy-soft">Synthetic test personas for local development. This panel is disabled in production and when AVSAR_DEV_AUTH is off.</p>
            <form method="post" action="/api/auth/dev" className="mt-4 grid gap-2 sm:grid-cols-3">
              <input type="hidden" name="returnTo" value={rawReturn ? returnTo : ""} />
              <button name="persona" value="candidate" className={buttonClass("secondary", "sm")}>Candidate</button>
              <button name="persona" value="admin" className={buttonClass("secondary", "sm")}>Platform admin</button>
              <button name="persona" value="moderator" className={buttonClass("secondary", "sm")}>Moderator</button>
            </form>
          </section>
        )}
      </div>
      <Doorway className="hidden w-full lg:block" />
    </div>
  );
}
