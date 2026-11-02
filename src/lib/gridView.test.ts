import { expect, test } from "bun:test";
import type { QueryResult } from "../types";
import { applyView, nextSort, NO_VIEW, toGridQuery, withFilter } from "./gridView";

const result = (rows: (string | null)[][], types: string[] = []): QueryResult => ({ columns: ["n", "s"], rows, types, affected: null });
const col = (r: QueryResult, c: number) => r.rows.map((row) => row[c]);

const data = result([["10", "b"], ["9", "a"], [null, "c"], ["100", null]], ["int4", "text"]);

test("without sort or filters the result is returned as is", () => {
  expect(applyView(data, NO_VIEW)).toBe(data);
});

test("numbers sort by value, NULLs last in both directions", () => {
  expect(col(applyView(data, { sort: { column: 0, desc: false }, filters: {} }), 0)).toEqual(["9", "10", "100", null]);
  expect(col(applyView(data, { sort: { column: 0, desc: true }, filters: {} }), 0)).toEqual(["100", "10", "9", null]);
});

test("text sorts alphabetically", () => {
  expect(col(applyView(data, { sort: { column: 1, desc: false }, filters: {} }), 1)).toEqual(["a", "b", "c", null]);
});

test("without column types, a column of numbers still sorts numerically", () => {
  const untyped = result([["10", "x"], ["9", "y"]]);
  expect(col(applyView(untyped, { sort: { column: 0, desc: false }, filters: {} }), 0)).toEqual(["9", "10"]);
});

test("filters keep the rows that contain the text, ignoring case; all filters must match", () => {
  const people = result([["1", "Alice"], ["2", "alina"], ["3", "Bob"]], ["int4", "text"]);
  expect(col(applyView(people, { sort: null, filters: { 1: "ALI" } }), 0)).toEqual(["1", "2"]);
  expect(col(applyView(people, { sort: null, filters: { 1: "ali", 0: "2" } }), 0)).toEqual(["2"]);
});

test("NULL cells match the text NULL", () => {
  expect(col(applyView(data, { sort: null, filters: { 0: "null" } }), 1)).toEqual(["c"]);
});

test("the input rows are not reordered", () => {
  applyView(data, { sort: { column: 0, desc: false }, filters: {} });
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

test("withFilter sets and clears the filter of a column", () => {
  const set = withFilter(NO_VIEW, 2, "x");
  expect(set.filters).toEqual({ 2: "x" });
  expect(withFilter(set, 2, "").filters).toEqual({});
  expect(NO_VIEW.filters).toEqual({});
});

test("toGridQuery names the columns", () => {
  const view = { sort: { column: 1, desc: true }, filters: { 0: "x" } };
  expect(toGridQuery(view, ["id", "name"])).toEqual({ sort: { column: "name", desc: true }, filters: [{ column: "id", text: "x" }] });
  expect(toGridQuery(NO_VIEW, ["id"])).toEqual({ sort: null, filters: [] });
});
