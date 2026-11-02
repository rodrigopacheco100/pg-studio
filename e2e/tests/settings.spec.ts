import { expect, test } from "../support/test";

test("the theme is applied at once and survives a reload", async ({ studio, page }) => {
  const html = page.locator("html");
  await expect(html).toHaveClass(/dark/);

  const saved = page.waitForRequest((r) => r.url().endsWith("/ipc") && (r.postData() ?? "").includes('"set_settings"'));
  const settings = await studio.openSettings("Appearance");
  await settings.getByLabel("Theme").selectOption({ label: "Light" });
  await expect(html).not.toHaveClass(/dark/);
  await saved;

  await page.reload();
  await expect(html).not.toHaveClass(/dark/);
});

test("rows per page decides how many rows a table shows", async ({ studio, page }) => {
  await studio.newConnection({ name: "paged" });
  await studio.connect("paged");

  const saved = page.waitForRequest((r) => (r.postData() ?? "").includes('"pageSize":25'));
  const settings = await studio.openSettings("Query");
  await settings.getByLabel("Rows per page").selectOption({ label: "25 rows" });
  await saved;
  await studio.dismissDialog();

  await studio.table("users").click();
  await expect(page.locator("tbody tr")).toHaveCount(25);
});

test("destructive-statement confirmation can be turned off", async ({ studio, page }) => {
  await studio.newConnection({ name: "off" });
  await studio.connect("off");
  await studio.run("create table scratch_off (n int)");

  const saved = page.waitForRequest((r) => (r.postData() ?? "").includes('"confirmDestructive":false'));
  const settings = await studio.openSettings("Query");
  await settings.getByRole("checkbox", { name: /Confirm before DROP/ }).uncheck();
  await saved;
  await studio.dismissDialog();

  await studio.run("drop table scratch_off");
  await expect(studio.dialog("Run destructive statements?")).toBeHidden();
  await studio.run("select to_regclass('scratch_off') as found");
  await expect(studio.cells.filter({ hasText: /^NULL$/ })).toBeVisible();
});
