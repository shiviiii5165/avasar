import { expect, test, type Page } from "@playwright/test";

/**
 * Profile import through the LOCAL MOCK of AI Tathastu (scripts/mock-ait.mts), not the real provider.
 * Avsar's real OAuth, token verification and profile-sync code runs unchanged; only the provider is simulated.
 * Passing here does NOT verify the production AI Tathastu integration — that needs a manual sign-in on
 * avsar.aitathastu.com with a real AI Tathastu account.
 */
const MOCK = "http://localhost:3401";

async function mock(page: Page, path: string) {
  const res = await page.request.post(`${MOCK}${path}`);
  expect(res.ok()).toBe(true);
}

async function refreshFromProvider(page: Page) {
  await page.getByRole("link", { name: "Refresh from AI Tathastu" }).click();
  await page.waitForURL(/\/app\/profile/);
}

const ownSkills = (page: Page) => page.locator('ul[aria-label="Skills you added in Avsar"]');

test.describe.configure({ mode: "serial" });

test("mock provider: successful, partial and failed imports, reconnect, and Avsar edits are never overwritten", async ({ page }) => {
  await mock(page, "/__mock/reset");

  await test.step("sign in with the mock provider: full import", async () => {
    await page.goto("/sign-in");
    await page.getByRole("link", { name: "Continue with AI Tathastu" }).click();
    await expect(page.getByText("MOCK provider for local testing.")).toBeVisible();
    await page.locator("#approve").click();
    await page.waitForURL(/\/app\/discover/);
    await expect(page.getByText(/Profile imported from AI Tathastu/)).toBeVisible(); // compact status line
    await page.goto("/app/profile");
    await expect(page.getByText(/^Profile imported from AI Tathastu/)).toBeVisible();
    await expect(page.locator('ul[aria-label="Skills from AI Tathastu"]')).toContainText("React · advanced · verified");
    // Education and experience shared by AI Tathastu are imported with their details, marked as AI Tathastu-owned.
    const edu = page.getByTestId("education-item");
    await expect(edu).toHaveCount(1);
    await expect(edu).toContainText("College of Engineering Pune");
    await expect(edu).toContainText("B.Tech, Computer Science");
    await expect(edu).toContainText("2022 – 2026");
    await expect(edu).toContainText("From AI Tathastu");
    const exp = page.getByTestId("experience-item");
    await expect(exp).toHaveCount(1);
    await expect(exp).toContainText("Frontend Intern");
    await expect(exp).toContainText("Pixel Labs");
    await expect(exp).toContainText("Jun 2025 – Aug 2025");
    await expect(exp).toContainText("Built accessible UI components.");
    await expect(exp.getByRole("button", { name: /^Edit / })).toHaveCount(0); // read-only here
    // A second sync of the same profile doesn't duplicate anything.
    await refreshFromProvider(page);
    await expect(page.getByTestId("education-item")).toHaveCount(1);
    await expect(page.getByTestId("experience-item")).toHaveCount(1);
  });

  await test.step("intelligence-layer data reaches Career insights", async () => {
    await page.goto("/app/insights");
    const card = page.locator("section, div").filter({ has: page.getByRole("heading", { name: "From AI Tathastu" }) }).last();
    await expect(card).toContainText("Frontend Developer");
    await expect(card).toContainText("58 / 100");
    await expect(card).toContainText("Testing");
    await expect(card).toContainText("Accessibility · not yet proven");
    await page.goto("/app/profile");
  });

  await test.step("add a skill in Avsar", async () => {
    await page.getByTestId("manage-skills").locator("summary").click();
    await page.getByRole("button", { name: "Edit my skills" }).click();
    const dialog = page.getByRole("dialog", { name: "Skills you add in Avsar" });
    await dialog.getByLabel("Skills you want to add in Avsar (comma separated)").fill("Docker");
    await dialog.getByRole("button", { name: "Save my added skills" }).click();
    await expect(dialog).toBeHidden();
    await page.reload();
    await expect(ownSkills(page)).toContainText("Docker");
  });

  await test.step("partial import: only skills shared", async () => {
    await mock(page, "/__mock/share?sections=skills");
    await refreshFromProvider(page);
    await expect(page.getByText(/Some sections weren.t shared with Avsar/)).toBeVisible();
    await expect(page.locator('ul[aria-label="Skills from AI Tathastu"]')).toContainText("React");
    await expect(ownSkills(page)).toContainText("Docker");
  });

  await test.step("failed import: provider outage", async () => {
    await mock(page, "/__mock/fail-profile?on=1");
    await refreshFromProvider(page);
    await expect(page.getByText(/We couldn.t import your AI Tathastu profile/)).toBeVisible();
    await expect(ownSkills(page)).toContainText("Docker");
    await page.goto("/app/discover");
    await expect(page.getByText("Couldn't import your AI Tathastu profile. Matching uses what you added in Avsar.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Fix in profile" })).toBeVisible();
    await mock(page, "/__mock/fail-profile?on=0");
  });

  await test.step("reconnect after the student disconnected Avsar", async () => {
    await mock(page, "/__mock/share?sections=education,skills,projects,experience,achievements");
    await mock(page, "/__mock/disconnect");
    await page.goto("/app/profile");
    await refreshFromProvider(page);
    expect(page.url()).toContain("sync=consent_required");
    const reconnect = page.getByRole("link", { name: "Reconnect with AI Tathastu" });
    await expect(reconnect).toBeVisible();
    await reconnect.click();
    await page.locator("#approve").click();
    await page.waitForURL(/\/app\/profile\?synced=1/);
    await expect(page.getByText("Profile refreshed from AI Tathastu.")).toBeVisible();
    await expect(page.getByText(/^Profile imported from AI Tathastu/)).toBeVisible();
    await expect(ownSkills(page)).toContainText("Docker");
  });
});
