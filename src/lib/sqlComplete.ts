import { snippetCompletion, type Completion, type CompletionContext, type CompletionResult, type CompletionSource } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import type { TableInfo } from "../types";
import { quoteIdent, RESERVED } from "./sql";

const KEYWORDS = `SELECT FROM WHERE JOIN LEFT RIGHT INNER OUTER FULL CROSS ON USING GROUP BY ORDER HAVING LIMIT OFFSET
  DISTINCT AS AND OR NOT IN IS NULL LIKE ILIKE BETWEEN EXISTS CASE WHEN THEN ELSE END INSERT INTO VALUES UPDATE SET
  DELETE RETURNING UNION ALL EXCEPT INTERSECT WITH CREATE ALTER DROP TABLE INDEX VIEW ASC DESC COUNT SUM AVG MIN MAX
  COALESCE CAST EXPLAIN ANALYZE TRUE FALSE`.split(/\s+/);

/** Statement templates offered at the start of a statement; `${field}`s are filled in with Tab. */
export const SNIPPETS: { label: string; detail: string; template: string }[] = [
  { label: "sel", detail: "SELECT … FROM … WHERE", template: "SELECT ${columns}\nFROM ${table}\nWHERE ${condition};" },
  { label: "cnt", detail: "SELECT count(*)", template: "SELECT count(*)\nFROM ${table}\nWHERE ${condition};" },
  { label: "ins", detail: "INSERT INTO … VALUES", template: "INSERT INTO ${table} (${columns})\nVALUES (${values});" },
  { label: "upd", detail: "UPDATE … SET … WHERE", template: "UPDATE ${table}\nSET ${column} = ${value}\nWHERE ${condition};" },
  { label: "del", detail: "DELETE FROM … WHERE", template: "DELETE FROM ${table}\nWHERE ${condition};" },
  { label: "crt", detail: "CREATE TABLE", template: "CREATE TABLE ${name} (\n  id serial PRIMARY KEY,\n  ${column} ${type}\n);" },
  { label: "idx", detail: "CREATE INDEX", template: "CREATE INDEX ${name} ON ${table} (${column});" },
  { label: "cte", detail: "WITH … AS (…) SELECT", template: "WITH ${name} AS (\n  ${query}\n)\nSELECT *\nFROM ${name};" },
];

export interface StatementRef {
  /** Alias declared in the query, if any. */
  alias: string | null;
  table: TableInfo;
}

/** Statement (delimited by `;`) that contains position `pos`. */
export function statementAt(doc: string, pos: number): { from: number; text: string } {
  const from = pos > 0 ? doc.lastIndexOf(";", pos - 1) + 1 : 0;
  const end = doc.indexOf(";", pos);
  return { from, text: doc.slice(from, end === -1 ? doc.length : end) };
}

const unquote = (s: string) => (s.startsWith('"') ? s.slice(1, -1).replace(/""/g, '"') : s);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function findTable(tables: TableInfo[], schema: string | null, name: string): TableInfo | undefined {
  const found = tables.filter((t) => same(t.name, name) && (schema === null || same(t.schema, schema)));
  return found.find((t) => t.schema === "public") ?? found[0];
}

/** Tables mentioned after FROM/JOIN/UPDATE/INTO, with their aliases. */
export function parseRefs(statement: string, tables: TableInfo[]): StatementRef[] {
  const ident = String.raw`"[^"]+"|[\w$]+`;
  const re = new RegExp(
    String.raw`\b(?:from|join|update|into)\s+(${ident})(?:\.(${ident}))?(?:\s+(?:as\s+)?(${ident}))?`,
    "gi",
  );
  const refs: StatementRef[] = [];
  for (const m of statement.matchAll(re)) {
    const [schema, name] = m[2] ? [unquote(m[1]), unquote(m[2])] : [null, unquote(m[1])];
    const table = findTable(tables, schema, name);
    if (!table) continue;
    const alias = m[3] ? unquote(m[3]) : null;
    refs.push({ table, alias: alias && !RESERVED.has(alias.toLowerCase()) ? alias : null });
  }
  return refs;
}

/**
 * Suggests a short alias: initials for compound names (`user_roles` → `ur`),
 * otherwise the first letters (`Class` → `cl`). Avoids aliases in use and reserved words.
 */
export function makeAlias(table: string, taken: Set<string>): string {
  const words = table
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
  const base = words.join("");
  const candidates: string[] = [];
  if (words.length > 1) candidates.push(words.map((w) => w[0]).join(""));
  for (let n = Math.min(2, base.length); n <= base.length; n++) candidates.push(base.slice(0, n));

  const ok = (c: string) => /^[a-z_]/.test(c) && !taken.has(c) && !RESERVED.has(c);
  const found = candidates.find(ok);
  if (found) return found;
  for (let i = 2; ; i++) if (ok(`t${i}`)) return `t${i}`;
}

