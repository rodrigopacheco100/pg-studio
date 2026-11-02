import { expect, test } from "../support/test";

test("connects asking for the password, then browses a table", async ({ studio }) => {
  await studio.newConnection({ name: "plain" });
  await studio.connect("plain");

  await studio.table("users").click();
  await expect(studio.cells.filter({ hasText: "alice@example.com" })).toBeVisible();
});

test("a saved password is kept behind a master password and reused", async ({ studio }) => {
  await studio.newConnection({ name: "saved", savePassword: true }, () => studio.createMasterPassword("master-1"));

  await studio.clickConnection("saved"); // no prompt: the vault is unlocked and holds the password
  await expect(studio.sidebar.getByText("Tables", { exact: true })).toBeVisible();
  await studio.table("orders").click();
  await expect(studio.cells.first()).toBeVisible();
});

test("a master password that is typed twice differently is rejected inside the dialog", async ({ studio }) => {
  await studio.sidebar.getByTitle("New connection").click();
  const form = studio.dialog("PostgreSQL connection");
  await form.getByLabel("Name", { exact: true }).fill("mismatch");
  await form.getByRole("tab", { name: "Security" }).click();
  await form.getByLabel("User", { exact: true }).fill("e2e");
  await form.getByLabel("Password", { exact: true }).fill("e2e-secret");
  await form.getByRole("checkbox", { name: /Save password/ }).setChecked(true);
  await form.getByRole("button", { name: "Save" }).click();

  const prompt = studio.dialog("Create master password");
  await prompt.locator("input").fill("first");
  await prompt.getByRole("button", { name: "OK" }).click();
  await expect(prompt.getByText("Repeat the master password")).toBeVisible();
  await prompt.locator("input").fill("second");
  await prompt.getByRole("button", { name: "OK" }).click();

  await expect(prompt.getByText("The passwords do not match")).toBeVisible();
  await prompt.locator("input").fill("first");
  await prompt.getByRole("button", { name: "OK" }).click();
  await expect(prompt).toBeHidden();
  await expect(studio.connectionRow("mismatch")).toBeVisible();
});

test("a wrong database password is reported", async ({ studio }) => {
  await studio.newConnection({ name: "bad" });
  await studio.clickConnection("bad");
  await studio.answerPrompt("bad", "not-the-password");

  await expect(studio.dialog("Error")).toContainText("password authentication failed");
  await expect(studio.sidebar.getByText("Tables", { exact: true })).toBeHidden();
});

test("the password toggle reveals what was typed", async ({ studio }) => {
  await studio.sidebar.getByTitle("New connection").click();
  const form = studio.dialog("PostgreSQL connection");
  await form.getByRole("tab", { name: "Security" }).click();
  const password = form.getByLabel("Password", { exact: true });
  await password.fill("hunter2");
  await expect(password).toHaveAttribute("type", "password");
  await form.getByRole("button", { name: "Show password" }).click();
  await expect(password).toHaveAttribute("type", "text");
});
