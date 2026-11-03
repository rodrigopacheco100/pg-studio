import { expect, test } from "bun:test";
import { splitStatements, statementAtCursor } from "./statements";

const texts = (doc: string) => splitStatements(doc).map((r) => doc.slice(r.from, r.to));

test("splits on semicolons and keeps multiline queries whole", () => {
  expect(texts("select 1;\nselect *\n  from t\n  where a = 1;\n")).toEqual(["select 1", "select *\n  from t\n  where a = 1"]);
});

test("last statement without a semicolon", () => {
  expect(texts("select 1;\n\nselect 2  \n")).toEqual(["select 1", "select 2"]);
});

test("ignores ; in strings, identifiers, comments and dollar quoting", () => {
  const doc = `select 'a;b', "c;d", 'it''s;' -- x;y\n;/* ; */ select $$ ; $$;select $f$ ; $f$`;
  expect(texts(doc)).toEqual([`select 'a;b', "c;d", 'it''s;' -- x;y`, `select $$ ; $$`, `select $f$ ; $f$`]);
});

test("comments and stray ; are not statements; a statement starts after a leading comment", () => {
  const doc = "-- note\n;;\n/* c */ select 1";
  const [r] = splitStatements(doc);
  expect(splitStatements(doc)).toHaveLength(1);
  expect(doc.slice(r.from)).toBe("select 1");
});

test("statementAtCursor picks the statement at the cursor, including multiline", () => {
  const doc = "select 1;\nselect *\n  from t;\n\nselect 3";
  expect(statementAtCursor(doc, 3)).toBe("select 1");
  expect(statementAtCursor(doc, doc.indexOf("from"))).toBe("select *\n  from t");
  expect(statementAtCursor(doc, doc.indexOf("\n\n") + 1)).toBe("select *\n  from t"); // blank line: previous
  expect(statementAtCursor(doc, doc.length)).toBe("select 3");
  expect(statementAtCursor("  ", 1)).toBe("");
});

test("a backslash escapes the quote inside an E'...' string", () => {
  const sql = String.raw`select E'it\'s; not a split'; select 2`;
  expect(splitStatements(sql).map((r) => sql.slice(r.from, r.to))).toEqual([String.raw`select E'it\'s; not a split'`, "select 2"]);
  expect(splitStatements(String.raw`select E'a\\'; select 2`)).toHaveLength(2); // an escaped backslash does not escape the quote
});

test("a backslash means nothing in a plain string", () => {
  const sql = String.raw`select 'a\'; select 2`;
  expect(splitStatements(sql).map((r) => sql.slice(r.from, r.to))).toEqual([String.raw`select 'a\'`, "select 2"]);
});

test("only a lone E prefixes an escape string", () => {
  const sql = String.raw`select name'x\'; select 2`; // `name'` is not E'...'
  expect(splitStatements(sql)).toHaveLength(2);
});
