import { expect, test } from "bun:test";
import type { QueryResult } from "../types";
import { formatResult } from "./exportResult";

const result: QueryResult = {
  columns: ["id", "note"],
  rows: [["1", 'say "hi", ok'], ["2", null]],
  types: ["int4", "text"],
  affected: null,
};

test("csv quotes what needs it and ends with a newline", () => {
  expect(formatResult("csv", result)).toBe('id,note\n1,"say ""hi"", ok"\n2,\n');
});

test("json is an array of objects", () => {
  expect(JSON.parse(formatResult("json", result))).toEqual([
    { id: "1", note: 'say "hi", ok' },
    { id: "2", note: null },
  ]);
});

test("insert uses the table and needs one", () => {
  const sql = formatResult("insert", result, { schema: "public", name: "t" });
  expect(sql).toBe("INSERT INTO public.t (id, note) VALUES\n  ('1', 'say \"hi\", ok'),\n  ('2', NULL);\n");
  expect(() => formatResult("insert", result)).toThrow();
});
