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

test("filters rows with a column, an operator and a value, and clears the filters", async ({ studio }) => {
  await studio.newConnection({ name: "g" });
  await studio.connect("g");
  await studio.run("select id, name from users order by id");
  await expect(studio.cells).toHaveCount(60);

  await studio.openFilters();
  await studio.setFilter(0, { column: "name", op: "contains", value: "ALICE" });
  await studio.search();
  await expect(studio.cells).toHaveCount(2);
  await expect(studio.cells.filter({ hasText: "Alice Example" })).toBeVisible();
  await expect(studio.page.getByText("1 record total")).toBeVisible();

  await studio.page.getByRole("button", { name: "Clear sort and filters" }).click();
  await expect(studio.cells).toHaveCount(60);
  await expect(studio.page.getByLabel("Filter value")).toHaveValue(""); // the bar starts over too
});

test("nothing is filtered until Search; Enter in the value searches too", async ({ studio }) => {
  await studio.newConnection({ name: "g" });
  await studio.connect("g");
  await studio.run("select id, name from users order by id");
  await studio.openFilters();

  await studio.setFilter(0, { column: "name", op: "contains", value: "alice" });
  await studio.page.waitForTimeout(600); // longer than any typing delay: still no search
  await expect(studio.cells).toHaveCount(60);

  await studio.page.getByLabel("Filter value").press("Enter");
  await expect(studio.cells).toHaveCount(2);

  await studio.setFilter(0, { value: "user 2" }); // edited, not searched
  await studio.page.waitForTimeout(600);
  await expect(studio.cells).toHaveCount(2);
  await expect(studio.cells.filter({ hasText: "Alice Example" })).toBeVisible();
  await studio.search();
  await expect(studio.cells).toHaveCount(22); // 'User 2', 'User 20' … 'User 29': 11 rows
});

test("the operators offered follow the type of the column", async ({ studio }) => {
  await studio.newConnection({ name: "g" });
  await studio.connect("g");
  await studio.run("select id, name from users order by id");
  await studio.openFilters();

  const operator = studio.page.getByLabel("Filter operator");
  await operator.click(); // id is a number: comparisons, no text matching
  await expect(studio.page.getByRole("option", { name: "≥" })).toBeVisible();
  await expect(studio.page.getByRole("option", { name: "contains", exact: true })).toBeHidden();
  await studio.page.keyboard.press("Escape");

  await studio.setFilter(0, { column: "name" }); // name is text
  await operator.click();
  await expect(studio.page.getByRole("option", { name: "starts with" })).toBeVisible();
  await studio.page.keyboard.press("Escape");
});

test("numbers compare by value, and a value that is not a number filters nothing", async ({ studio }) => {
  await studio.newConnection({ name: "g" });
  await studio.connect("g");
  await studio.run("select id from users order by id");
  await studio.openFilters();

  await studio.setFilter(0, { op: "≥", value: "abc" });
  await expect(studio.page.getByLabel("Filter value")).toHaveAttribute("aria-invalid", "true");
  await studio.search();
  await expect(studio.cells).toHaveCount(30);

  await studio.setFilter(0, { value: "9" }); // as text, "10" would sort before "9"
  await studio.search();
  await expect(studio.cells).toHaveCount(22); // 9 … 30
});

test("filters can be combined and checked for NULL", async ({ studio }) => {
  await studio.newConnection({ name: "g" });
  await studio.connect("g");
  await studio.run("select n, case when n % 2 = 0 then null else 'odd' end as kind from generate_series(1, 10) as n");
  await studio.openFilters();

  await studio.setFilter(0, { column: "kind", op: "is null" });
  await studio.page.getByRole("button", { name: "Add filter" }).click();
  await studio.setFilter(1, { column: "n", op: ">", value: "6" });
  await studio.search();
  await expect(studio.page.getByText("2 records total")).toBeVisible(); // 8 and 10

  await studio.page.getByRole("button", { name: "Remove filter" }).first().click();
  await studio.search();
  await expect(studio.page.getByText("4 records total")).toBeVisible(); // 7, 8, 9, 10
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

  await studio.openFilters();
  await studio.setFilter(0, { op: "≥", value: "246" });
  await studio.search();
  await expect(studio.page.getByText("5 records total")).toBeVisible();
  await expect(studio.cells).toHaveText(["250", "249", "248", "247", "246"]);
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

  await studio.openFilters();
  await studio.setFilter(0, { column: "label", op: "starts with", value: "ROW 25" });
  await studio.search();
  await expect(studio.page.getByText("2 records total")).toBeVisible(); // 'row 25', 'row 250'
  await expect(studio.cells.filter({ hasText: /^row 25/ })).toHaveCount(2);

  // A second filter, a numeric comparison, also on the server.
  await studio.setFilter(0, { value: "row 1" });
  await studio.page.getByRole("button", { name: "Add filter" }).click();
  await studio.setFilter(1, { column: "n", op: "<", value: "110" });
  await studio.search();
  await expect(studio.page.getByText("21 records total")).toBeVisible(); // 1, 10 … 19 and 100 … 109

  await studio.page.getByRole("button", { name: "Clear sort and filters" }).click();
  await expect(studio.page.getByText("250 records total")).toBeVisible();
});

test("a table can be filtered by date, as ISO text", async ({ studio }) => {
  const table = `scratch_${randomUUID().slice(0, 8)}`;
  await studio.newConnection({ name: "g" });
  await studio.connect("g");
  await studio.run(
    `create table ${table} as select d::timestamp as at from (values ('2023-12-31 23:00'), ('2024-03-15 10:30'), ('2024-07-01 08:00')) as v(d)`,
  );
  await studio.sidebar.getByTitle("Refresh").click();
  await studio.table(table).click();
  await expect(studio.page.getByText("3 records total")).toBeVisible();

  await studio.openFilters();
  await studio.setFilter(0, { op: "starts with", value: "2024" });
  await studio.search();
  await expect(studio.page.getByText("2 records total")).toBeVisible();
  await studio.setFilter(0, { op: "<", value: "2024-01-01" });
  await studio.search();
  await expect(studio.page.getByText("1 record total")).toBeVisible(); // 2023-12-31
});
