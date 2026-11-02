import { randomUUID } from "node:crypto";
import { expect, test } from "../support/test";

test("runs a query and shows its rows", async ({ studio }) => {
  await studio.newConnection({ name: "q" });
  await studio.connect("q");

  await studio.run("select count(*) as total from users");
  await expect(studio.page.getByRole("columnheader", { name: "total" })).toBeVisible();
  await expect(studio.cells.filter({ hasText: /^30$/ })).toBeVisible();
});

test("shows the server's message when a statement fails", async ({ studio }) => {
  await studio.newConnection({ name: "q" });
  await studio.connect("q");

  await studio.run("select * from table_that_does_not_exist");
  await expect(studio.page.getByText(/relation "table_that_does_not_exist" does not exist/)).toBeVisible();
});

test("asks before a DELETE without WHERE and only runs it once confirmed", async ({ studio }) => {
  const table = `scratch_${randomUUID().slice(0, 8)}`;
  await studio.newConnection({ name: "q" });
  await studio.connect("q");
  await studio.run(`create table ${table} (n int); insert into ${table} values (1), (2);`);

  await studio.run(`delete from ${table}`);
  const confirm = studio.dialog("Run destructive statements?");
  await expect(confirm).toContainText("DELETE without WHERE");
  await confirm.getByRole("button", { name: "Cancel" }).click();

  await studio.run(`select count(*) as remaining from ${table}`);
  await expect(studio.cells.filter({ hasText: /^2$/ })).toBeVisible();

  await studio.run(`delete from ${table}`);
  await studio.dialog("Run destructive statements?").getByRole("button", { name: "Run" }).click();
  await studio.run(`select count(*) as remaining from ${table}`);
  await expect(studio.cells.filter({ hasText: /^0$/ })).toBeVisible();
});

test("a DELETE with WHERE runs without asking", async ({ studio }) => {
  const table = `scratch_${randomUUID().slice(0, 8)}`;
  await studio.newConnection({ name: "q" });
  await studio.connect("q");
  await studio.run(`create table ${table} (n int); insert into ${table} values (1), (2);`);

  await studio.run(`delete from ${table} where n = 1`);
  await expect(studio.dialog("Run destructive statements?")).toBeHidden();
  await studio.run(`select count(*) as remaining from ${table}`);
  await expect(studio.cells.filter({ hasText: /^1$/ })).toBeVisible();
});
