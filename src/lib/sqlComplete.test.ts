import { describe, expect, test } from "bun:test";
import type { TableInfo } from "../types";
import { makeAlias, parseRefs, statementAt } from "./sqlComplete";
import { quoteIdent } from "./sql";

const table = (schema: string, name: string): TableInfo => ({ schema, name, kind: "BASE TABLE", columns: [] });
const tables = [table("public", "Class"), table("public", "student"), table("school", "teacher")];

describe("makeAlias", () => {
  test("nome simples usa as duas primeiras letras", () => expect(makeAlias("Class", new Set())).toBe("cl"));
  test("nome composto usa as iniciais", () => {
    expect(makeAlias("user_roles", new Set())).toBe("ur");
    expect(makeAlias("UserRole", new Set())).toBe("ur");
  });
  test("evita apelido em uso", () => expect(makeAlias("Class", new Set(["cl"]))).toBe("cla"));
  test("evita palavra reservada", () => expect(makeAlias("invoice", new Set())).toBe("inv"));
});

describe("parseRefs", () => {
  test("lê tabelas, schema e apelidos", () => {
    const refs = parseRefs(
      `select * from "Class" cl join school.teacher as t on t.id = cl.id left join student where 1=1`,
      tables,
    );
    expect(refs.map((r) => [r.table.name, r.alias])).toEqual([
      ["Class", "cl"],
      ["teacher", "t"],
      ["student", null],
    ]);
  });
  test("palavra reservada não é apelido", () => {
    expect(parseRefs("select * from student where id = 1", tables)[0].alias).toBeNull();
  });
});

test("statementAt isola a instrução do cursor", () => {
  const doc = "select 1; select 2; select 3";
  expect(statementAt(doc, 14).text.trim()).toBe("select 2");
});

test("quoteIdent coloca aspas só quando necessário", () => {
  expect(quoteIdent("name")).toBe("name");
  expect(quoteIdent("Class")).toBe('"Class"');
  expect(quoteIdent("user")).toBe('"user"');
});
