import { expect, type Page } from "@playwright/test";

/** Profile page helpers: forms open in modal dialogs from compact buttons. */

export async function openManageSkills(page: Page) {
  const panel = page.getByTestId("manage-skills");
  if (!(await panel.evaluate((d) => (d as HTMLDetailsElement).open))) await panel.locator("summary").click();
}

/** Opens a dialog from its trigger button, fills inputs by name, saves, and waits for the dialog to close. */
export async function saveInDialog(page: Page, trigger: string, dialogName: string, fields: Record<string, string>, submit: string) {
  if (trigger === "Edit my skills") await openManageSkills(page);
  await page.getByRole("button", { name: trigger, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: dialogName });
  await expect(dialog).toBeVisible();
  for (const [name, value] of Object.entries(fields)) await dialog.locator(`[name="${name}"]`).fill(value);
  await dialog.getByRole("button", { name: submit }).click();
  await expect(dialog).toBeHidden();
}

/** The current value of an input inside a dialog, read without saving (the dialog is cancelled). */
export async function dialogValue(page: Page, trigger: string, dialogName: string, name: string) {
  if (trigger === "Edit my skills") await openManageSkills(page);
  await page.getByRole("button", { name: trigger, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: dialogName });
  const value = await dialog.locator(`[name="${name}"]`).inputValue();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  return value;
}
