import { expect, test } from "../support/test";

test("organizes connections in a folder and keeps it after a reload", async ({ studio, page }) => {
  await studio.newConnection({ name: "alpha" });
  await studio.newConnection({ name: "beta" });

  await studio.sidebar.getByTitle("New folder").click();
  await studio.answerPrompt("New folder", "Team");
  const folderName = studio.sidebar.getByText("Team", { exact: true });
  await expect(folderName).toBeVisible();

  await studio.connectionRow("beta").dragTo(folderName);
  const folder = studio.sidebar.getByRole("listitem").filter({ hasText: "Team" });
  await expect(folder.getByText("beta")).toBeVisible();
  await expect(folder.getByText("alpha")).toHaveCount(0);

  await page.reload();
  const reloaded = studio.sidebar.getByRole("listitem").filter({ hasText: "Team" });
  await expect(reloaded.getByText("beta")).toBeVisible();
  await expect(studio.connectionRow("alpha")).toBeVisible();
});

test("reorders connections by dropping on the upper half of another one", async ({ studio, page }) => {
  await studio.newConnection({ name: "first" });
  await studio.newConnection({ name: "second" });
  const names = () => studio.sidebar.locator("li span.truncate:first-child").allTextContents();
  await expect.poll(names).toEqual(["first", "second"]);

  await studio.connectionRow("second").dragTo(studio.connectionRow("first"), { targetPosition: { x: 40, y: 3 } });
  await expect.poll(names).toEqual(["second", "first"]);

  await page.reload();
  await expect.poll(names).toEqual(["second", "first"]);
});

test("renames and deletes a folder, keeping its connections", async ({ studio }) => {
  await studio.newConnection({ name: "keeper" });
  await studio.sidebar.getByTitle("New folder").click();
  await studio.answerPrompt("New folder", "Old");
  await studio.connectionRow("keeper").dragTo(studio.sidebar.getByText("Old", { exact: true }));

  await studio.sidebar.getByText("Old", { exact: true }).click({ button: "right" });
  await studio.page.getByRole("menuitem", { name: "Rename…" }).click();
  await studio.answerPrompt("Rename folder", "New");
  await expect(studio.sidebar.getByText("New", { exact: true })).toBeVisible();

  await studio.sidebar.getByText("New", { exact: true }).click({ button: "right" });
  await studio.page.getByRole("menuitem", { name: "Delete" }).click();
  await studio.dialog("Delete folder").getByRole("button", { name: "Delete" }).click();
  await expect(studio.sidebar.getByText("New", { exact: true })).toHaveCount(0);
  await expect(studio.connectionRow("keeper")).toBeVisible();
});
