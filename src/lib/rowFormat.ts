import type { TableRef } from "../types";
import { quoteIdent, quoteLiteral } from "./sql";

export type Row = (string | null)[];

/** Unique column names: `select a.id, b.id` becomes `id` and `id_2`. */
function uniqueKeys(columns: string[]): string[] {
  const seen = new Map<string, number>();
  return columns.map((c) => {
    const n = (seen.get(c) ?? 0) + 1;
    seen.set(c, n);
    return n === 1 ? c : `${c}_${n}`;
  });
}

const isJsonType = (type: string | undefined) => type === "json" || type === "jsonb";

/** A json/jsonb value as a JSON value rather than a string; kept as text if it does not parse. */
function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** Rows as objects. `types` (PostgreSQL type name per column, if known) makes json/jsonb columns nested JSON. */
export function toObjects(columns: string[], rows: Row[], types: string[] = []): Record<string, unknown>[] {
  const keys = uniqueKeys(columns);
  return rows.map((r) =>
    Object.fromEntries(
      keys.map((k, i) => {
        const v = r[i] ?? null;
        return [k, v !== null && isJsonType(types[i]) ? parseJson(v) : v];
      }),
    ),
  );
}

export const toJson = (columns: string[], rows: Row[], types: string[] = []) =>
  JSON.stringify(toObjects(columns, rows, types), null, 2);

const csvCell = (v: string | null) => (v === null ? "" : /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function toCsv(columns: string[], rows: Row[]): string {
  return [columns, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

/** TSV for pasting into spreadsheets: tabs and line breaks inside values become spaces. */
export function toTsv(columns: string[], rows: Row[], header = true): string {
  const cell = (v: string | null) => (v ?? "").replace(/[\t\r\n]+/g, " ");
  return (header ? [columns, ...rows] : rows).map((r) => r.map(cell).join("\t")).join("\n");
}

export function toInsert(table: TableRef, columns: string[], rows: Row[]): string {
  const target = `${quoteIdent(table.schema)}.${quoteIdent(table.name)}`;
  const cols = columns.map(quoteIdent).join(", ");
  const values = rows.map((r) => `  (${r.map(quoteLiteral).join(", ")})`).join(",\n");
  return `INSERT INTO ${target} (${cols}) VALUES\n${values};`;
}
