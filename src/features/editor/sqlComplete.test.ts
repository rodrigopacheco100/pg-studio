import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { describe, expect, test } from "bun:test";
import type { TableInfo } from "@/types";
import { createSqlCompletion, makeAlias, parseRefs, SNIPPETS, statementAt } from "./sqlComplete";
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
  test("reads tables, schema and aliases", () => {
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
  test("reserved word is not an alias", () => {
    expect(parseRefs("select * from student where id = 1", tables)[0].alias).toBeNull();
  });
});

test("statementAt isolates the statement at the cursor", () => {
  const doc = "select 1; select 2; select 3";
  expect(statementAt(doc, 14).text.trim()).toBe("select 2");
});

test("quoteIdent quotes only when necessary", () => {
  expect(quoteIdent("name")).toBe("name");
  expect(quoteIdent("Class")).toBe('"Class"');
  expect(quoteIdent("user")).toBe('"user"');
});

describe("snippets", () => {
  /** Labels offered with the cursor at the end of `doc`. */
  const offered = async (doc: string) => {
    const state = EditorState.create({ doc });
    const result = await createSqlCompletion(() => tables)(new CompletionContext(state, doc.length, true));
    return result?.options.map((o) => o.label) ?? [];
  };

  test("are offered at the start of a statement", async () => {
    expect(await offered("se")).toContain("sel");
    expect(await offered("select 1;\n  de")).toContain("del");
  });
  test("are not offered inside a statement", async () => {
    expect(await offered("select * from student where se")).not.toContain("sel");
  });
  test("have unique labels", () => {
    expect(new Set(SNIPPETS.map((s) => s.label)).size).toBe(SNIPPETS.length);
  });
});
