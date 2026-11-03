import { expect, test } from "bun:test";
import { evaluate, isActiveFilter, kindOf, newFilter, opsFor, refit, validValue, type Filter } from "./gridFilter";

const f = (over: Partial<Filter>): Filter => ({ column: 0, op: "eq", value: "", ...over });

test("kindOf maps PostgreSQL types", () => {
  expect(["int4", "numeric", "float8"].map(kindOf)).toEqual(["number", "number", "number"]);
  expect(["date", "timestamptz"].map(kindOf)).toEqual(["date", "date"]);
  expect([kindOf("bool"), kindOf("text"), kindOf("uuid"), kindOf(undefined)]).toEqual(["bool", "text", "text", "text"]);
});

test("the operators follow the kind", () => {
  expect(opsFor("text")).toContain("contains");
  expect(opsFor("number")).not.toContain("contains");
  expect(opsFor("bool")).not.toContain("gt");
  expect(newFilter(2, "number")).toEqual({ column: 2, op: "eq", value: "" });
  expect(newFilter(0, "text").op).toBe("contains");
  expect(newFilter(0, "date").op).toBe("starts");
});

test("refit keeps an operator that still fits and replaces one that does not", () => {
  expect(refit(f({ op: "contains", value: "x" }), "number").op).toBe("eq");
  expect(refit(f({ op: "gt" }), "text").op).toBe("gt");
});

test("a filter is a draft until it has a valid value", () => {
  expect(isActiveFilter(f({ op: "contains", value: "" }), "text")).toBe(false);
  expect(isActiveFilter(f({ op: "contains", value: "a" }), "text")).toBe(true);
  expect(isActiveFilter(f({ op: "is_null" }), "text")).toBe(true);
  expect(isActiveFilter(f({ op: "gt", value: "abc" }), "number")).toBe(false);
  expect(isActiveFilter(f({ op: "gt", value: "1.5" }), "number")).toBe(true);
  expect(validValue(f({ op: "gt", value: "x" }), "text")).toBe(true);
});

test("text operators ignore case, except = and ≠", () => {
  expect(evaluate(f({ op: "contains", value: "ALI" }), "Alice", "text")).toBe(true);
  expect(evaluate(f({ op: "not_contains", value: "ali" }), "Alice", "text")).toBe(false);
  expect(evaluate(f({ op: "starts", value: "al" }), "Alice", "text")).toBe(true);
  expect(evaluate(f({ op: "ends", value: "CE" }), "Alice", "text")).toBe(true);
  expect(evaluate(f({ op: "eq", value: "alice" }), "Alice", "text")).toBe(false);
  expect(evaluate(f({ op: "ne", value: "Bob" }), "Alice", "text")).toBe(true);
});

test("numbers compare by value", () => {
  expect(evaluate(f({ op: "gt", value: "9" }), "10", "number")).toBe(true); // as text "10" < "9"
  expect(evaluate(f({ op: "le", value: "10" }), "10", "number")).toBe(true);
  expect(evaluate(f({ op: "eq", value: "1.0" }), "1", "number")).toBe(true);
});

test("dates compare as ISO text", () => {
  const d = "2024-03-15 10:30:00+00";
  expect(evaluate(f({ op: "ge", value: "2024-03-15" }), d, "date")).toBe(true);
  expect(evaluate(f({ op: "lt", value: "2024-03-15" }), d, "date")).toBe(false);
  expect(evaluate(f({ op: "starts", value: "2024-03" }), d, "date")).toBe(true);
});

test("NULL passes only the null checks, as in SQL", () => {
  expect(evaluate(f({ op: "is_null" }), null, "text")).toBe(true);
  expect(evaluate(f({ op: "not_null" }), null, "text")).toBe(false);
  expect(evaluate(f({ op: "ne", value: "x" }), null, "text")).toBe(false);
  expect(evaluate(f({ op: "not_contains", value: "x" }), null, "text")).toBe(false);
});
