import { useMemo } from "react";
import { pickExportPath } from "@/api";
import { useExports } from "@/features/exports/useExports";
import { EXPORT_FORMATS } from "@/features/exports/exportResult";
import type { ExportFormat } from "@/types";
import { NO_VIEW, toGridQuery } from "./gridView";
import { type ResultsApi } from "./useResults";
import { ResultViewer } from "./ResultViewer";

/** Single results pane: shows the last query or the opened table. Pagination lives in the footer. */
export function ResultsPane({ results, onOpenSql }: { results: ResultsApi; onOpenSql: (sql: string) => void }) {
  const { outcome, displayed, views, source, pageSize, setView } = results;
  const exports = useExports();
  const table = source.kind === "table" ? source.table : undefined;

  // Tables already arrive paginated from the server; queries arrive whole (sorted and filtered in `useResults`) and are sliced here.
  const visible = useMemo(() => {
    if (source.kind === "table") return displayed;
    const from = source.page * pageSize;
    return displayed.map((r) => ({ ...r, rows: r.rows.slice(from, from + pageSize) }));
  }, [displayed, source, pageSize]);

  /**
   * Starts an export of every row of result `index` (not just the page), in the sorted and filtered order on screen,
   * after asking where to save it. A table is read again by the backend, whole, with the same view; a query's rows are sent.
   * The progress shows in a floating window (`ExportWindows`).
   */
  async function exportResult(index: number, format: ExportFormat) {
    const shown = displayed[index];
    const { extension } = EXPORT_FORMATS.find((f) => f.id === format)!;
    const path = await pickExportPath(`${table?.name ?? "result"}.${extension}`, extension);
    if (!path) return;
    await exports.start({
      format,
      path,
      source: table
        ? { kind: "table", schema: table.schema, table: table.name, view: toGridQuery(views[index] ?? NO_VIEW, shown) }
        : { kind: "rows", label: "Query results", columns: shown.columns, types: shown.types, rows: shown.rows },
    });
  }

  const msg = "p-4 text-sm text-muted-foreground";
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {outcome === null && (
        <div className={msg}>Ctrl+Enter runs the query (or just the selection). Click a table to see its data.</div>
      )}
      {outcome?.kind === "running" && <div className={msg}>Running…</div>}
      {outcome?.kind === "error" && (
        <div className="selectable p-4 text-sm whitespace-pre-wrap text-destructive">{outcome.message}</div>
      )}
      {outcome?.kind === "ok" && (
        <>
          {visible.map((r, i) => <ResultViewer key={i} result={r} table={table} view={views[i] ?? NO_VIEW} onViewChange={(v) => setView(i, v)} onExport={(f) => exportResult(i, f)} onOpenSql={onOpenSql} />)}
          {visible.length === 0 && <div className={msg}>No results.</div>}
        </>
      )}
    </div>
  );
}
