import type { QueryResult } from "../types";

export interface Sort {
  column: number;
  desc: boolean;
}

/** How the grid shows a result: an optional sort and, per column, a text the cell must contain. */
export interface GridView {
  sort: Sort | null;
  /** Column index → text (case-insensitive). Empty texts are not stored. */
  filters: Record<number, string>;
}

export const NO_VIEW: GridView = { sort: null, filters: {} };

const NUMERIC_TYPES = new Set(["int2", "int4", "int8", "float4", "float8", "numeric", "oid", "money"]);
const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;

/** Sort order of a column: numbers by value (by its type, or by what it holds when the type is unknown), everything else as text. */
function comparer(result: QueryResult, column: number): (a: string, b: string) => number {
  const type = result.types[column];
  const numeric = type ? NUMERIC_TYPES.has(type) : result.rows.every((r) => r[column] === null || NUMBER.test(r[column]!));
  if (numeric) return (a, b) => Number(a) - Number(b) || 0; // NaN / Infinity compare as equal
  return (a, b) => (a < b ? -1 : a > b ? 1 : 0);
}

/** `result` with the rows filtered and sorted. NULLs go last in either direction. The input is not changed. */
export function applyView(result: QueryResult, view: GridView): QueryResult {
  const filters = Object.entries(view.filters).map(([c, text]) => [Number(c), text.toLowerCase()] as const);
  if (!view.sort && filters.length === 0) return result;

  let rows = result.rows.filter((row) => filters.every(([c, text]) => (row[c] ?? "NULL").toLowerCase().includes(text)));
  if (view.sort) {
    const { column, desc } = view.sort;
    const compare = comparer(result, column);
    rows = [...rows].sort((x, y) => {
      const [a, b] = [x[column], y[column]];
      if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
      return desc ? compare(b, a) : compare(a, b);
    });
  }
  return { ...result, rows };
}

/** Header click cycle on a column: ascending, descending, off. */
export function nextSort(sort: Sort | null, column: number): Sort | null {
  if (sort?.column !== column) return { column, desc: false };
  return sort.desc ? null : { column, desc: true };
}

/** The view with the filter of `column` set to `text` (or removed when empty). */
export function withFilter(view: GridView, column: number, text: string): GridView {
  const { [column]: _removed, ...rest } = view.filters;
  return { ...view, filters: text ? { ...rest, [column]: text } : rest };
}

/** A view as the backend takes it for a table: columns by name. */
export interface GridQuery {
  sort: { column: string; desc: boolean } | null;
  filters: { column: string; text: string }[];
}

export function toGridQuery(view: GridView, columns: string[]): GridQuery {
  return {
    sort: view.sort ? { column: columns[view.sort.column], desc: view.sort.desc } : null,
    filters: Object.entries(view.filters).map(([c, text]) => ({ column: columns[Number(c)], text })),
  };
}

export const isActive = (view: GridView) => view.sort !== null || Object.keys(view.filters).length > 0;
