import { expect, test, type Page } from "@playwright/test";

/**
 * The visitor → sign-in → opportunities journey: public Explore and the signed-in pages show the same unique
 * openings, external job portals aren't promoted, and a signed-in student isn't sent back to public pages.
 */

/** Every card's "title | organization" across all pages of a result list. */
async function allCards(page: Page, start: string, cardSel: string) {
  const seen: string[] = [];
  let url: string | null = start;
  for (let guard = 0; url && guard < 30; guard++) {
    await page.goto(url);
    seen.push(...(await page.locator(cardSel).evaluateAll((els) => els.map((el) => `${el.querySelector("h3")?.textContent?.trim()}|${el.querySelector("h3 + p")?.textContent?.trim()}`))));
    const next = page.getByRole("navigation", { name: "Pagination" }).getByRole("link", { name: "Next" });
    url = (await next.count()) ? await next.getAttribute("href") : null;
  }
  return seen;
}
const count = async (page: Page) => Number((await page.getByText(/^\d+ (open )?opportunit/).first().innerText()).match(/\d+/)![0]);

test.describe("visitor (signed out)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("Explore ends after the results: no external portal promotion", async ({ page }) => {
    await page.goto("/opportunities");
    await expect(page.getByRole("heading", { level: 1, name: "Explore opportunities" })).toBeVisible();
    for (const t of ["Also search official portals", "Search official portals", "AICTE", "National Career Service", "NATS", "Naukri"]) await expect(page.getByText(t)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Continue with AI Tathastu" })).toBeVisible();
  });

  test("every opening appears once across all pages, and the count matches", async ({ page }) => {
    await page.goto("/opportunities");
    const total = await count(page);
    const cards = await allCards(page, "/opportunities", '[data-testid="explore-results"] > li');
    expect(new Set(cards).size, `duplicates: ${cards.filter((c, i) => cards.indexOf(c) !== i)}`).toBe(cards.length);
    expect(cards).toHaveLength(total);
  });

  test("the Field filter narrows to that field and its count matches the cards", async ({ page }) => {
    await page.goto("/opportunities");
    const field = page.getByLabel("Field");
    await expect(field).toBeVisible();
    const option = field.locator("option").nth(1);
    const value = await option.getAttribute("value");
    const label = (await option.innerText()).trim();
    const expected = Number(label.match(/\((\d+)\)$/)![1]);
    await page.goto(`/opportunities?field=${value}`);
    expect(await count(page)).toBe(expected);
    const cards = await allCards(page, `/opportunities?field=${value}`, '[data-testid="explore-results"] > li');
    expect(cards).toHaveLength(expected);
  });

  test("homepage stays public; the sign-in page explains an ended session", async ({ page, context }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await context.addCookies([{ name: "avsar_session", value: "x".repeat(43), url: page.url() }]);
    await page.goto("/sign-in");
    await expect(page.getByText("Your Avsar session ended.")).toBeVisible();
  });
});

test.describe("signed-in student", () => {
  test("opening Avsar or Explore takes them to their personalized pages, keeping the search", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/app$/);
    await page.goto("/opportunities?q=python&category=internship");
    await expect(page).toHaveURL(/\/app\/discover\?q=python&category=internship$/);
    await expect(page.getByRole("heading", { level: 1, name: "Opportunities for you" })).toBeVisible();
    // A shared listing link stays a public page for everyone.
    await page.goto("/app/discover");
    const slugHref = await page.locator('a[href^="/opportunities/"]').first().getAttribute("href");
    await page.goto(slugHref!);
    await expect(page).toHaveURL(new RegExp(`${slugHref}$`));
  });

  test("signed-in browse shows each opening once with a matching count", async ({ page }) => {
    await page.goto("/app/discover?sort=newest");
    const total = Number((await page.getByText(/^\d+ opportunit/).first().innerText()).match(/\d+/)![0]);
    const cards = await allCards(page, "/app/discover?sort=newest", '[data-testid="browse-results"] > li');
    expect(new Set(cards).size).toBe(cards.length);
    expect(cards).toHaveLength(total);
  });

  test("the session cookie is renewed on page loads (sliding session)", async ({ page, context }) => {
    await page.goto("/app");
    const before = (await context.cookies()).find((c) => c.name === "avsar_session")!;
    await page.waitForTimeout(1100);
    await page.goto("/app/discover");
    const after = (await context.cookies()).find((c) => c.name === "avsar_session")!;
    expect(after.value).toBe(before.value);
    expect(after.expires).toBeGreaterThan(before.expires);
  });
});
