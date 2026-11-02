import { useMemo } from "react";
import { NO_VIEW } from "../lib/gridView";
import { type ResultsApi } from "../hooks/useResults";
import { ResultViewer } from "./ResultViewer";

/** Single results pane: shows the last query or the opened table. Pagination lives in the footer. */
export function ResultsPane({ results }: { results: ResultsApi }) {
  const { outcome, displayed, views, source, pageSize, setView } = results;
  const table = source.kind === "table" ? source.table : undefined;

  // Tables already arrive paginated from the server; queries arrive whole (sorted and filtered in `useResults`) and are sliced here.
  const visible = useMemo(() => {
    if (source.kind === "table") return displayed;
    const from = source.page * pageSize;
    return displayed.map((r) => ({ ...r, rows: r.rows.slice(from, from + pageSize) }));
  }, [displayed, source, pageSize]);

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
          {visible.map((r, i) => <ResultViewer key={i} result={r} table={table} view={views[i] ?? NO_VIEW} onViewChange={(v) => setView(i, v)} />)}
          {visible.length === 0 && <div className={msg}>No results.</div>}
        </>
      )}
    </div>
  );
}
