import { expect, test } from "bun:test";
import { cellRange, colRange, colsOf, contains, rowRange, rowsOf } from "./selection";

test("cellRange normalizes any drag direction", () => {
  expect(cellRange({ r: 4, c: 3 }, { r: 1, c: 5 })).toEqual({ r1: 1, r2: 4, c1: 3, c2: 5 });
});

test("rowRange e colRange cobrem a linha/coluna inteira", () => {
  expect(rowRange(3, 1, 4)).toEqual({ r1: 1, r2: 3, c1: 0, c2: 4 });
  expect(colRange(2, 2, 9)).toEqual({ r1: 0, r2: 9, c1: 2, c2: 2 });
});

test("contains considers all selections", () => {
  const ranges = [cellRange({ r: 0, c: 0 }, { r: 1, c: 1 }), cellRange({ r: 5, c: 5 }, { r: 5, c: 5 })];
  expect(contains(ranges, 1, 1)).toBe(true);
  expect(contains(ranges, 5, 5)).toBe(true);
  expect(contains(ranges, 3, 3)).toBe(false);
});

test("rowsOf/colsOf merge and sort without repeats", () => {
  const ranges = [cellRange({ r: 4, c: 2 }, { r: 5, c: 3 }), cellRange({ r: 1, c: 3 }, { r: 4, c: 3 })];
  expect(rowsOf(ranges)).toEqual([1, 2, 3, 4, 5]);
  expect(colsOf(ranges)).toEqual([2, 3]);
});
