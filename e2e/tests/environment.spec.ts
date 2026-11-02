import { expect, test } from "../support/test";

test("a connection tagged as production is marked in the sidebar and by a band while connected", async ({ studio }) => {
  await studio.newConnection({ name: "live", environment: "Production" });
  await studio.newConnection({ name: "sandbox" });

  await expect(studio.connectionRow("live").getByText("prod", { exact: true })).toBeVisible();
  await expect(studio.connectionRow("sandbox").getByText(/^(dev|staging|prod)$/)).toHaveCount(0);

  const band = studio.page.getByText(/^Production · live/);
  await expect(band).toBeHidden();
  await studio.connect("live");
  await expect(band).toBeVisible();
  await expect(band).toContainText("(shop)");
});

test("the band is gone once disconnected and for connections without an environment", async ({ studio }) => {
  await studio.newConnection({ name: "staged", environment: "Staging" });
  await studio.connect("staged");
  await expect(studio.page.getByText(/^Staging · staged/)).toBeVisible();

  await studio.clickConnection("staged"); // clicking the active connection disconnects
  await expect(studio.page.getByText(/^Staging · staged/)).toBeHidden();
});

test("the environment survives editing the connection", async ({ studio }) => {
  await studio.newConnection({ name: "editable", environment: "Development" });
  await studio.connectionRow("editable").hover();
  await studio.connectionRow("editable").getByTitle("Edit").click();

  const dialog = studio.dialog("PostgreSQL connection");
  await expect(dialog.getByLabel("Environment")).toHaveText("Development");
  await studio.choose(dialog.getByLabel("Environment"), "Production");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(studio.connectionRow("editable").getByText("prod", { exact: true })).toBeVisible();
});
