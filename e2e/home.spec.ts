import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { OUT } from "../playwright.config";

/**
 * Home is the career dashboard (the former Career intelligence page, now reused on Home); Opportunities is the full
 * listing. Navigation has no separate Career intelligence entry, and both pages fit every screen without sideways scrolling.
 */
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const tooWide = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("main *")]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && ![...el.children].some((c) => c.getBoundingClientRect().right > window.innerWidth + 1))
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.getAttribute("class") ?? "").slice(0, 60)} "${(el.textContent ?? "").slice(0, 40)}"`),
  );

test("sidebar: Home stays Home, and there is no separate Career intelligence entry", async ({ page }) => {
  await page.goto("/app");
  const nav = page.locator('nav[aria-label="Candidate"]');
  await expect(nav.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: /Career intelligence/ })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Opportunities", exact: true })).toBeVisible();
});

test("the old Career intelligence address opens Home", async ({ page }) => {
  await page.goto("/app/career");
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { level: 1, name: /^Hello,/ })).toBeVisible();
});

test("Home is the career dashboard: summary, skills, goal skills, openings, applications", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/app");
  await expect(page.getByTestId("career-summary")).toBeVisible();
  await expect(page.getByTestId("skill-explorer").or(page.getByTestId("skill-explorer-empty"))).toBeVisible();
  await expect(page.getByTestId("goal-skills")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Openings that fit you" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your applications" })).toBeVisible();
  await expect(page.getByRole("link", { name: "See all opportunities" })).toHaveAttribute("href", "/app/discover");
  // No uncalibrated percentages anywhere on Home.
  expect(await page.locator("main").innerText()).not.toMatch(/\d+% match/);
  expect(errors).toEqual([]);
});

test("Opportunities lists every open listing across categories, with honest counts", async ({ page }) => {
  await page.goto("/app/discover");
  await expect(page.getByRole("heading", { level: 1, name: "Opportunities for you" })).toBeVisible();
  const totals = await page.getByTestId("opportunity-totals").innerText();
  const total = Number(totals.match(/^(\d+)/)![1]);
  const tabs = page.getByRole("navigation", { name: "Categories" }).getByRole("link");
  await expect(tabs.first()).toContainText(`All${total}`);
  // Each category tab's count matches the listings shown under it.
  const count = await tabs.count();
  for (let i = 1; i < Math.min(count, 4); i++) {
    const tab = tabs.nth(i);
    const n = Number((await tab.innerText()).match(/(\d+)\s*$/)![1]);
    if (n === 0) continue;
    await tab.click();
    await expect(page.getByText(new RegExp(`^${n} opportunit`)).first()).toBeVisible();
  }
});

for (const [label, viewport, scale] of [
  ["desktop", { width: 1440, height: 900 }, 1],
  ["laptop zoomed to 200%", { width: 720, height: 450 }, 2],
  ["tablet", { width: 834, height: 1112 }, 1],
  ["phone", { width: 390, height: 844 }, 3],
  ["narrow phone", { width: 320, height: 640 }, 2],
] as const) {
  test(`${label}: Home and Opportunities fit without sideways scrolling`, async ({ browser }) => {
    const context = await browser.newContext({ viewport, deviceScaleFactor: scale, storageState: test.info().project.use.storageState as string });
    const page = await context.newPage();
    for (const route of ["/app", "/app/discover"]) {
      await page.goto(route);
      await expect(page.locator("main h1")).toBeVisible();
      // Home: the skills map is drawn once its width is measured (or the empty state shows): never left blank.
      if (route === "/app") await expect(page.getByTestId("skill-network").locator("svg").or(page.getByTestId("skill-explorer-empty"))).toBeVisible();
      expect(await overflow(page), `${route}: ${(await tooWide(page)).join("\n")}`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(OUT, "screens", "home", `${label.replace(/[^a-z0-9]+/gi, "-")}${route.replace(/\//g, "-")}.png`), fullPage: true, animations: "disabled" });
    }
    await context.close();
  });
}
