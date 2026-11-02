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
