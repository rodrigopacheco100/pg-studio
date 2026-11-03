import { expect, test } from "bun:test";
import type { QueryResult } from "@/types";
import type { Filter } from "./gridFilter";
import { applyView, nextSort, NO_VIEW, toGridQuery } from "./gridView";

const result = (rows: (string | null)[][], types: string[] = []): QueryResult => ({ columns: ["n", "s"], rows, types, affected: null });
const col = (r: QueryResult, c: number) => r.rows.map((row) => row[c]);

const data = result([["10", "b"], ["9", "a"], [null, "c"], ["100", null]], ["int4", "text"]);

test("without sort or filters the result is returned as is", () => {
  expect(applyView(data, NO_VIEW)).toBe(data);
});

test("numbers sort by value, NULLs last in both directions", () => {
  expect(col(applyView(data, { sort: { column: 0, desc: false }, filters: [] }), 0)).toEqual(["9", "10", "100", null]);
  expect(col(applyView(data, { sort: { column: 0, desc: true }, filters: [] }), 0)).toEqual(["100", "10", "9", null]);
});

test("text sorts alphabetically", () => {
  expect(col(applyView(data, { sort: { column: 1, desc: false }, filters: [] }), 1)).toEqual(["a", "b", "c", null]);
});

test("without column types, a column of numbers still sorts numerically", () => {
  const untyped = result([["10", "x"], ["9", "y"]]);
  expect(col(applyView(untyped, { sort: { column: 0, desc: false }, filters: [] }), 0)).toEqual(["9", "10"]);
});

const filter = (over: Partial<Filter>): Filter => ({ column: 0, op: "contains", value: "", ...over });

test("filters keep the rows that pass all of them", () => {
  const people = result([["1", "Alice"], ["2", "alina"], ["3", "Bob"]], ["int4", "text"]);
  expect(col(applyView(people, { sort: null, filters: [filter({ column: 1, value: "ALI" })] }), 0)).toEqual(["1", "2"]);
  expect(col(applyView(people, { sort: null, filters: [filter({ column: 1, value: "ali" }), filter({ column: 0, op: "gt", value: "1" })] }), 0)).toEqual(["2"]);
});

test("drafts (no value, or a number that does not parse) filter nothing", () => {
  const people = result([["1", "Alice"], ["2", "Bob"]], ["int4", "text"]);
  expect(applyView(people, { sort: null, filters: [filter({ column: 1, value: "" })] })).toBe(people);
  expect(applyView(people, { sort: null, filters: [filter({ column: 0, op: "gt", value: "x" })] })).toBe(people);
});

test("null checks and column types decide how a filter compares", () => {
  expect(col(applyView(data, { sort: null, filters: [filter({ column: 0, op: "is_null" })] }), 1)).toEqual(["c"]);
  expect(col(applyView(data, { sort: null, filters: [filter({ column: 0, op: "gt", value: "9" })] }), 0)).toEqual(["10", "100"]);
});

test("the input rows are not reordered", () => {
  applyView(data, { sort: { column: 0, desc: false }, filters: [] });
  expect(col(data, 0)).toEqual(["10", "9", null, "100"]);
});

test("nextSort goes ascending, descending, off, and restarts on another column", () => {
  const asc = nextSort(null, 1);
  expect(asc).toEqual({ column: 1, desc: false });
  const desc = nextSort(asc, 1);
  expect(desc).toEqual({ column: 1, desc: true });
  expect(nextSort(desc, 1)).toBeNull();
  expect(nextSort(desc, 0)).toEqual({ column: 0, desc: false });
});

test("toGridQuery names the columns, keeps only active filters and flags numeric comparisons", () => {
  const shape = { columns: ["id", "name"], types: ["int4", "text"] };
  const view = {
    sort: { column: 1, desc: true },
    filters: [filter({ column: 0, op: "ge", value: "5" }), filter({ column: 1, op: "contains", value: "ab" }), filter({ column: 1, value: "" })],
  };
  expect(toGridQuery(view, shape)).toEqual({
    sort: { column: "name", desc: true },
    filters: [
      { column: "id", op: "ge", value: "5", numeric: true },
      { column: "name", op: "contains", value: "ab", numeric: false },
    ],
  });
  expect(toGridQuery(NO_VIEW, shape)).toEqual({ sort: null, filters: [] });
});
