import type { QueryResult } from "@/types";
import { evaluate, isActiveFilter, kindOf, NUMBER, type Filter } from "./gridFilter";

export interface Sort {
  column: number;
  desc: boolean;
}

/** How the grid shows a result: an optional sort and the filters a row must all pass. */
export interface GridView {
  sort: Sort | null;
  /** As searched; the ones not complete yet (see `activeFilters`) are kept but filter nothing. */
  filters: Filter[];
}

export const NO_VIEW: GridView = { sort: null, filters: [] };


/** Sort order of a column: numbers by value (by its type, or by what it holds when the type is unknown), everything else as text. */
function comparer(result: QueryResult, column: number): (a: string, b: string) => number {
  const type = result.types[column];
  const numeric = type ? kindOf(type) === "number" : result.rows.every((r) => r[column] === null || NUMBER.test(r[column]!));
  if (numeric) return (a, b) => Number(a) - Number(b) || 0; // NaN / Infinity compare as equal
  return (a, b) => (a < b ? -1 : a > b ? 1 : 0);
}

/** The filters that take part: the complete and valid ones. */
export function activeFilters(result: Pick<QueryResult, "types">, view: GridView): Filter[] {
  return view.filters.filter((f) => isActiveFilter(f, kindOf(result.types[f.column])));
}

/** `result` with the rows filtered and sorted. NULLs go last in either direction. The input is not changed. */
export function applyView(result: QueryResult, view: GridView): QueryResult {
  const filters = activeFilters(result, view);
  if (!view.sort && filters.length === 0) return result;

  let rows = result.rows.filter((row) => filters.every((f) => evaluate(f, row[f.column] ?? null, kindOf(result.types[f.column]))));
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

/** A view as the backend takes it for a table: columns by name, only the filters that take part. */
export interface GridQuery {
  sort: { column: string; desc: boolean } | null;
  filters: { column: string; op: string; value: string; numeric: boolean }[];
}

export function toGridQuery(view: GridView, result: Pick<QueryResult, "columns" | "types">): GridQuery {
  return {
    sort: view.sort ? { column: result.columns[view.sort.column], desc: view.sort.desc } : null,
    filters: activeFilters(result, view).map((f) => ({
      column: result.columns[f.column],
      op: f.op,
      value: f.value,
      numeric: kindOf(result.types[f.column]) === "number",
    })),
  };
}

/** Is there a sort or any filter (even a draft) to clear? */
export const isActive = (view: GridView) => view.sort !== null || view.filters.length > 0;
