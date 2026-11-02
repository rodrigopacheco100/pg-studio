import { expect, test } from "../support/test";

test("a snippet expands at the start of a statement and Tab walks through its fields", async ({ studio }) => {
  await studio.newConnection({ name: "ed" });
  await studio.connect("ed");

  await studio.page.locator(".cm-content:visible").first().click();
  await studio.page.keyboard.press("Control+A");
  await studio.page.keyboard.press("Delete");
  await studio.page.keyboard.type("sel");
  const option = studio.page.locator(".cm-tooltip-autocomplete .cm-completionLabel", { hasText: /^sel$/ });
  await expect(option).toBeVisible();
  await studio.page.waitForTimeout(200); // CodeMirror ignores Enter for a moment after the popup opens
  await studio.page.keyboard.press("Enter");

  await expect(studio.page.locator(".cm-content:visible").first()).toContainText("WHERE");
  await studio.page.keyboard.type("id, name");
  await studio.page.keyboard.press("Tab");
  await studio.page.keyboard.type("users");
  await studio.page.keyboard.press("Tab");
  await studio.page.keyboard.type("id = 1");
  await studio.page.keyboard.press("Control+Enter");

  await expect(studio.cells.filter({ hasText: "Alice Example" })).toBeVisible();
});

test("suggests tables and their columns while typing", async ({ studio }) => {
  await studio.newConnection({ name: "ed" });
  await studio.connect("ed");

  await studio.page.locator(".cm-content:visible").first().click();
  await studio.page.keyboard.press("Control+A");
  await studio.page.keyboard.press("Delete");
  await studio.page.keyboard.type("select * from user");
  const popup = studio.page.locator(".cm-tooltip-autocomplete");
  await expect(popup.locator(".cm-completionLabel", { hasText: /^users$/ })).toBeVisible();
  await studio.page.keyboard.press("Enter");
  await studio.page.keyboard.type(" where ema");
  await expect(popup.locator(".cm-completionLabel", { hasText: /^email$/ })).toBeVisible();
});
