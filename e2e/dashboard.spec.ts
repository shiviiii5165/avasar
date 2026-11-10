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
/**
 * True when the tooltip is painted above positioned page content (cards, the search box). A transparent positioned
 * layer is added inside <main> for the probe, so the result doesn't depend on what happens to sit beside the sidebar.
 */
const tooltipOnTop = (tip: ReturnType<Page["locator"]>) => tip.evaluate((el: HTMLElement) => {
  const layer = document.createElement("div");
  layer.style.cssText = "position:absolute;inset:0;";
  document.querySelector("main#main")!.appendChild(layer);
  el.style.pointerEvents = "auto"; // hit-testing skips pointer-events: none, so enable it just for the probe
  const r = el.getBoundingClientRect();
  const hit = el.contains(document.elementFromPoint(r.right - 4, r.top + r.height / 2));
  el.style.pointerEvents = "";
  layer.remove();
  return hit;
});
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
  test("is a full-height rail on the left edge with the collapse control at the right end of its footer", async ({ page }) => {
    await page.goto("/app/discover");
    const viewport = page.viewportSize()!;
    const nav = (await sidebar(page).boundingBox())!;
    const main = (await page.locator("main#main").boundingBox())!;
    const header = (await page.locator("header").first().boundingBox())!;
    // Attached to the left edge, directly under the header, down to the bottom of the window.
    expect(nav.x).toBe(0);
    expect(Math.abs(nav.y - (header.y + header.height))).toBeLessThanOrEqual(1);
    expect(Math.abs(nav.y + nav.height - viewport.height)).toBeLessThanOrEqual(1);
    // Content starts where the sidebar ends and runs to the right edge (no centred fixed-width container).
    expect(Math.abs(main.x - (nav.x + nav.width))).toBeLessThanOrEqual(1);
    expect(Math.abs(main.x + main.width - viewport.width)).toBeLessThanOrEqual(1);

    for (const name of ["Collapse sidebar", "Expand sidebar"]) {
      const toggle = page.getByRole("button", { name });
      const box = (await toggle.boundingBox())!;
      const rail = (await sidebar(page).boundingBox())!;
      // Bottom of the sidebar, at its right end (expanded) or centred in the narrow rail (collapsed), inside the rail.
      expect(rail.y + rail.height - (box.y + box.height)).toBeLessThanOrEqual(16);
      expect(rail.x + rail.width - (box.x + box.width)).toBeLessThanOrEqual(16);
      expect(box.x).toBeGreaterThanOrEqual(rail.x);
      // Nothing in the navigation overlaps it.
      const links = await sidebar(page).getByRole("link").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom));
      expect(Math.max(...links)).toBeLessThanOrEqual(box.y);
      await toggle.click();
      await expect.poll(async () => (await sidebar(page).boundingBox())!.width).toBe(name === "Collapse sidebar" ? 64 : 240);
    }
  });

  test("collapses to icons, widens content, shows tooltips, persists, expands", async ({ page }) => {
    await page.goto("/app/discover");
    const nav = sidebar(page);
    const main = page.locator("main#main");
    const before = { nav: (await nav.boundingBox())!.width, main: (await main.boundingBox())!.width };

    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect.poll(async () => (await nav.boundingBox())!.width).toBeLessThanOrEqual(64);
    expect((await main.boundingBox())!.width).toBeGreaterThan(before.main + 150);
    expect(before.nav).toBeGreaterThan(150);
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute("aria-expanded", "false");
    await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
    expect(await overflow(page)).toBeLessThanOrEqual(0);

    // Tooltip on hover, above the opportunity cards beside it
    const apps = nav.getByRole("link", { name: "Applications" });
    await apps.hover();
    await expect(apps.locator("span[aria-hidden]").last()).toHaveCSS("opacity", "1");
    expect(await tooltipOnTop(apps.locator("span[aria-hidden]").last())).toBe(true);
    // Tooltip on keyboard focus
    await page.mouse.move(900, 700);
    await nav.getByRole("link", { name: "Applications" }).focus();
    await page.keyboard.press("Tab");
    const saved = nav.getByRole("link", { name: "Saved" });
    await expect(saved).toBeFocused();
    await expect(saved.locator("span[aria-hidden]").last()).toHaveCSS("opacity", "1");

    // Persists across refresh and navigation (cookie read by the server: correct width on first paint)
    await page.reload();
    expect((await nav.boundingBox())!.width).toBeLessThanOrEqual(64);
    await nav.getByRole("link", { name: "Settings" }).click();
    await page.waitForURL(/\/app\/settings/);
    expect((await nav.boundingBox())!.width).toBeLessThanOrEqual(64);
    await expect(nav.locator('a[aria-current="page"]')).toHaveAccessibleName("Settings");

    // The expand control has a tooltip too, drawn above the page content (not hidden behind cards or the search box).
    const expand = page.getByRole("button", { name: "Expand sidebar" });
    await expand.hover();
    const tip = expand.locator("span[aria-hidden]");
    await expect(tip).toHaveCSS("opacity", "1");
    expect(await tooltipOnTop(tip)).toBe(true);

    await expand.click();
    await expect.poll(async () => (await nav.boundingBox())!.width).toBeGreaterThan(150);
    await page.reload();
    expect((await nav.boundingBox())!.width).toBeGreaterThan(150);
  });

  test("collapsed: every section fits, with one active item and no errors", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/app/help");
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    for (const [path, label, heading] of ROUTES) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(sidebar(page).locator('a[aria-current="page"]')).toHaveAccessibleName(label);
      expect(await overflow(page), `${path} overflows`).toBeLessThanOrEqual(0);
    }
    await page.getByRole("button", { name: "Expand sidebar" }).click();
    expect(errors).toEqual([]);
  });
});

