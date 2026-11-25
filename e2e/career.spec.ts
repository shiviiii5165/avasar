import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { OUT } from "../playwright.config";

/**
 * Career intelligence, end to end, as the development student. The test builds a small synthetic profile through
 * the real profile forms (career goal, listed skills, one project), checks the page, and restores the profile.
 */
test.describe.configure({ mode: "serial" });

const SHOTS = path.join(OUT, "screens", "career");
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
/** The innermost elements sticking out past the right edge, for a readable failure message. */
const tooWide = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("main *")]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && ![...el.children].some((c) => c.getBoundingClientRect().right > window.innerWidth + 1))
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.getAttribute("class") ?? "").slice(0, 60)} "${(el.textContent ?? "").slice(0, 40)}"`),
  );
const bubble = (page: Page, name: string) => page.locator(`[data-testid="skill-network"] g[role="button"][data-skill="${name}"]`);

async function saveField(page: Page, field: string, value: string, submit: string) {
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: submit }) });
  await form.locator(`input[name="${field}"]`).fill(value);
  await form.getByRole("button", { name: submit }).click();
  await expect(form.getByRole("status")).toBeVisible();
}

/** The persona's skills before this file ran (other specs add some); put back at the end. */
let originalSkills = "";

test("empty profile: friendly empty states instead of a blank graph", async ({ page }) => {
  await page.goto("/app/profile");
  originalSkills = await page.locator("form").filter({ has: page.getByRole("button", { name: "Save my added skills" }) }).locator('input[name="skills"]').inputValue();
  await saveField(page, "skills", "", "Save my added skills");
  await page.goto("/app/career");
  await expect(page.getByRole("heading", { level: 1, name: "Career intelligence" })).toBeVisible();
  await expect(page.getByTestId("skill-explorer-empty")).toBeVisible();
  await expect(page.getByText("You haven't set a career goal yet")).toBeVisible();
});

test("set up a Machine learning engineer profile", async ({ page }) => {
  await page.goto("/app/profile");
  await saveField(page, "preferredRoles", "Machine learning engineer", "Save roles");
  await saveField(page, "skills", "Python, Statistics, Communication, Excel", "Save my added skills");
  await page.getByText("Add a project", { exact: true }).click();
  // The profile's section forms reuse input ids (f-title, f-skills), so fields are found by name inside their form.
  const project = page.locator("form").filter({ has: page.getByRole("button", { name: "Add project" }) });
  await project.locator('input[name="title"]').fill("Sentiment classifier");
  await project.locator('input[name="skills"]').fill("Python, Machine Learning, NLP");
  await project.getByRole("button", { name: "Add project" }).click();
  await expect(page.getByText("Skills: Python, Machine Learning, NLP")).toBeVisible();
});

test.describe("with a profile", () => {
  test("shows the career goal, readable labels and no technical jargon", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/app/career");
    await expect(page.getByTestId("career-goal")).toHaveText("Machine learning engineer");
    await expect(page.getByTestId("skill-network").locator("svg")).toBeVisible();
    for (const name of ["Python", "Machine learning", "Statistics"]) await expect(bubble(page, name)).toBeVisible();
    await expect(bubble(page, "Python")).toHaveAttribute("aria-label", /Shown in project/);
    await expect(bubble(page, "Statistics")).toHaveAttribute("aria-label", /Added to profile/);
    const text = await page.locator("main").innerText();
    expect(text).not.toMatch(/Demonstrated|Declared, not yet evidenced|Inferred \(related skill\)|\d+% match/);
    await expect(page.getByTestId("goal-skills").getByText("Build next")).toBeVisible();
    await expect(page.getByTestId("next-steps")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("a bubble opens its details by click and by keyboard; Escape closes and returns focus", async ({ page }) => {
    await page.goto("/app/career");
    await bubble(page, "Python").click();
    const detail = page.getByTestId("skill-detail");
    await expect(detail).toBeVisible();
    await expect(detail.getByRole("heading", { name: "Python" })).toBeVisible();
    await expect(detail).toContainText("Shown in project");
    await expect(detail).toContainText("Sentiment classifier");
    await expect(detail).toContainText("Essential for Machine learning engineer");
    await expect(detail).toContainText("What you can do next");
    await expect(detail).toContainText("Used together with");
    // A linked skill opens from the details.
    await detail.getByRole("button", { name: /Machine learning/ }).click();
    await expect(detail.getByRole("heading", { name: "Machine learning" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(detail).toBeHidden();

    await bubble(page, "Statistics").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("skill-detail")).toContainText("Added to profile");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("skill-detail")).toBeHidden();
    await expect(bubble(page, "Statistics")).toBeFocused();
  });

  test("filters and the list view show the same skills as text", async ({ page }) => {
    await page.goto("/app/career");
    await page.getByRole("group", { name: "Filter skills by evidence" }).getByRole("button", { name: /Added to profile/ }).click();
    await expect(bubble(page, "Statistics")).toBeVisible();
    await expect(bubble(page, "Python")).toHaveCount(0);
    await page.getByRole("button", { name: "All", exact: false }).first().click();
    await page.getByRole("button", { name: "List" }).click();
    const list = page.getByTestId("skill-list");
    for (const name of ["Python", "Machine learning", "Statistics", "Communication"]) await expect(list.getByRole("button", { name: new RegExp(name) })).toBeVisible();
    await list.getByRole("button", { name: /Communication/ }).click();
    await expect(page.getByTestId("skill-detail")).toContainText("Communication");
  });

  test("recommendations: no duplicates, Save and Not for me work", async ({ page }) => {
    await page.goto("/app/career");
    const cards = page.getByTestId("recommendation");
    const n = await cards.count();
    test.skip(n === 0, "no open sample listings to recommend");
    const keys = await cards.evaluateAll((els) => els.map((el) => `${el.querySelector("h3")?.textContent}|${el.querySelector("h3 + p")?.textContent}`.toLowerCase()));
    expect(new Set(keys).size).toBe(keys.length);
    const first = cards.first();
    const title = (await first.locator("h3").innerText()).trim();
    await expect(first).toContainText("Why this fits you");

    const save = first.getByRole("button", { name: "Save" });
    await save.click();
    await expect(first.getByRole("button", { name: "Saved" })).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(cards.filter({ hasText: title }).getByRole("button", { name: "Saved" })).toBeVisible();
    await cards.filter({ hasText: title }).getByRole("button", { name: "Saved" }).click();
    await expect(cards.filter({ hasText: title }).getByRole("button", { name: "Save" })).toBeVisible();

    await cards.filter({ hasText: title }).getByRole("button", { name: `Not for me: hide ${title} from recommendations` }).click();
    await expect(page.getByTestId("recommendation").filter({ has: page.getByRole("heading", { name: title, exact: true }) })).toHaveCount(0);
    // Undo through Discover's "Hidden from recommendations", leaving the shared test profile as it was.
    await page.goto("/app/discover");
    await page.getByText(/^Hidden from recommendations/).click();
    await page.getByRole("button", { name: `Show ${title} in recommendations again` }).click();
    await expect(page.getByRole("button", { name: `Show ${title} in recommendations again` })).toHaveCount(0);
  });

  for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["tablet", { width: 834, height: 1112 }], ["mobile", { width: 390, height: 844 }]] as const) {
    test(`${label}: fits without sideways scrolling; bubbles stay tappable`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/app/career");
      await expect(page.getByTestId("skill-network").locator("svg")).toBeVisible();
      expect(await overflow(page), (await tooWide(page)).join("\n")).toBeLessThanOrEqual(0);
      const box = (await bubble(page, "Python").boundingBox())!;
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44); // comfortable touch target
      await page.screenshot({ path: path.join(SHOTS, `${label}-full.png`), fullPage: true });
      await bubble(page, "Python").click();
      await expect(page.getByTestId("skill-detail")).toBeInViewport();
      await page.getByTestId("skill-explorer").screenshot({ path: path.join(SHOTS, `${label}-skills-selected.png`) });
    });
  }

  test("restore the development profile", async ({ page }) => {
    await page.goto("/app/profile");
    await page.getByRole("button", { name: "Remove Sentiment classifier" }).click();
    await expect(page.getByText("Skills: Python, Machine Learning, NLP")).toHaveCount(0);
    await saveField(page, "skills", originalSkills, "Save my added skills");
    await saveField(page, "preferredRoles", "", "Save roles");
  });
});
