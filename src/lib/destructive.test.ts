import { expect, test } from "bun:test";
import { destructiveStatements } from "./destructive";

const reasons = (sql: string) => destructiveStatements(sql).map((d) => d.reason);

test("flags DROP and TRUNCATE", () => {
  expect(reasons("drop table users; truncate orders; drop schema if exists x cascade")).toEqual(["DROP", "TRUNCATE", "DROP"]);
});

test("DELETE and UPDATE need a WHERE", () => {
  expect(reasons("delete from users")).toEqual(["DELETE without WHERE"]);
  expect(reasons("update users set a = 1")).toEqual(["UPDATE without WHERE"]);
  expect(reasons("delete from users where id = 1; update users set a = 1 where id = 2")).toEqual([]);
});

test("a WHERE inside a subquery, string or comment does not count", () => {
  expect(reasons("delete from t using (select 1 where true) s")).toEqual(["DELETE without WHERE"]);
  expect(reasons("update t set a = 'where' -- where\n")).toEqual(["UPDATE without WHERE"]);
});

test("finds the verb after a WITH", () => {
  expect(reasons("with x as (select id from u where a) delete from t using x")).toEqual(["DELETE without WHERE"]);
  expect(reasons("with x as (select 1) delete from t where id in (select * from x)")).toEqual([]);
  expect(reasons("with x as (select 1) select * from x")).toEqual([]);
});

test("other statements are fine", () => {
  expect(reasons("select * from t; insert into t values (1); create table a (b int)")).toEqual([]);
  expect(reasons("select 'drop table x'; -- drop table y")).toEqual([]);
});

test("shortens the statement for display", () => {
  const [d] = destructiveStatements(`delete\n  from ${"a".repeat(100)}`);
  expect(d.sql.startsWith("delete from aaa")).toBe(true);
  expect(d.sql.endsWith("…")).toBe(true);
});

test("looks inside the body of a data-modifying CTE", () => {
  expect(reasons("with gone as (delete from t returning *) select * from gone")).toEqual(["DELETE without WHERE"]);
  expect(reasons("with gone as (delete from t where id = 1 returning *) select * from gone")).toEqual([]);
  expect(reasons("with u as (update t set a = 1) select 1")).toEqual(["UPDATE without WHERE"]);
  expect(reasons("with a as (delete from t returning id), b as (update u set x = 1) select 1")).toEqual([
    "DELETE without WHERE",
    "UPDATE without WHERE",
  ]);
  expect(reasons("with d as (delete from t where x in (select 1 where true)) select 1")).toEqual([]);
});

test("ON DELETE, ON UPDATE and DO UPDATE are not statements", () => {
  expect(reasons("create table t (a int references u (id) on delete cascade on update cascade)")).toEqual([]);
  expect(reasons("insert into t values (1) on conflict (id) do update set a = 1")).toEqual([]);
  expect(reasons("with x as (select 1) insert into t select * from x on conflict (id) do update set a = 1")).toEqual([]);
});

test("ALTER ... DROP loses data, except for DEFAULT / NOT NULL", () => {
  expect(reasons("alter table t drop column a")).toEqual(["ALTER ... DROP"]);
  expect(reasons("alter table t drop constraint c")).toEqual(["ALTER ... DROP"]);
  expect(reasons("alter table t alter column a drop default")).toEqual([]);
  expect(reasons("alter table t alter column a drop not null")).toEqual([]);
  expect(reasons("alter table t add column dropped int")).toEqual([]);
});

test("ALTER with several actions flags the one that drops", () => {
  expect(reasons("alter table t alter column a drop default, drop column b")).toEqual(["ALTER ... DROP"]);
});
