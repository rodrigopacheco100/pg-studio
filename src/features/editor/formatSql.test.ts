import { expect, test } from "bun:test";
import { type FormatOptions, formatSql as format } from "./formatSql";

const defaults: FormatOptions = { keywordCase: "upper", tabSize: 2 };
const formatSql = (sql: string, options: Partial<FormatOptions> = {}) => format(sql, { ...defaults, ...options });

test("formats keywords and layout, one statement after another", async () => {
  expect(await formatSql("select a,b from t where a=1;select 2")).toBe(
    "SELECT\n  a,\n  b\nFROM\n  t\nWHERE\n  a = 1;\n\nSELECT\n  2",
  );
});

test("keeps PostgreSQL specifics intact", async () => {
  const out = await formatSql("select $1::int, 'it''s', x->>'k' from t");
  expect(out).toContain("$1::int");
  expect(out).toContain("'it''s'");
  expect(out).toContain("x ->> 'k'");
});

test("throws on SQL it cannot tokenize", async () => {
  await expect(formatSql("select 'oops")).rejects.toThrow();
});

test("honors keyword case and tab size", async () => {
  expect(await formatSql("SELECT a FROM t", { keywordCase: "lower" })).toBe("select\n  a\nfrom\n  t");
  expect(await formatSql("select a from t", { tabSize: 4 })).toBe("SELECT\n    a\nFROM\n    t");
});
