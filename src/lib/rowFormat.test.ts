import { expect, test } from "bun:test";
import { toCsv, toInsert, toJson, toTsv } from "./rowFormat";

const cols = ["id", "name"];
const rows = [
  ["1", "Ana, \"A\""],
  ["2", null],
];

test("toJson keeps NULL and dedupes repeated columns", () => {
  expect(JSON.parse(toJson(cols, rows))[1]).toEqual({ id: "2", name: null });
  expect(JSON.parse(toJson(["id", "id"], [["1", "2"]]))).toEqual([{ id: "1", id_2: "2" }]);
});

test("toJson nests json/jsonb columns as JSON and keeps invalid ones as text", () => {
  const out = JSON.parse(toJson(["id", "doc", "raw"], [["1", '{"a":[1,2],"b":null}', "not json"], ["2", null, "x"]], ["int4", "jsonb", "json"]));
  expect(out[0]).toEqual({ id: "1", doc: { a: [1, 2], b: null }, raw: "not json" });
  expect(out[1].doc).toBeNull();
  // Without types (or for text columns) the value stays a string.
  expect(JSON.parse(toJson(["doc"], [['{"a":1}']]))[0].doc).toBe('{"a":1}');
  expect(JSON.parse(toJson(["doc"], [['{"a":1}']], ["text"]))[0].doc).toBe('{"a":1}');
});

test("toCsv escapes quotes and commas", () => {
  expect(toCsv(cols, rows)).toBe('id,name\n1,"Ana, ""A"""\n2,');
});

test("toTsv replaces tabs and line breaks with spaces", () => {
  expect(toTsv(["a"], [["x\ty\nz"]])).toBe("a\nx y z");
  expect(toTsv(["a"], [["1"], [null]], false)).toBe("1\n");
});

test("toInsert cita identificadores e literais", () => {
  expect(toInsert({ schema: "public", name: "Class" }, ["id", "name"], [["1", "O'Neil"], ["2", null]])).toBe(
    `INSERT INTO public."Class" (id, name) VALUES\n  ('1', 'O''Neil'),\n  ('2', NULL);`,
  );
});
