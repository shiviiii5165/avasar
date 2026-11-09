import { expect, test, type Page } from "@playwright/test";

/** Signed-in student dashboard, desktop. Data: the seeded sample listings in the isolated test database. */

const ROUTES: [string, string, string][] = [
  ["/app", "Home", "Hello, Asha."],
  ["/app/discover", "Opportunities", "Opportunities for you"],
  ["/app/applications", "Applications", "Applications"],
  ["/app/saved", "Saved", "Saved"],
  ["/app/profile", "Profile", "Asha Rao (dev)"],
  ["/app/insights", "Career insights", "Career insights"],
  ["/app/notifications", "Notifications", "Notifications"],
  ["/app/settings", "Settings", "Settings"],
  ["/app/help", "Help", "Help"],
];

const sidebar = (page: Page) => page.locator('nav[aria-label="Candidate"]');
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => { if (r.status() >= 400 && !r.url().includes("favicon")) errors.push(`${r.status()} ${r.url()}`); });
  return errors;
}

test.describe("all nine sections", () => {
  for (const [path, label, heading] of ROUTES) {
    test(`${label}: loads with one active nav item, no errors, no overflow`, async ({ page }) => {
      const errors = collectErrors(page);
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      const active = sidebar(page).locator('a[aria-current="page"]');
      await expect(active).toHaveCount(1);
      await expect(active).toContainText(label);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
    });
  }
});

test.describe("sidebar", () => {
  test("collapses to icons, widens content, shows tooltips, persists, expands", async ({ page }) => {
    await page.goto("/app/discover");
    const nav = sidebar(page);
    const main = page.locator("main#main");
    const before = { nav: (await nav.boundingBox())!.width, main: (await main.boundingBox())!.width };

    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect.poll(async () => (await nav.boundingBox())!.width).toBeLessThan(60);
    expect((await main.boundingBox())!.width).toBeGreaterThan(before.main + 100);
    expect(before.nav).toBeGreaterThan(150);
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute("aria-expanded", "false");
    await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
    expect(await overflow(page)).toBeLessThanOrEqual(0);

    // Tooltip on hover
    const apps = nav.getByRole("link", { name: "Applications" });
    await apps.hover();
    await expect(apps.locator("span[aria-hidden]").last()).toHaveCSS("opacity", "1");
    // Tooltip on keyboard focus
    await page.mouse.move(900, 700);
    await nav.getByRole("link", { name: "Applications" }).focus();
    await page.keyboard.press("Tab");
    const saved = nav.getByRole("link", { name: "Saved" });
    await expect(saved).toBeFocused();
    await expect(saved.locator("span[aria-hidden]").last()).toHaveCSS("opacity", "1");

    // Persists across refresh and navigation (cookie read by the server: correct width on first paint)
    await page.reload();
    expect((await nav.boundingBox())!.width).toBeLessThan(60);
    await nav.getByRole("link", { name: "Settings" }).click();
    await page.waitForURL(/\/app\/settings/);
    expect((await nav.boundingBox())!.width).toBeLessThan(60);
    await expect(nav.locator('a[aria-current="page"]')).toHaveAccessibleName("Settings");

    await page.getByRole("button", { name: "Expand sidebar" }).click();
    await expect.poll(async () => (await nav.boundingBox())!.width).toBeGreaterThan(150);
    await page.reload();
    expect((await nav.boundingBox())!.width).toBeGreaterThan(150);
  });
});

test.describe("opportunities", () => {
  const count = (page: Page) => page.locator("main p[aria-live]");
  const emptyTitles = (page: Page) => page.locator('main [role="status"] h2');

  test("search finds by skill and shows one search-specific empty state", async ({ page }) => {
    await page.goto("/app/discover");
    await expect(count(page)).toContainText("12 opportunities");
    await page.getByRole("searchbox", { name: "Search by role, skill or organization" }).fill("pytorch");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.waitForURL(/q=pytorch/);
    await expect(count(page)).toContainText("for “pytorch”");
    await expect(page.getByRole("heading", { level: 3, name: /Machine Learning Intern/ }).last()).toBeVisible();

    await page.getByRole("searchbox", { name: "Search by role, skill or organization" }).fill("zzqx-no-such-role");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.waitForURL(/q=zzqx/);
    await expect(emptyTitles(page)).toHaveCount(1);
    await expect(emptyTitles(page)).toHaveText("No results for “zzqx-no-such-role”");
    await page.getByRole("link", { name: "Clear search" }).click();
    await expect(count(page)).toContainText("12 opportunities");
  });

  test("filters update results, show their count and have their own empty state", async ({ page }) => {
    await page.goto("/app/discover");
    await page.getByText("More filters").click();
    await page.getByLabel("Work mode").selectOption("remote");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await page.waitForURL(/workMode=remote/);
    await expect(page.getByText("More filters (1)")).toBeVisible();
    const remote = await count(page).textContent();
    expect(remote).toMatch(/\d+ opportunit/);
    expect(remote).not.toContain("12 opportunities");

    await page.goto("/app/discover?workMode=onsite&paid=1&maxExperience=0&closingWithinDays=7&minComp=99000000");
    await expect(page.getByText("More filters (5)")).toBeVisible();
    await expect(emptyTitles(page)).toHaveCount(1);
    await expect(emptyTitles(page)).toHaveText("No opportunities match these filters");
    await page.getByRole("link", { name: "Clear filters" }).first().click();
    await expect(count(page)).toContainText("12 opportunities");
  });

  test("category tabs keep search state and sorting submits", async ({ page }) => {
    await page.goto("/app/discover");
    await page.getByRole("navigation", { name: "Categories" }).getByRole("link", { name: "Internships" }).click();
    await page.waitForURL(/category=internship/);
    await expect(page.getByRole("navigation", { name: "Categories" }).locator('[aria-current="page"]')).toHaveText("Internships");
    await expect(count(page)).toContainText("in internships");

    await page.getByLabel("Sort").selectOption("deadline");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.waitForURL(/sort=deadline/);
    expect(page.url()).toContain("category=internship");
    await expect(page.getByLabel("Sort")).toHaveValue("deadline");
  });
});