function inStringOrComment(before: string): boolean {
  const line = before.slice(before.lastIndexOf("\n") + 1);
  return line.includes("--") || (before.match(/'/g)?.length ?? 0) % 2 === 1;
}

type Slot = { kind: "table"; alias: boolean } | { kind: "other" };

/** Is the cursor where a table name is expected? And does an alias fit there? */
function slotAt(beforeWord: string): Slot {
  const m = /\b(from|join|update|into|table|truncate)\s+$/i.exec(beforeWord);
  if (m) return { kind: "table", alias: /^(from|join|update)$/i.test(m[1]) };
  if (/\bfrom\b(?:(?!\b(?:where|group|order|having|limit|union|select|on|set)\b)[^;()])*,\s*$/i.test(beforeWord)) {
    return { kind: "table", alias: true };
  }
  return { kind: "other" };
}

const qualified = (t: TableInfo, withSchema: boolean) =>
  (withSchema && t.schema !== "public" ? `${quoteIdent(t.schema)}.` : "") + quoteIdent(t.name);

function tableOptions(tables: TableInfo[], slot: Slot, withSchema: boolean, taken: Set<string>): Completion[] {
  return tables.map((t) => ({
    label: t.name,
    detail: t.schema === "public" ? "" : t.schema,
    type: t.kind === "VIEW" ? "interface" : "class",
    apply: (view: EditorView, _c: Completion, from: number, to: number) => {
      const name = qualified(t, withSchema);
      const insert = slot.kind === "table" && slot.alias ? `${name} ${makeAlias(t.name, taken)} ` : name;
      view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length } });
    },
  }));
}

function columnOptions(table: TableInfo, prefix: string): Completion[] {
  return table.columns.map((c) => ({
    label: c.name,
    detail: c.data_type,
    type: "property",
    apply: prefix + quoteIdent(c.name),
    boost: 1,
  }));
}

/** Autocomplete of tables (with automatic alias), columns and keywords. */
export function createSqlCompletion(getTables: () => TableInfo[]): CompletionSource {
  return (ctx: CompletionContext): CompletionResult | null => {
    const word = ctx.matchBefore(/[\w$]*\.?[\w$]*/);
    if (!word) return null;
    const tables = getTables();
    const doc = ctx.state.doc.toString();
    const stmt = statementAt(doc, ctx.pos);
    if (inStringOrComment(doc.slice(stmt.from, ctx.pos))) return null;

    const refs = parseRefs(stmt.text, tables);
    const taken = new Set(refs.flatMap((r) => [r.alias, r.table.name]).map((s) => (s ?? "").toLowerCase()));
    const slot = slotAt(doc.slice(stmt.from, word.from));
    const dot = word.text.indexOf(".");

    if (dot >= 0) {
      const qualifier = word.text.slice(0, dot);
      const ref = refs.find((r) => same(r.alias ?? r.table.name, qualifier));
      const table = ref?.table ?? findTable(tables, null, qualifier);
      const inSchema = tables.filter((t) => same(t.schema, qualifier));
      const options = table ? columnOptions(table, "") : tableOptions(inSchema, slot, false, taken);
      return { from: word.from + dot + 1, options, validFor: /^[\w$]*$/ };
    }

    if (word.from === word.to && !ctx.explicit) return null;

    if (slot.kind === "table") {
      return { from: word.from, options: tableOptions(tables, slot, true, taken), validFor: /^[\w$]*$/ };
    }

    const options: Completion[] = KEYWORDS.map((k) => ({ label: k, type: "keyword" }));
    if (doc.slice(stmt.from, word.from).trim() === "") {
      options.push(...SNIPPETS.map((x) => snippetCompletion(x.template, { label: x.label, detail: x.detail, type: "text", boost: 2 })));
    }
    if (refs.length === 0) {
      const seen = new Set<string>();
      for (const t of tables) {
        for (const c of t.columns) {
          if (seen.has(c.name)) continue;
          seen.add(c.name);
          options.push({ label: c.name, detail: c.data_type, type: "property", apply: quoteIdent(c.name) });
        }
      }
    } else {
      for (const r of refs) {
        const qualifier = r.alias ?? quoteIdent(r.table.name);
        if (r.alias) options.push({ label: r.alias, detail: r.table.name, type: "variable", boost: 2 });
        options.push(...columnOptions(r.table, refs.length > 1 ? `${qualifier}.` : "").map((o) => ({
          ...o,
          detail: `${r.alias ?? r.table.name} · ${o.detail}`,
        })));
      }
    }
    return { from: word.from, options, validFor: /^[\w$]*$/ };
  };
}
