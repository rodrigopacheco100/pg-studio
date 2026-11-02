import { randomUUID } from "node:crypto";
import { expect, test } from "../support/test";

test("sorts a column ascending, descending and back, numbers by value", async ({ studio }) => {
  await studio.newConnection({ name: "g" });
  await studio.connect("g");
  await studio.run("select id from users order by id");
  await expect(studio.cells.first()).toHaveText("1");

  const sort = studio.page.getByRole("button", { name: "Sort by id" });
  await sort.click(); // ascending
  await expect(studio.cells.first()).toHaveText("1");
  await sort.click(); // descending: 30 first (as text "9" would be)
  await expect(studio.cells.first()).toHaveText("30");
  await sort.click(); // off: back to the query's order
  await expect(studio.cells.first()).toHaveText("1");
});

test("filters rows by the text of a column and clears the filters", async ({ studio }) => {
  await studio.newConnection({ name: "g" });
  await studio.connect("g");
  await studio.run("select id, name from users order by id");
  await expect(studio.cells).toHaveCount(60);

  await studio.page.getByRole("button", { name: "Filter", exact: true }).click();
  await studio.page.getByLabel("Filter name").fill("ALICE");
  await expect(studio.cells).toHaveCount(2);
  await expect(studio.cells.filter({ hasText: "Alice Example" })).toBeVisible();
  await expect(studio.page.getByText("1 record total")).toBeVisible();

  await studio.page.getByRole("button", { name: "Clear sort and filters" }).click();
  await expect(studio.cells).toHaveCount(60);
});

// More rows than one page (100): sorting and filtering must cover all of them, not just the page on screen.
test("sorts and filters a query across every page", async ({ studio }) => {
  await studio.newConnection({ name: "g" });
  await studio.connect("g");
  await studio.run("select n from generate_series(1, 250) as n");
  await expect(studio.page.getByText("250 records total")).toBeVisible();

  const sort = studio.page.getByRole("button", { name: "Sort by n" });
  await sort.click();
  await sort.click();
  await expect(studio.cells.first()).toHaveText("250"); // 250 sits on page 3 unsorted

  await studio.page.getByRole("button", { name: "Filter", exact: true }).click();
  await studio.page.getByLabel("Filter n").fill("25");
  await expect(studio.page.getByText("4 records total")).toBeVisible(); // 25, 125, 225, 250
  await expect(studio.cells).toHaveText(["250", "225", "125", "25"]);
});

test("sorts and filters an opened table on the server, across every page", async ({ studio }) => {
  const table = `scratch_${randomUUID().slice(0, 8)}`;
  await studio.newConnection({ name: "g" });
  await studio.connect("g");
  await studio.run(`create table ${table} as select n, 'row ' || n as label from generate_series(1, 250) as n`);
  await studio.sidebar.getByTitle("Refresh").click();
  await studio.table(table).click();
  await expect(studio.page.getByText("250 records total")).toBeVisible();

  const sort = studio.page.getByRole("button", { name: "Sort by n" });
  await sort.click();
  await sort.click();
  await expect(studio.cells.first()).toHaveText("250");

  await studio.page.getByRole("button", { name: "Filter", exact: true }).click();
  await studio.page.getByLabel("Filter label").fill("ROW 25");
  await expect(studio.page.getByText("2 records total")).toBeVisible(); // 'row 25', 'row 250'
  await expect(studio.cells.filter({ hasText: /^row 25/ })).toHaveCount(2);

  await studio.page.getByRole("button", { name: "Clear sort and filters" }).click();
  await expect(studio.page.getByText("250 records total")).toBeVisible();
});

test("exports every row of a query, in the sorted and filtered order, not just the page", async ({ studio }) => {
  const file = `/tmp/export-${randomUUID()}`;
  await studio.newConnection({ name: "g" });
  await studio.connect("g");
  await studio.run("select n from generate_series(1, 250) as n");
  await expect(studio.page.getByText("250 records total")).toBeVisible();

  const exportAs = async (format: string) => {
    await studio.cells.first().click({ button: "right" });
    await studio.page.getByRole("menuitem", { name: "Export all rows" }).click();
    await studio.page.getByRole("menuitem", { name: format, exact: true }).click();
  };

  await studio.answerSaveDialog(`${file}.csv`);
  await exportAs("CSV");
  await expect(studio.page.getByText("250 row(s) exported as CSV")).toBeVisible();
  const lines = (await studio.readBackendFile(`${file}.csv`)).trimEnd().split("\n");
  expect(lines).toHaveLength(251); // header + all rows, though the page shows 100
  expect(lines.slice(0, 3)).toEqual(["n", "1", "2"]);

  const sort = studio.page.getByRole("button", { name: "Sort by n" });
  await sort.click();
  await sort.click();
  await studio.page.getByRole("button", { name: "Filter", exact: true }).click();
  await studio.page.getByLabel("Filter n").fill("25");
  await expect(studio.page.getByText("4 records total")).toBeVisible();

  await studio.answerSaveDialog(`${file}.json`);
  await exportAs("JSON");
  await expect(studio.page.getByText("4 row(s) exported as JSON")).toBeVisible();
  expect(JSON.parse(await studio.readBackendFile(`${file}.json`))).toEqual([{ n: "250" }, { n: "225" }, { n: "125" }, { n: "25" }]);
});

test("exports a whole table as INSERT statements, honoring the filters", async ({ studio }) => {
  const table = `scratch_${randomUUID().slice(0, 8)}`;
  const file = `/tmp/export-${randomUUID()}.sql`;
  await studio.newConnection({ name: "g" });
  await studio.connect("g");
  await studio.run(`create table ${table} as select n, 'row ' || n as label from generate_series(1, 250) as n`);
  await studio.sidebar.getByTitle("Refresh").click();
  await studio.table(table).click();
  await expect(studio.page.getByText("250 records total")).toBeVisible();

  const exportInsert = async () => {
    await studio.cells.first().click({ button: "right" });
    await studio.page.getByRole("menuitem", { name: "Export all rows" }).click();
    await studio.page.getByRole("menuitem", { name: "SQL INSERT" }).click();
  };

  await studio.answerSaveDialog(file);
  await exportInsert();
  await expect(studio.page.getByText("250 row(s) exported as SQL INSERT")).toBeVisible();
  const all = await studio.readBackendFile(file);
  expect(all).toContain(`INSERT INTO public.${table} (n, label) VALUES`);
  expect(all.match(/^ {2}\(/gm)).toHaveLength(250);

  await studio.page.getByRole("button", { name: "Filter", exact: true }).click();
  await studio.page.getByLabel("Filter label").fill("row 25");
  await expect(studio.page.getByText("2 records total")).toBeVisible();
  await exportInsert();
  await expect(studio.page.getByText("2 row(s) exported as SQL INSERT")).toBeVisible();
  expect((await studio.readBackendFile(file)).match(/^ {2}\(/gm)).toHaveLength(2);
});

test("a query's results offer no INSERT export", async ({ studio }) => {
  await studio.newConnection({ name: "g" });
  await studio.connect("g");
  await studio.run("select 1 as one");
  await studio.cells.first().click({ button: "right" });
  await studio.page.getByRole("menuitem", { name: "Export all rows" }).click();
  await expect(studio.page.getByRole("menuitem", { name: "CSV", exact: true })).toBeVisible();
  await expect(studio.page.getByRole("menuitem", { name: "SQL INSERT" })).toBeHidden();
});
