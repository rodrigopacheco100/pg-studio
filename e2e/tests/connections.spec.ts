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

test("Duplicate opens the form filled with a copy, which is saved as a new connection", async ({ studio }) => {
  await studio.newConnection({ name: "orig", environment: "Production" });
  await studio.connectionRow("orig").click({ button: "right" });
  await studio.page.getByRole("menuitem", { name: "Duplicate…" }).click();

  const form = studio.dialog("PostgreSQL connection");
  await expect(form.getByLabel("Name", { exact: true })).toHaveValue("orig (copy)");
  await expect(form.getByLabel("Host", { exact: true })).toHaveValue("postgres");
  await expect(form.getByLabel("Database", { exact: true })).toHaveValue("shop");
  await expect(form.getByLabel("Environment")).toContainText("Production");
  await form.getByLabel("Name", { exact: true }).fill("the copy");
  await form.getByRole("tab", { name: "Security" }).click();
  await expect(form.getByLabel("User", { exact: true })).toHaveValue("e2e");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toBeHidden();
  await expect(studio.connectionRow("orig")).toBeVisible(); // the original stays
  await expect(studio.connectionRow("the copy")).toBeVisible();

  await studio.connect("the copy");
  await studio.table("users").click();
  await expect(studio.cells.first()).toBeVisible();
});

test("a copy inherits the stored password of the original", async ({ studio }) => {
  await studio.newConnection({ name: "keeper", savePassword: true }, () => studio.createMasterPassword("master-1"));
  await studio.connectionRow("keeper").hover();
  await studio.connectionRow("keeper").getByTitle("Duplicate").click();

  const form = studio.dialog("PostgreSQL connection");
  await form.getByLabel("Name", { exact: true }).fill("keeper 2");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toBeHidden();

  await studio.clickConnection("keeper 2"); // no password prompt: it was copied, not typed again
  await expect(studio.sidebar.getByText("Tables", { exact: true })).toBeVisible();
  await studio.table("orders").click();
  await expect(studio.cells.first()).toBeVisible();
});

test("editing the open connection connects again with the new settings", async ({ studio }) => {
  await studio.newConnection({ name: "live" });
  await studio.connect("live");
  await expect(studio.table("users")).toBeVisible();

  const edit = async (change: (form: ReturnType<typeof studio.dialog>) => Promise<void>) => {
    await studio.connectionRow("live").click({ button: "right" });
    await studio.page.getByRole("menuitem", { name: "Edit…" }).click();
    const form = studio.dialog("PostgreSQL connection");
    await change(form);
    await form.getByRole("button", { name: "Save" }).click();
    await expect(form).toBeHidden();
  };

  // A new name changes nothing the connection depends on: no reconnect, so no password to type again.
  await edit((form) => form.getByLabel("Name", { exact: true }).fill("live renamed"));
  await expect(studio.dialog("live renamed")).toBeHidden();
  await expect(studio.table("users")).toBeVisible();

  // Another database: connects again (asking for the password, as this connection does not keep it).
  await edit((form) => form.getByLabel("Database", { exact: true }).fill("postgres"));
  await studio.answerPrompt("live renamed", "e2e-secret");
  await expect(studio.page.getByText("(postgres)").first()).toBeVisible();
  await expect(studio.table("users")).toBeHidden(); // the `postgres` database has no such table
});
