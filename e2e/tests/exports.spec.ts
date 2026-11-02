import { randomUUID } from "node:crypto";
import { expect, test } from "../support/test";

const tmp = (extension: string) => `/tmp/export-${randomUUID()}.${extension}`;

test("exports every row of a query, not just the page, and shows the result in a floating window", async ({ studio }) => {
  const file = tmp("csv");
  await studio.newConnection({ name: "x" });
  await studio.connect("x");
  await studio.run("select n from generate_series(1, 250) as n");
  await expect(studio.page.getByText("250 records total")).toBeVisible();

  await studio.answerSaveDialog(file);
  await studio.exportAs("CSV");

  const window = studio.exportWindow("Query results");
  await expect(window).toContainText("Done");
  await expect(window.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  await expect(window).toContainText("250 rows");
  await expect(window).toContainText(file);

  const lines = (await studio.readBackendFile(file)).trimEnd().split("\n");
  expect(lines).toHaveLength(251); // header + all rows, though the page shows 100
  expect(lines.slice(0, 3)).toEqual(["n", "1", "2"]);
});

test("an export follows the sort and filters on screen", async ({ studio }) => {
  const file = tmp("json");
  await studio.newConnection({ name: "x" });
  await studio.connect("x");
  await studio.run("select n from generate_series(1, 250) as n");
  const sort = studio.page.getByRole("button", { name: "Sort by n" });
  await sort.click();
  await sort.click();
  await studio.openFilters();
  await studio.setFilter(0, { op: "≥", value: "246" });
  await studio.search();
  await expect(studio.page.getByText("5 records total")).toBeVisible();

  await studio.answerSaveDialog(file);
  await studio.exportAs("JSON");
  await expect(studio.exportWindow("Query results")).toContainText("Done");
  expect(JSON.parse(await studio.readBackendFile(file))).toEqual(["250", "249", "248", "247", "246"].map((n) => ({ n })));
});

test("exports a whole table as INSERT statements, honoring the filters, one window per export", async ({ studio }) => {
  const table = `scratch_${randomUUID().slice(0, 8)}`;
  const all = tmp("sql");
  const some = tmp("sql");
  await studio.newConnection({ name: "x" });
  await studio.connect("x");
  await studio.run(`create table ${table} as select n, 'row ' || n as label from generate_series(1, 2500) as n`);
  await studio.sidebar.getByTitle("Refresh").click();
  await studio.table(table).click();
  await expect(studio.page.getByText("2,500 records total")).toBeVisible();

  await studio.answerSaveDialog(all);
  await studio.exportAs("SQL INSERT");
  await expect(studio.exportWindow(`public.${table}`)).toContainText("Done");
  const text = await studio.readBackendFile(all);
  expect(text).toContain(`INSERT INTO "public"."${table}" ("n", "label") VALUES`);
  expect(text.match(/^ {2}\(/gm)).toHaveLength(2500); // the whole table: 3 pages of 1000 rows were read
  expect(text.match(/^INSERT INTO/gm)).toHaveLength(5); // in statements of 500 rows

  await studio.openFilters();
  await studio.setFilter(0, { column: "label", op: "starts with", value: "row 25" });
  await studio.search();
  await expect(studio.page.getByText("12 records total")).toBeVisible(); // 25, 250 … 259, 2500 -> 25, 250-259 (10), 2500 = 12
  await studio.answerSaveDialog(some);
  await studio.exportAs("SQL INSERT");

  await expect(studio.page.getByRole("dialog", { name: `Export public.${table}` })).toHaveCount(2); // a window each
  await expect.poll(async () => (await studio.readBackendFile(some).catch(() => "")).match(/^ {2}\(/gm)?.length).toBe(12);
});

test("a window can be minimized, and closed once the export ended", async ({ studio }) => {
  await studio.newConnection({ name: "x" });
  await studio.connect("x");
  await studio.run("select 1 as one");
  await studio.answerSaveDialog(tmp("csv"));
  await studio.exportAs("CSV");

  const window = studio.exportWindow("Query results");
  await expect(window).toContainText("Done");
  await expect(window.getByText("1 row")).toBeVisible();

  await window.getByRole("button", { name: "Minimize" }).click();
  await expect(window.getByText("1 row")).toBeHidden(); // the details fold away…
  await expect(window.getByRole("progressbar")).toBeVisible(); // …the title and the bar stay
  await window.getByRole("button", { name: "Expand" }).click();
  await expect(window.getByText("1 row")).toBeVisible();

  await window.getByRole("button", { name: "Close" }).click();
  await expect(window).toBeHidden();
});

test("a running export shows its progress and can be cancelled, but not closed", async ({ studio }) => {
  const file = tmp("csv");
  const view = `slow_${randomUUID().slice(0, 8)}`;
  await studio.newConnection({ name: "x" });
  await studio.connect("x");
  // Reading this view takes ~10 s (2 ms a row). The function is declared immutable, though it sleeps, so that
  // counting the rows (which does not need the column) skips it: the total is known at once and the progress can be watched.
  await studio.run(
    `create function ${view}_slow(n int) returns int language plpgsql immutable as $$ begin perform pg_sleep(0.002); return n; end $$; ` +
      `create view ${view} as select n, ${view}_slow(n) as slow from generate_series(1, 5000) as n`,
  );
  await studio.sidebar.getByTitle("Refresh").click();
  await studio.table(view).click();
  await expect(studio.cells.first()).toBeVisible();

  await studio.answerSaveDialog(file);
  await studio.exportAs("CSV");

  const window = studio.exportWindow(`public.${view}`);
  await expect(window).toContainText("Exporting");
  await expect(window.getByRole("button", { name: "Close" })).toBeDisabled();
  const bar = window.getByRole("progressbar");
  await expect.poll(async () => Number(await bar.getAttribute("aria-valuenow"))).toBeGreaterThan(0);
  expect(Number(await bar.getAttribute("aria-valuenow"))).toBeLessThan(100);

  await window.getByRole("button", { name: "Cancel" }).click();
  await expect(window).toContainText("Cancelled");
  await expect(window.getByRole("button", { name: "Close" })).toBeEnabled();
  await expect(window.getByRole("button", { name: "Cancel" })).toBeHidden();
  await expect(studio.readBackendFile(file)).rejects.toThrow(); // no half-written file is left behind
  await expect(studio.readBackendFile(`${file}.part`)).rejects.toThrow();
});

test("an export that cannot be written fails with the reason", async ({ studio }) => {
  await studio.newConnection({ name: "x" });
  await studio.connect("x");
  await studio.run("select 1 as one");
  await studio.answerSaveDialog("/no-such-directory/out.csv");
  await studio.exportAs("CSV");

  const window = studio.exportWindow("Query results");
  await expect(window).toContainText("Failed");
  await expect(window).toContainText("/no-such-directory/out.csv.part");
  await expect(window.getByRole("button", { name: "Close" })).toBeEnabled();
});

test("the Exports tab keeps the history of what was exported, and can clear it", async ({ studio }) => {
  const done = tmp("csv");
  await studio.newConnection({ name: "x" });
  await studio.connect("x");
  await studio.run("select n from generate_series(1, 30) as n");
  await studio.answerSaveDialog(done);
  await studio.exportAs("CSV");
  await expect(studio.exportWindow("Query results")).toContainText("Done");
  await studio.exportWindow("Query results").getByRole("button", { name: "Close" }).click();

  await studio.page.getByRole("tab", { name: "Exports" }).click();
  const entry = studio.page.locator("[data-export]");
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText("Query results → CSV");
  await expect(entry).toContainText("Done");
  await expect(entry).toContainText("30 rows");
  await expect(entry).toContainText(done);

  await studio.page.getByRole("button", { name: "Clear finished" }).click();
  await expect(entry).toHaveCount(0);
  await expect(studio.page.getByText("No exports yet")).toBeVisible();
});

test("a query's results offer no INSERT export", async ({ studio }) => {
  await studio.newConnection({ name: "x" });
  await studio.connect("x");
  await studio.run("select 1 as one");
  await studio.cells.first().click({ button: "right" });
  await studio.page.getByRole("menuitem", { name: "Export all rows" }).click();
  await expect(studio.page.getByRole("menuitem", { name: "CSV", exact: true })).toBeVisible();
  await expect(studio.page.getByRole("menuitem", { name: "SQL INSERT" })).toBeHidden();
});
