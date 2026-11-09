import { expect, test as setup } from "@playwright/test";

import { AUTH_STATE } from "../playwright.config";

/** Signs in once as the development candidate persona (local only) and saves the session for the other specs. */
setup("sign in as development candidate", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Candidate", exact: true }).click();
  await page.waitForURL(/\/app\/discover/);
  await expect(page.getByRole("heading", { level: 1, name: "Opportunities for you" })).toBeVisible();
  await page.context().storageState({ path: AUTH_STATE });
});
