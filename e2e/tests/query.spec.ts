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

test("asks before a data-modifying CTE without WHERE and before ALTER ... DROP", async ({ studio }) => {
  const table = `scratch_${randomUUID().slice(0, 8)}`;
  await studio.newConnection({ name: "q" });
  await studio.connect("q");
  await studio.run(`create table ${table} (n int, extra int); insert into ${table} values (1, 1), (2, 2);`);
  const confirm = studio.dialog("Run destructive statements?");

  await studio.run(`with gone as (delete from ${table} returning n) select * from gone`);
  await expect(confirm).toContainText("DELETE without WHERE");
  await confirm.getByRole("button", { name: "Cancel" }).click();

  await studio.run(`alter table ${table} drop column extra`);
  await expect(confirm).toContainText("ALTER ... DROP");
  await confirm.getByRole("button", { name: "Cancel" }).click();

  await studio.run(`alter table ${table} alter column extra drop not null`);
  await expect(confirm).toBeHidden();
});

test("a backslash-escaped quote in an E'...' string does not split the statement", async ({ studio }) => {
  await studio.newConnection({ name: "q" });
  await studio.connect("q");

  // Split at the `;` inside the string, the tail would look like `delete from users` and ask for confirmation.
  await studio.run(String.raw`select E'it\'s; delete from users' as v`);
  await expect(studio.dialog("Run destructive statements?")).toBeHidden();
  await expect(studio.cells.filter({ hasText: "it's; delete from users" })).toBeVisible();
});

test("Stop cancels a running query and the connection stays usable", async ({ studio }) => {
  await studio.newConnection({ name: "q" });
  await studio.connect("q");

  await studio.run("select pg_sleep(60)");
  await studio.page.getByRole("button", { name: "Stop" }).click();
  await expect(studio.page.getByText(/canceling statement due to user request/)).toBeVisible();
  await expect(studio.page.getByRole("button", { name: "Run" })).toBeVisible();

  await studio.run("select 1 as still_here");
  await expect(studio.page.getByRole("columnheader", { name: "still_here" })).toBeVisible();
});

test("a foreign-key cell opens the row it references, and that can go to a new tab", async ({ studio }) => {
  await studio.newConnection({ name: "q" });
  await studio.connect("q");
  await studio.run("select id, user_id from orders where id = 1");

  const cell = studio.cells.filter({ hasText: /^2$/ }).last();
  await cell.getByRole("button", { name: /referenced row/ }).click();

  const dialog = studio.page.getByRole("dialog");
  await expect(dialog).toContainText("public.users");
  await expect(dialog.getByRole("cell", { name: "user2@example.com" })).toBeVisible();

  await dialog.getByRole("button", { name: "Open in new tab" }).click();
  await expect(studio.page.getByRole("dialog")).toHaveCount(0);
  await expect(studio.cells.filter({ hasText: "user2@example.com" })).toBeVisible();
  await expect(studio.page.getByTitle("users", { exact: true })).toBeVisible();
});

test("a column in several foreign keys asks which one to follow, and a composite key uses all its columns", async ({ studio }) => {
  const id = randomUUID().slice(0, 8);
  await studio.newConnection({ name: "q" });
  await studio.connect("q");
  await studio.run(
    `create table p_${id} (a int, b int, label text, primary key (a, b));
     create table q_${id} (a int primary key, note text);
     create table c_${id} (a int, b int, foreign key (a, b) references p_${id} (a, b), foreign key (a) references q_${id} (a));
     insert into p_${id} values (1, 1, 'first'), (1, 2, 'second');
     insert into q_${id} values (1, 'only-q');
     insert into c_${id} values (1, 2);`,
  );
  await studio.run(`select a, b from c_${id}`);

  await studio.cells.filter({ hasText: /^1$/ }).getByRole("button", { name: /referenced row/ }).click();
  await studio.page.getByRole("menuitem", { name: new RegExp(`p_${id}`) }).click();

  const dialog = studio.page.getByRole("dialog");
  await expect(dialog.getByRole("cell", { name: "second" })).toBeVisible();
  await expect(dialog.getByRole("cell", { name: "first" })).toHaveCount(0);
});

