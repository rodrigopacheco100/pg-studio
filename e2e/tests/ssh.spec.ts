import { SSH } from "../support/studio";
import { expect, test } from "../support/test";

test("connects through the SSH server with a password", async ({ studio }) => {
  await studio.newConnection({ name: "via-password", ssh: { auth: "password" } });
  await studio.connect("via-password", { sshSecret: SSH.password });

  await studio.table("users").click();
  await expect(studio.cells.filter({ hasText: "alice@example.com" })).toBeVisible();
});

test("connects through the SSH server with a private key", async ({ studio }) => {
  await studio.newConnection({ name: "via-key", ssh: { auth: "key", keyPath: SSH.plainKey } });
  await studio.connect("via-key", { sshSecret: "" });

  await studio.table("orders").click();
  await expect(studio.cells.first()).toBeVisible();
});

test("connects with a passphrase-protected key", async ({ studio }) => {
  await studio.newConnection({ name: "via-protected", ssh: { auth: "key", keyPath: SSH.protectedKey } });
  await studio.connect("via-protected", { sshSecret: SSH.passphrase });

  await expect(studio.table("users")).toBeVisible();
});

test("a wrong SSH password is reported", async ({ studio }) => {
  await studio.newConnection({ name: "via-wrong", ssh: { auth: "password" } });
  await studio.clickConnection("via-wrong");
  await studio.answerPrompt("via-wrong", "e2e-secret");
  await expect(studio.dialog("via-wrong")).toContainText("SSH password");
  await studio.answerPrompt("via-wrong", "wrong");

  await expect(studio.dialog("Error")).toContainText("SSH server rejected the credentials");
});

test("the trusted SSH server is listed in Settings and can be forgotten", async ({ studio }) => {
  await studio.newConnection({ name: "via-key", ssh: { auth: "key" } });
  await studio.connect("via-key", { sshSecret: "" });

  const settings = await studio.openSettings("Security");
  await expect(settings.getByText(`${SSH.host}:${SSH.port}`)).toBeVisible();
  await expect(settings.getByText(/^SHA256:/)).toBeVisible();

  await settings.getByRole("button", { name: "Forget" }).click();
  await studio.dialog("Forget SSH server").getByRole("button", { name: "Forget" }).click();
  await expect(settings.getByText(/None yet/)).toBeVisible();
});
