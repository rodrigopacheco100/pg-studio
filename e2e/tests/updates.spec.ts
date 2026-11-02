import { expect, test } from "../support/test";

test("Help › Check for updates says when the app is up to date", async ({ studio }) => {
  await studio.chooseMenu("Help", "Check for updates…");

  await expect(studio.dialog("Check for updates")).toContainText("You're up to date");
});

test("Help › What's new lists the release history", async ({ studio }) => {
  await studio.chooseMenu("Help", "What's new…");

  const history = studio.dialog("Release history");
  await expect(history.getByRole("heading", { name: /^v0\.4\.0/ })).toBeVisible();
  await expect(history.getByRole("listitem").first()).toBeVisible();
  await studio.dismissDialog();
  await expect(history).toBeHidden();
});

test("a first run does not show a what's-new notice", async ({ studio }) => {
  await expect(studio.dialog("PG Studio was updated")).toBeHidden();
});

test("the update check on startup can be turned off in Settings", async ({ studio }) => {
  const settings = await studio.openSettings("General");
  const toggle = settings.getByRole("checkbox", { name: /Check for updates when the app starts/ });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();
});
