import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Whole-product smoke check: every page each role can reach loads without a server error, an uncaught page error or
 * a console error. Read-only (it only visits pages). Personas are the local development sign-ins (AVSAR_DEV_AUTH=1),
 * so nothing touches AI Tathastu or production.
 */
const PUBLIC = ["/", "/about", "/contact", "/employer", "/for-candidates", "/for-employers", "/for-institutions", "/help", "/how-it-works", "/opportunities", "/privacy", "/terms", "/sign-in", "/api/health/live"];
const CANDIDATE = ["/app", "/app/discover", "/app/applications", "/app/saved", "/app/profile", "/app/insights", "/app/notifications", "/app/settings", "/app/help", "/app/career"];
const ADMIN = ["/admin", "/admin/ai-health", "/admin/analytics", "/admin/applications", "/admin/audit", "/admin/candidates", "/admin/configuration", "/admin/health", "/admin/imports", "/admin/moderation", "/admin/notifications", "/admin/opportunities", "/admin/opportunities/new", "/admin/organizations", "/admin/sources", "/admin/support", "/admin/verification"];

type Problem = string;
function watch(page: Page) {
  const problems: Problem[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    // Expected browser noise only: Next's dev overlay notices and blocked third-party favicons never count.
    if (m.type() === "error" && !/favicon|Download the React DevTools/.test(m.text())) problems.push(`console: ${m.text().slice(0, 200)}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 500) problems.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  return problems;
}

async function signedIn(browser: Browser, persona: string) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.getByRole("button", { name: persona, exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"));
  return { context, page };
}

async function visitAll(page: Page, paths: string[], problems: Problem[]) {
  for (const path of paths) {
    const res = await page.goto(path);
    expect(res?.status(), `${path} status`).toBeLessThan(500);
    await expect(page.locator("body")).toBeVisible();
  }
  expect(problems, problems.join("\n")).toEqual([]);
}

test("public pages and a listing load for visitors", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  const problems = watch(page);
  await visitAll(page, PUBLIC, problems);
  await page.goto("/opportunities");
  const listing = await page.locator('a[href^="/opportunities/"]').first().getAttribute("href");
  await visitAll(page, [listing!], problems);
  await context.close();
});

test("every student page, a listing and its application form load", async ({ browser }) => {
  const { context, page } = await signedIn(browser, "Candidate");
  const problems = watch(page);
  await visitAll(page, CANDIDATE, problems);
  await page.goto("/app/discover?sort=newest");
  const slug = (await page.locator('[data-testid="browse-results"] a[href^="/opportunities/"]').first().getAttribute("href"))!.split("/").pop()!;
  await visitAll(page, [`/opportunities/${slug}`, `/app/apply/${slug}`], problems);
  // Personal data export (GDPR-style download) answers for the signed-in student.
  const exported = await page.request.get("/api/me/export");
  expect(exported.status()).toBe(200);
  await context.close();
});

test("every admin page and an opportunity record load for a platform admin", async ({ browser }) => {
  const { context, page } = await signedIn(browser, "Platform admin");
  const problems = watch(page);
  await visitAll(page, ADMIN, problems);
  await page.goto("/admin/opportunities");
  const record = await page.locator('a[href^="/admin/opportunities/"]:not([href$="/new"])').first().getAttribute("href");
  if (record) await visitAll(page, [record], problems);
  await context.close();
});

for (const persona of ["Moderator", "Verification officer"]) {
  test(`${persona}: admin area loads within their permissions (no server errors)`, async ({ browser }) => {
    const { context, page } = await signedIn(browser, persona);
    const problems = watch(page);
    await visitAll(page, ["/admin", "/admin/moderation", "/admin/verification", "/admin/opportunities"], problems);
    await context.close();
  });
}

test("employer studio loads", async ({ browser }) => {
  const { context, page } = await signedIn(browser, "Employer");
  const problems = watch(page);
  await visitAll(page, ["/studio"], problems);
  // A new employer has no organization yet (the page offers to register one); only then are org pages checked.
  const orgLinks = page.locator('main a[href^="/studio/"]');
  const org = (await orgLinks.count()) ? await orgLinks.first().getAttribute("href") : null;
  if (org && /^\/studio\/[0-9a-f-]{36}/.test(org)) {
    const base = org.match(/^\/studio\/[0-9a-f-]{36}/)![0];
    await visitAll(page, [base, `${base}/listings`, `${base}/listings/new`, `${base}/applicants`, `${base}/settings`], problems);
  }
  await context.close();
});