test.describe("other sections", () => {
  test("Saved: save from a listing, see it in Saved, remove it", async ({ page }) => {
    await page.goto("/app/saved");
    await expect(page.getByRole("heading", { name: "Nothing saved yet" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Find opportunities" })).toHaveAttribute("href", "/app/discover");

    await page.goto("/app/discover?q=pytorch");
    await page.getByRole("link", { name: /Machine Learning Intern/ }).last().click();
    const save = page.locator("button[aria-pressed]");
    await expect(save).toHaveAttribute("aria-pressed", "false");
    await save.click();
    await expect(save).toHaveAttribute("aria-pressed", "true");

    await page.goto("/app/saved");
    await expect(page.getByRole("heading", { level: 3, name: /Machine Learning Intern/ })).toBeVisible();

    await page.getByRole("link", { name: /Machine Learning Intern/ }).first().click();
    await page.locator("button[aria-pressed]").click();
    await expect(page.locator("button[aria-pressed]")).toHaveAttribute("aria-pressed", "false");
    await page.goto("/app/saved");
    await expect(page.getByRole("heading", { name: "Nothing saved yet" })).toBeVisible();
  });

  test("Applications: honest empty state that leads to opportunities", async ({ page }) => {
    await page.goto("/app/applications");
    await expect(page.getByRole("heading", { name: "No applications yet" })).toBeVisible();
    await page.getByRole("link", { name: "Find opportunities" }).click();
    await page.waitForURL(/\/app\/discover/);
  });

  test("Profile: a skill added in Avsar is saved and labelled as Avsar-owned", async ({ page }) => {
    await page.goto("/app/profile");
    const field = page.getByLabel("Skills you want to add in Avsar (comma separated)");
    await field.fill("Python, Docker");
    await page.getByRole("button", { name: "Save my added skills" }).click();
    await expect(page.getByRole("status").filter({ hasText: /saved|updated/i }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByText("Added in Avsar", { exact: true })).toBeVisible();
    await expect(page.getByRole("list", { name: "Skills you added in Avsar" })).toContainText("Docker");
  });

  test("Career insights: evidence-based sections once skills exist", async ({ page }) => {
    await page.goto("/app/insights");
    await expect(page.getByRole("heading", { name: "Skills that would open the most doors" })).toBeVisible();
    await expect(page.getByText(/Based on your profile and the \d+ open listing/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Strengthen your evidence" })).toBeVisible();
  });

  test("Notifications: read/unread presentation and settings link", async ({ page }) => {
    await page.goto("/app/notifications");
    const empty = page.getByRole("heading", { name: "You're all caught up" });
    if (!(await empty.isVisible())) {
      // Unread items carry a screen-reader label; "Mark all as read" clears them.
      const unread = page.getByText("Unread:");
      if (await unread.count()) {
        await page.getByRole("button", { name: "Mark all as read" }).click();
        await expect(page.getByText("Unread:")).toHaveCount(0);
      }
    }
    await page.getByRole("main").getByRole("link", { name: "Settings" }).click();
    await page.waitForURL(/\/app\/settings/);
  });

  test("Settings: visibility saves and persists", async ({ page }) => {
    await page.goto("/app/settings");
    await page.getByLabel(/Application-based/).check();
    await page.getByRole("button", { name: "Save visibility" }).click();
    await expect(page.getByRole("status").first()).toBeVisible();
    await page.reload();
    await expect(page.getByLabel(/Application-based/)).toBeChecked();
    await page.getByLabel(/^Private/).check();
    await page.getByRole("button", { name: "Save visibility" }).click();
    await expect(page.getByRole("status").first()).toBeVisible();
  });

  test("Help: shortcuts work and answers expand", async ({ page }) => {
    await page.goto("/app/help");
    await page.getByText("Is Avsar free?").click();
    await expect(page.getByText("Discovering opportunities and applying is free for candidates.")).toBeVisible();
    await page.getByRole("link", { name: /Track an application/ }).click();
    await page.waitForURL(/\/app\/applications/);
    await page.goto("/app/help");
    await expect(page.getByRole("main").getByRole("link", { name: "Contact us" })).toHaveAttribute("href", "/contact");
  });
});
