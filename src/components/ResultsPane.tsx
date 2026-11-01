import { useMemo } from "react";
import { PAGE_SIZE, type ResultsApi } from "../hooks/useResults";
import { ResultViewer } from "./ResultViewer";

/** Painel único de resultados: mostra a última query ou a tabela aberta. A paginação fica no rodapé. */
export function ResultsPane({ results }: { results: ResultsApi }) {
  const { outcome, source } = results;
  const table = source.kind === "table" ? source.table : undefined;

  // Tabelas já chegam paginadas do servidor; queries chegam inteiras e são fatiadas aqui.
  const visible = useMemo(() => {
    if (outcome?.kind !== "ok") return [];
    if (source.kind === "table") return outcome.results;
    const from = source.page * PAGE_SIZE;
    return outcome.results.map((r) => ({ ...r, rows: r.rows.slice(from, from + PAGE_SIZE) }));
  }, [outcome, source]);

  const msg = "p-4 text-sm text-muted-foreground";
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {outcome === null && (
        <div className={msg}>Ctrl+Enter executa a query (ou apenas a seleção). Clique numa tabela para ver os dados.</div>
      )}
      {outcome?.kind === "running" && <div className={msg}>Executando…</div>}
      {outcome?.kind === "error" && (
        <div className="selectable p-4 text-sm whitespace-pre-wrap text-destructive">{outcome.message}</div>
      )}
      {outcome?.kind === "ok" && (
        <>
          {visible.map((r, i) => <ResultViewer key={i} result={r} table={table} />)}
          {visible.length === 0 && <div className={msg}>Sem resultados.</div>}
        </>
      )}
    </div>
  );
}