test("following a foreign key inside the dialog reuses it, and Back returns", async ({ studio }) => {
  const id = randomUUID().slice(0, 8);
  await studio.newConnection({ name: "q" });
  await studio.connect("q");
  await studio.run(
    `create table r_${id} (id int primary key, root_name text);
     create table m_${id} (id int primary key, r int references r_${id} (id), mid_name text);
     create table l_${id} (m int references m_${id} (id));
     insert into r_${id} values (7, 'the-root');
     insert into m_${id} values (5, 7, 'the-mid');
     insert into l_${id} values (5);`,
  );
  await studio.run(`select m from l_${id}`);

  await studio.cells.filter({ hasText: /^5$/ }).getByRole("button", { name: /referenced row/ }).click();
  const dialog = studio.page.getByRole("dialog");
  await expect(dialog.getByRole("cell", { name: "the-mid" })).toBeVisible();

  await dialog.getByRole("cell").filter({ hasText: /^7$/ }).getByRole("button", { name: /referenced row/ }).click();
  await expect(studio.page.getByRole("dialog")).toHaveCount(1);
  await expect(dialog.getByRole("cell", { name: "the-root" })).toBeVisible();

  await dialog.getByRole("button", { name: "Back" }).click();
  await expect(dialog.getByRole("cell", { name: "the-mid" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Back" })).toBeDisabled();

  // The mouse's forward / back buttons (3 and 4) do the same.
  const press = (button: number) => studio.page.evaluate((b) => window.dispatchEvent(new MouseEvent("mouseup", { button: b })), button);
  await press(4);
  await expect(dialog.getByRole("cell", { name: "the-root" })).toBeVisible();
  await press(3);
  await expect(dialog.getByRole("cell", { name: "the-mid" })).toBeVisible();

  // Forward button: enabled after going back, disabled at the last step.
  await expect(dialog.getByRole("button", { name: "Forward" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Forward" }).click();
  await expect(dialog.getByRole("cell", { name: "the-root" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Forward" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Back" })).toBeEnabled();
});

test("following a key after going back drops the steps that were ahead", async ({ studio }) => {
  const id = randomUUID().slice(0, 8);
  await studio.newConnection({ name: "q" });
  await studio.connect("q");
  await studio.run(
    `create table a_${id} (id int primary key, a_name text);
     create table b_${id} (id int primary key, a int references a_${id} (id), b_name text);
     create table c_${id} (id int primary key, a int references a_${id} (id), c_name text);
     create table t_${id} (b int references b_${id} (id), c int references c_${id} (id));
     insert into a_${id} values (1, 'the-a');
     insert into b_${id} values (2, 1, 'the-b');
     insert into c_${id} values (3, 1, 'the-c');
     insert into t_${id} values (2, 3);`,
  );
  await studio.run(`select b, c from t_${id}`);

  await studio.cells.filter({ hasText: /^2$/ }).getByRole("button", { name: /referenced row/ }).click();
  const dialog = studio.page.getByRole("dialog");
  await dialog.getByRole("cell").filter({ hasText: /^1$/ }).getByRole("button", { name: /referenced row/ }).click();
  await expect(dialog.getByRole("cell", { name: "the-a" })).toBeVisible();

  await dialog.getByRole("button", { name: "Back" }).click();
  await expect(dialog.getByRole("button", { name: "Forward" })).toBeEnabled();
  // Following the same key again from here replaces the step ahead: Forward has nothing left.
  await dialog.getByRole("cell").filter({ hasText: /^1$/ }).getByRole("button", { name: /referenced row/ }).click();
  await expect(dialog.getByRole("cell", { name: "the-a" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Forward" })).toBeDisabled();
});
