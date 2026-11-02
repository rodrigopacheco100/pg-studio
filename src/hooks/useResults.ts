import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errText } from "../api";
import { applyView, NO_VIEW, toGridQuery, type GridView } from "../lib/gridView";
import { splitStatements } from "../lib/statements";
import { useSettings } from "./useSettings";
import type { QueryResult, RunInfo, TableRef } from "../types";

export type Outcome =
  | { kind: "running" }
  | { kind: "ok"; results: QueryResult[] }
  | { kind: "error"; message: string };

/** What the results pane is showing. A query's page is sliced on the client. */
export type Source = { kind: "query"; page: number } | { kind: "table"; table: TableRef; page: number };

/** Pagination of what is on screen; `total` ignores the current page. */
export interface Paging {
  page: number;
  /** Total records; `null` while the background count has not finished (or if it failed). */
  total: number | null;
  pageCount: number | null;
  hasNext: boolean;
}

/** Wait after the last keystroke in a filter before asking the server for a table's rows. */
const TABLE_VIEW_DELAY_MS = 250;

const tableKey = (t: TableRef) => `${t.schema}.${t.name}`;

/**
 * Single state of the results pane, shared by queries and opened tables.
 * Only the latest request counts: late responses from older requests are discarded.
 */
export function useResults() {
  const pageSize = useSettings().settings.pageSize;
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [source, setSource] = useState<Source>({ kind: "query", page: 0 });
  const [info, setInfo] = useState<RunInfo | null>(null);
  const [tableTotal, setTableTotal] = useState<number | null>(null);
  /** Sort and filters per result (by position). Queries apply them here, tables on the server. */
  const [views, setViews] = useState<GridView[]>([]);
  const viewTimer = useRef<number>(undefined);
  const current = useRef(0);
  const countSeq = useRef(0);
  const countedTable = useRef<string | null>(null);
  /** Columns of the table on screen, to name them when its view goes to the server. */
  const tableColumns = useRef<string[]>([]);

  const runQuery = useCallback(async (sql: string) => {
    const id = ++current.current;
    const label = "Query";
    window.clearTimeout(viewTimer.current);
    setViews([]);
    setSource({ kind: "query", page: 0 });
    setOutcome({ kind: "running" });
    setInfo({ label, status: "running" });
    const started = performance.now();
    try {
      const out = await api.runQuery(sql, splitStatements(sql).map((r) => sql.slice(r.from, r.to)));
      if (id !== current.current) return;
      const last = out.results[out.results.length - 1];
      setOutcome({ kind: "ok", results: out.results });
      setInfo({
        label,
        status: "ok",
        durationMs: out.duration_ms,
        statements: out.results.length,
        rows: out.results.reduce((n, r) => n + r.rows.length, 0),
        affected: last && last.columns.length === 0 ? (last.affected ?? 0) : undefined,
      });
    } catch (e) {
      if (id !== current.current) return;
      const message = errText(e);
      setOutcome({ kind: "error", message });
      // The server does not return the duration of a failed query; uses the time measured here.
      setInfo({ label, status: "error", durationMs: Math.round(performance.now() - started), message });
    }
  }, []);

  /** Counts in the background: the page appears without waiting for the total. */
  const countInBackground = useCallback((table: TableRef, view: GridView, columns: string[]) => {
    const seq = ++countSeq.current;
    countedTable.current = tableKey(table);
    setTableTotal(null);
    api
      .tableCount(table.schema, table.name, toGridQuery(view, columns))
      .then((n) => seq === countSeq.current && setTableTotal(n))
      .catch(() => {}); // no total (e.g. no permission or cancelled): pagination goes on without the count
  }, []);

  /**
   * Opens a table page with `view` (sort and filters, applied by the server). The pane shows "Running…"
   * meanwhile, unless `quiet`: changing the view keeps the rows on screen so the filter fields stay where they are.
   */
  const openTable = useCallback(
    async (table: TableRef, page = 0, view: GridView = NO_VIEW, quiet = false) => {
      const id = ++current.current;
      const label = `${tableKey(table)} · page ${page + 1}`;
      window.clearTimeout(viewTimer.current);
      setViews([view]);
      setSource({ kind: "table", table, page });
      if (!quiet) setOutcome({ kind: "running" });
      setInfo({ label, status: "running" });
      const started = performance.now();
      const elapsed = () => Math.round(performance.now() - started);
      try {
        // The view names columns by position; a table opened fresh has no view, so the stale columns are not read.
        const columns = tableColumns.current;
        const query = toGridQuery(view, columns);
        // Reopening the same table on page 0 recomputes the total; changing page reuses it.
        if (page === 0 || countedTable.current !== tableKey(table)) countInBackground(table, view, columns);
        const data = await api.tableData(table.schema, table.name, pageSize, page * pageSize, query);
        if (id !== current.current) return;
        tableColumns.current = data.columns;
        setOutcome({ kind: "ok", results: [data] });
        setInfo({ label, status: "ok", durationMs: elapsed(), rows: data.rows.length });
      } catch (e) {
        if (id !== current.current) return;
        const message = errText(e);
        setOutcome({ kind: "error", message });
        setInfo({ label, status: "error", durationMs: elapsed(), message });
      }
    },
    [countInBackground, pageSize],
  );

  const goToPage = useCallback(
    (page: number) => {
      if (source.kind === "table") void openTable(source.table, page, views[0] ?? NO_VIEW);
      else setSource({ kind: "query", page });
    },
    [source, views, openTable],
  );

  /** Changes the sort/filters of result `index`; back to the first page. */
  const setView = useCallback(
    (index: number, view: GridView) => {
      setViews((all) => Object.assign([], all, { [index]: view }));
      if (source.kind === "table") {
        window.clearTimeout(viewTimer.current);
        viewTimer.current = window.setTimeout(
          () => void openTable(source.table, 0, view, true),
          TABLE_VIEW_DELAY_MS,
        );
      } else setSource({ kind: "query", page: 0 });
    },
    [source, openTable],
  );

  // A new page size invalidates the current page number: start again from the first page.
  const lastPageSize = useRef(pageSize);
  useEffect(() => {
    if (lastPageSize.current === pageSize) return;
    lastPageSize.current = pageSize;
    if (source.kind === "table") void openTable(source.table, 0, views[0] ?? NO_VIEW);
    else setSource({ kind: "query", page: 0 });
  }, [pageSize, source, views, openTable]);

  const reset = useCallback(() => {
    window.clearTimeout(viewTimer.current);
    setViews([]);
    current.current++;
    countSeq.current++;
    countedTable.current = null;
    setOutcome(null);
    setSource({ kind: "query", page: 0 });
    setInfo(null);
    setTableTotal(null);
  }, []);

  /** What the grids show: a table's rows come sorted and filtered by the server, a query's are processed here, whole. */
  const displayed = useMemo(() => {
    if (outcome?.kind !== "ok") return [];
    if (source.kind === "table") return outcome.results;
    return outcome.results.map((r, i) => applyView(r, views[i] ?? NO_VIEW));
  }, [outcome, source.kind, views]);

  const paging = useMemo<Paging | null>(() => {
    if (outcome?.kind !== "ok" || !outcome.results.some((r) => r.columns.length > 0)) return null;
    const pageCountOf = (total: number) => Math.max(1, Math.ceil(total / pageSize));
    if (source.kind === "table") {
      const pageCount = tableTotal === null ? null : pageCountOf(tableTotal);
      const onPage = outcome.results[0].rows.length;
      const hasNext = pageCount === null ? onPage === pageSize : source.page + 1 < pageCount;
      return { page: source.page, total: tableTotal, pageCount, hasNext };
    }
    const total = Math.max(...displayed.map((r) => r.rows.length));
    const pageCount = pageCountOf(total);
    return { page: source.page, total, pageCount, hasNext: source.page + 1 < pageCount };
  }, [outcome, displayed, source, tableTotal, pageSize]);

  return { outcome, displayed, views, source, info, paging, pageSize, runQuery, openTable, goToPage, setView, reset };
}

export type ResultsApi = ReturnType<typeof useResults>;
