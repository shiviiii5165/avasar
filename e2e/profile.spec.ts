import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { OUT } from "../playwright.config";

/**
 * Profile page as the development student (no AI Tathastu import: Avsar-only records). AI Tathastu-imported
 * education and experience are covered by profile-import.spec.ts against the mock provider.
 * Every record this file adds is removed again at the end.
 */
test.describe.configure({ mode: "serial" });

const SHOTS = path.join(OUT, "screens", "profile");
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const tooWide = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("main *")]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && ![...el.children].some((c) => c.getBoundingClientRect().right > window.innerWidth + 1))
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.getAttribute("class") ?? "").slice(0, 60)} "${(el.textContent ?? "").slice(0, 40)}"`),
  );
/** Counts full page loads, so "updates without a reload" can be asserted. */
const countLoads = (page: Page) => {
  const n = { loads: 0 };
  page.on("load", () => n.loads++);
  return n;
};

test("sections are organised, forms are not shown inline, empty states are friendly", async ({ page }) => {
  await page.goto("/app/profile");
  const nav = page.getByRole("navigation", { name: "Profile sections" });
  for (const s of ["Skills", "Education", "Experience", "Projects", "Preferences", "Links", "Resume"]) await expect(nav.getByRole("link", { name: s })).toBeVisible();
  await expect(page.getByText("No education yet")).toBeVisible();
  await expect(page.getByText("No experience yet")).toBeVisible();
  // No add form is rendered inline any more: only compact buttons.
  await expect(page.getByRole("button", { name: "Add education" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add experience" })).toBeVisible();
  await expect(page.locator('main input[name="institution"]:visible')).toHaveCount(0);
  await expect(page.locator('main input[name="organization"]:visible')).toHaveCount(0);
});

test("add education: validation, save, in-place update, Avsar badge", async ({ page }) => {
  await page.goto("/app/profile");
  const loads = countLoads(page);
  const trigger = page.getByRole("button", { name: "Add education" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Add education" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused(); // focus moves into the dialog
  // Empty institution and level: the dialog stays open with field errors.
  await dialog.getByRole("button", { name: "Add education" }).click();
  await expect(dialog.getByRole("alert").first()).toBeVisible();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Institution").fill("Government Polytechnic Nagpur");
  await dialog.getByLabel("Level").selectOption("diploma");
  await dialog.getByLabel("Field of study").fill("Mechanical Engineering");
  await dialog.getByLabel("Start year").fill("2021");
  await dialog.getByLabel("Graduation year (expected is fine)").fill("2024");
  await dialog.getByRole("button", { name: "Add education" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: "Add education: saved" })).toBeVisible();
  const item = page.getByTestId("education-item").filter({ hasText: "Government Polytechnic Nagpur" });
  await expect(item).toContainText("Mechanical Engineering");
  await expect(item).toContainText("2021 – 2024");
  await expect(item).toContainText("Added in Avsar");
  expect(loads.loads).toBe(0); // updated in place, no full reload
});

test("cancel and Escape close without saving and return focus", async ({ page }) => {
  await page.goto("/app/profile");
  const trigger = page.getByRole("button", { name: "Add experience" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Add experience" });
  await dialog.getByLabel("Role").fill("Should not be saved");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(dialog.getByLabel("Role")).toHaveValue(""); // a fresh form every time
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("experience-item")).toHaveCount(0);
});

test("add, then edit, an experience", async ({ page }) => {
  await page.goto("/app/profile");
  await page.getByRole("button", { name: "Add experience" }).click();
  let dialog = page.getByRole("dialog", { name: "Add experience" });
  await dialog.getByLabel("Role").fill("Design Intern");
  await dialog.getByLabel("Organization").fill("Studio Kalam");
  await dialog.getByLabel("Start (month)").fill("2025-06");
  await dialog.getByLabel("End (month)").fill("2025-08");
  await dialog.getByLabel("What you did").fill("Designed onboarding screens.");
  await dialog.getByRole("button", { name: "Add experience" }).click();
  await expect(dialog).toBeHidden();
  const item = page.getByTestId("experience-item").filter({ hasText: "Studio Kalam" });
  await expect(item).toContainText("Design Intern");
  await expect(item).toContainText("Jun 2025 – Aug 2025");
  await expect(item).toContainText("3 mos");
  await expect(item).toContainText("Internship");

  await item.getByRole("button", { name: "Edit Design Intern" }).click();
  dialog = page.getByRole("dialog", { name: "Edit experience" });
  await expect(dialog.getByLabel("Organization")).toHaveValue("Studio Kalam"); // prefilled
  await dialog.getByLabel("Role").fill("UX Design Intern");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("experience-item").filter({ hasText: "Studio Kalam" })).toContainText("UX Design Intern");
});

for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["tablet", { width: 834, height: 1112 }], ["mobile", { width: 390, height: 844 }]] as const) {
  test(`${label}: no sideways scrolling; dialog fits the screen`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/app/profile");
    await expect(page.getByTestId("education-item").first()).toBeVisible();
    expect(await overflow(page), (await tooWide(page)).join("\n")).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS, `${label}-full.png`), fullPage: true });
    await page.locator("#experience").screenshot({ path: path.join(SHOTS, `${label}-experience.png`) });
    await page.getByRole("button", { name: "Add education" }).click();
    const dialog = page.getByRole("dialog", { name: "Add education" });
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    await expect(dialog).toHaveCSS("opacity", "1"); // fully opaque once the short opening animation ends
    await page.screenshot({ path: path.join(SHOTS, `${label}-dialog.png`), animations: "disabled" });
    await page.keyboard.press("Escape");
  });
}

test("remove the records this file added", async ({ page }) => {
  await page.goto("/app/profile");
  await page.getByRole("button", { name: "Remove Government Polytechnic Nagpur" }).click();
  await page.getByRole("button", { name: "Remove UX Design Intern" }).click();
  await expect(page.getByTestId("education-item")).toHaveCount(0);
  await expect(page.getByTestId("experience-item")).toHaveCount(0);
});
