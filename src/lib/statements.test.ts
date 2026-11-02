import { expect, test } from "bun:test";
import { splitStatements, statementAtCursor } from "./statements";

const texts = (doc: string) => splitStatements(doc).map((r) => doc.slice(r.from, r.to));

test("separa por ponto e vírgula e mantém queries multilinha inteiras", () => {
  expect(texts("select 1;\nselect *\n  from t\n  where a = 1;\n")).toEqual(["select 1", "select *\n  from t\n  where a = 1"]);
});

test("última instrução sem ponto e vírgula", () => {
  expect(texts("select 1;\n\nselect 2  \n")).toEqual(["select 1", "select 2"]);
});

test("ignora ; em strings, identificadores, comentários e dollar quoting", () => {
  const doc = `select 'a;b', "c;d", 'it''s;' -- x;y\n;/* ; */ select $$ ; $$;select $f$ ; $f$`;
  expect(texts(doc)).toEqual([`select 'a;b', "c;d", 'it''s;' -- x;y`, `select $$ ; $$`, `select $f$ ; $f$`]);
});

test("comentários e ; soltos não são instruções; a instrução começa após comentário inicial", () => {
  const doc = "-- nota\n;;\n/* c */ select 1";
  const [r] = splitStatements(doc);
  expect(splitStatements(doc)).toHaveLength(1);
  expect(doc.slice(r.from)).toBe("select 1");
});

test("statementAtCursor escolhe a instrução do cursor, inclusive multilinha", () => {
  const doc = "select 1;\nselect *\n  from t;\n\nselect 3";
  expect(statementAtCursor(doc, 3)).toBe("select 1");
  expect(statementAtCursor(doc, doc.indexOf("from"))).toBe("select *\n  from t");
  expect(statementAtCursor(doc, doc.indexOf("\n\n") + 1)).toBe("select *\n  from t"); // linha em branco: anterior
  expect(statementAtCursor(doc, doc.length)).toBe("select 3");
  expect(statementAtCursor("  ", 1)).toBe("");
});
