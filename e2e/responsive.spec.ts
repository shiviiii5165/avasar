import { expect, test, type Page } from "@playwright/test";

const ROUTES = ["/app", "/app/discover", "/app/applications", "/app/saved", "/app/profile", "/app/insights", "/app/notifications", "/app/settings", "/app/help"];
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

for (const [label, viewport] of [["tablet", { width: 834, height: 1112 }], ["mobile", { width: 390, height: 844 }]] as const) {
  test.describe(label, () => {
    test.use({ viewport, hasTouch: label === "mobile" });

    test("every section fits without horizontal scrolling", async ({ page }) => {
      for (const path of ROUTES) {
        await page.goto(path);
        await expect(page.locator("main h1")).toBeVisible();
        expect(await overflow(page), `${path} overflows`).toBeLessThanOrEqual(0);
      }
    });

    test("menu drawer: opens with focus, shows active page, Escape closes and returns focus, closes on navigation", async ({ page }) => {
      await page.goto("/app/discover");
      await expect(page.locator('nav[aria-label="Candidate"]')).toBeHidden();
      const menu = page.getByRole("button", { name: "Open menu" });
      await menu.click();
      const drawer = page.getByRole("dialog", { name: "Menu" });
      await expect(drawer).toBeVisible();
      await expect(menu).toHaveAttribute("aria-expanded", "true");
      await expect(drawer.getByRole("button", { name: "Close menu" })).toBeFocused();
      await expect(drawer.locator('a[aria-current="page"]')).toHaveText("Opportunities");
      // Sections the bottom bar has no room for are reachable here.
      for (const name of ["Career insights", "Notifications", "Settings", "Help"]) await expect(drawer.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden();
      await expect(menu).toBeFocused();

      await menu.click();
      await drawer.getByRole("link", { name: "Settings" }).click();
      await page.waitForURL(/\/app\/settings/);
      await expect(drawer).toBeHidden();

      await menu.click();
      await drawer.getByRole("button", { name: "Close menu" }).click();
      await expect(drawer).toBeHidden();
    });

    test("bottom bar marks the current section", async ({ page }) => {
      await page.goto("/app/saved");
      await expect(page.getByRole("navigation", { name: "Candidate (mobile)" }).locator('a[aria-current="page"]')).toHaveText("Saved");
    });
  });
}