test.describe("navigation", () => {
  test("a click is acknowledged at once, even while the server is still rendering the page", async ({ page }) => {
    await page.goto("/app/help");
    await expect(page.getByRole("heading", { level: 1, name: "Help" })).toBeVisible();
    // Hold the server's answer for Applications for 3 s (a slow network or a slow database).
    let held = 0;
    await page.route((url) => url.pathname === "/app/applications", async (route) => {
      if (route.request().headers()["rsc"]) { held++; await new Promise((r) => setTimeout(r, 3000)); }
      await route.continue();
    });
    const link = sidebar(page).getByRole("link", { name: "Applications", exact: true });
    const clicked = Date.now();
    await link.click();
    // The clicked section is marked current well before the page arrives, and the old one no longer is.
    await expect(link).toHaveAttribute("aria-current", "page", { timeout: 1000 });
    expect(Date.now() - clicked).toBeLessThan(1500);
    await expect(sidebar(page).locator('a[aria-current="page"]')).toHaveCount(1);
    // A slow navigation shows a loading indicator (after a short grace period) and marks the content busy.
    const progress = page.getByRole("progressbar", { name: "Loading page" });
    await expect(progress).toHaveCSS("opacity", "1", { timeout: 2000 });
    await expect(page.locator("main#main")).toHaveAttribute("aria-busy", "true");
    await expect(page.getByRole("heading", { level: 1, name: "Applications" })).toBeVisible({ timeout: 15_000 });
    expect(held).toBeGreaterThan(0);
    await expect(progress).toHaveCount(0);
    await expect(page.locator("main#main")).not.toHaveAttribute("aria-busy", "true");
    await expect(sidebar(page).locator('a[aria-current="page"]')).toHaveAccessibleName("Applications");
  });

  test("rapid consecutive clicks end on the last section, with no stale content or active state", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/app/help");
    await expect(page.getByRole("heading", { level: 1, name: "Help" })).toBeVisible();
    for (const name of ["Saved", "Profile", "Notifications", "Settings"]) {
      await sidebar(page).getByRole("link", { name, exact: true }).click({ noWaitAfter: true });
    }
    await page.waitForURL(/\/app\/settings$/);
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await page.waitForTimeout(1000); // any late response from an earlier click would land here
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await expect(page.locator("main h1")).toHaveCount(1);
    await expect(sidebar(page).locator('a[aria-current="page"]')).toHaveCount(1);
    await expect(sidebar(page).locator('a[aria-current="page"]')).toHaveAccessibleName("Settings");
    expect(page.url()).toMatch(/\/app\/settings$/);
    expect(errors).toEqual([]);
  });

  test("browser back and forward keep content and active item in step", async ({ page }) => {
    await page.goto("/app/help");
    await sidebar(page).getByRole("link", { name: "Saved", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Saved" })).toBeVisible();
    await sidebar(page).getByRole("link", { name: "Career insights", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Career insights" })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/app\/saved$/);
    await expect(page.getByRole("heading", { level: 1, name: "Saved" })).toBeVisible();
    await expect(sidebar(page).locator('a[aria-current="page"]')).toHaveAccessibleName("Saved");
    await page.goBack();
    await expect(page.getByRole("heading", { level: 1, name: "Help" })).toBeVisible();
    await expect(sidebar(page).locator('a[aria-current="page"]')).toHaveAccessibleName("Help");
    await page.goForward();
    await expect(page.getByRole("heading", { level: 1, name: "Saved" })).toBeVisible();
    await expect(sidebar(page).locator('a[aria-current="page"]')).toHaveAccessibleName("Saved");
  });

  test("sidebar navigation stays client-side (no full page reloads)", async ({ page }) => {
    await page.goto("/app/help");
    await page.evaluate(() => { (window as unknown as { __alive: boolean }).__alive = true; });
    for (const [, label, heading] of ROUTES) {
      if (label === "Help") continue;
      await sidebar(page).getByRole("link", { name: label, exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    }
    // A full reload would have discarded this marker.
    expect(await page.evaluate(() => (window as unknown as { __alive?: boolean }).__alive)).toBe(true);
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
    // The pressed state is optimistic; the button stays disabled until the server has stored the change.
    await expect(save).toBeEnabled();

    await page.goto("/app/saved");
    await expect(page.getByRole("heading", { level: 3, name: /Machine Learning Intern/ })).toBeVisible();

    await page.getByRole("link", { name: /Machine Learning Intern/ }).first().click();
    await page.locator("button[aria-pressed]").click();
    await expect(page.locator("button[aria-pressed]")).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("button[aria-pressed]")).toBeEnabled();
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
