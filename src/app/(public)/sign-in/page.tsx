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
  browser_mismatch: "Please finish signing in in the same browser you started in, then try again.",
  access_denied: "You chose not to share your AI Tathastu account with Avsar. You can keep exploring without signing in.",
  invalid_grant: "That sign-in link expired before it was used. Please try again.",
  client_misconfigured: "Sign-in with AI Tathastu is misconfigured on our side. We've been notified; please try again later.",
  login_required: "Please sign in to AI Tathastu, then try again.",
  consent_required: "Please allow Avsar on AI Tathastu, then try again.",
  provider_error: "AI Tathastu couldn't complete the sign-in. Please try again.",
  token_invalid: "We couldn't verify your sign-in. Please try again.",
  provider_unavailable: "AI Tathastu isn't responding right now. Please try again in a few minutes.",
  sso_not_configured: "Sign-in with AI Tathastu isn't available yet in this environment.",
  account_disabled: "This account has been disabled. Contact support if you think this is a mistake.",
  unavailable: "Sign-in is temporarily unavailable. Please try again.",
  rate_limited: "Too many sign-in attempts from your network. Please wait a minute and try again.",
};

type SP = Promise<{ returnTo?: string; error?: string }>;

export default async function SignInPage({ searchParams }: { searchParams: SP }) {
  const { returnTo: rawReturn, error } = await searchParams;
  const returnTo = rawReturn ? safeReturnTo(rawReturn) : "/app/discover"; // straight to personalized opportunities
  const session = await getSession();
  if (session) redirect(returnTo);
  const ssoReady = Boolean(tathastuConfig().config);
  const dev = devAuthEnabled();
  const loginHref = `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:px-8">
      <div className="mx-auto w-full max-w-md lg:mx-0">
        <h1 className="font-serif text-4xl leading-tight text-navy sm:text-5xl">Sign in to <em className="italic text-orange">Avsar</em></h1>
        <p className="mt-4 text-lg text-navy-soft">Continue with your AI Tathastu account to explore opportunities and manage your applications.</p>
        {error && (
          <p role="alert" className="mt-6 rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">{ERRORS[error] ?? ERRORS.unavailable}</p>
        )}
        <a href={loginHref} className={buttonClass("primary", "lg", "mt-10 w-full")}>Continue with AI Tathastu</a>
        {/* AI Tathastu has no separate sign-up page: its login creates the account for a new email, then returns here. */}
        <p className="mt-5 text-center text-sm text-muted">
          New to AI Tathastu?{" "}
          <a href={loginHref} className="font-semibold text-orange underline-offset-4 hover:underline">Create a free account</a>
        </p>
        {!ssoReady && (
          <p className="mt-4 text-center text-xs text-muted">Sign-in is still being connected in this environment.</p>
        )}
        <p className="mt-10 flex items-center justify-center gap-1.5 border-t border-line pt-5 text-xs text-muted">
          <ShieldCheck aria-hidden className="size-3.5 shrink-0 text-success" />
          Your password stays with AI Tathastu. Avsar never sees it.
        </p>

        {dev && (
          <section aria-labelledby="dev-title" className="mt-10 rounded-xl border-2 border-dashed border-orange/60 bg-peach-soft/50 p-5">
            <h2 id="dev-title" className="text-sm font-bold uppercase tracking-wide text-orange-deep">Development sign-in (simulated, not AI Tathastu)</h2>
            <p className="mt-1 text-xs text-navy-soft">Synthetic test personas for local development. This panel is disabled in production and when AVSAR_DEV_AUTH is off.</p>
            <form method="post" action="/api/auth/dev" className="mt-4 grid gap-2 sm:grid-cols-3">
              <input type="hidden" name="returnTo" value={rawReturn ? returnTo : ""} />
              <button name="persona" value="candidate" className={buttonClass("secondary", "sm")}>Candidate</button>
              <button name="persona" value="admin" className={buttonClass("secondary", "sm")}>Platform admin</button>
              <button name="persona" value="moderator" className={buttonClass("secondary", "sm")}>Moderator</button>
              <button name="persona" value="verifier" className={buttonClass("secondary", "sm")}>Verification officer</button>
              <button name="persona" value="employer" className={buttonClass("secondary", "sm")}>Employer</button>
              <button name="persona" value="employer2" className={buttonClass("secondary", "sm")}>Other employer</button>
            </form>
          </section>
        )}
      </div>
      <Doorway className="hidden w-full lg:block" />
    </div>
  );
}
