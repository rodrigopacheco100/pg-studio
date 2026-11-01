import { useCallback, useMemo, useRef, useState } from "react";
import { api, errText } from "../api";
import type { QueryResult, RunInfo, TableRef } from "../types";

export const PAGE_SIZE = 100;

export type Outcome =
  | { kind: "running" }
  | { kind: "ok"; results: QueryResult[] }
  | { kind: "error"; message: string };

/** O que o painel de resultados está mostrando. A página de uma query é fatiada no cliente. */
export type Source = { kind: "query"; page: number } | { kind: "table"; table: TableRef; page: number };

/** Paginação do que está na tela; `total` ignora a página atual. */
export interface Paging {
  page: number;
  /** Total de registros; `null` enquanto a contagem em segundo plano não termina (ou se falhou). */
  total: number | null;
  pageCount: number | null;
  hasNext: boolean;
}

const tableKey = (t: TableRef) => `${t.schema}.${t.name}`;

/**
 * Estado único do painel de resultados, compartilhado por queries e tabelas abertas.
 * Só a última requisição vale: respostas atrasadas de requisições antigas são descartadas.
 */
export function useResults() {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [source, setSource] = useState<Source>({ kind: "query", page: 0 });
  const [info, setInfo] = useState<RunInfo | null>(null);
  const [tableTotal, setTableTotal] = useState<number | null>(null);
  const current = useRef(0);
  const countSeq = useRef(0);
  const countedTable = useRef<string | null>(null);

  const runQuery = useCallback(async (sql: string) => {
    const id = ++current.current;
    const label = "Query";
    setSource({ kind: "query", page: 0 });
    setOutcome({ kind: "running" });
    setInfo({ label, status: "running" });
    const started = performance.now();
    try {
      const out = await api.runQuery(sql);
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
      // O servidor não devolve a duração de uma query que falhou; usa o tempo medido aqui.
      setInfo({ label, status: "error", durationMs: Math.round(performance.now() - started), message });
    }
  }, []);

  /** Conta em segundo plano: a página aparece sem esperar o total. */
  const countInBackground = useCallback((table: TableRef) => {
    const seq = ++countSeq.current;
    countedTable.current = tableKey(table);
    setTableTotal(null);
    api
      .tableCount(table.schema, table.name)
      .then((n) => seq === countSeq.current && setTableTotal(n))
      .catch(() => {}); // sem total (ex.: sem permissão ou cancelada): a paginação segue sem a contagem
  }, []);

  const openTable = useCallback(
    async (table: TableRef, page = 0) => {
      const id = ++current.current;
      const label = `${tableKey(table)} · página ${page + 1}`;
      setSource({ kind: "table", table, page });
      setOutcome({ kind: "running" });
      setInfo({ label, status: "running" });
      // Reabrir a mesma tabela na página 0 recalcula o total; trocar de página reaproveita.
      if (page === 0 || countedTable.current !== tableKey(table)) countInBackground(table);
      const started = performance.now();
      const elapsed = () => Math.round(performance.now() - started);
      try {
        const data = await api.tableData(table.schema, table.name, PAGE_SIZE, page * PAGE_SIZE);
        if (id !== current.current) return;
        setOutcome({ kind: "ok", results: [data] });
        setInfo({ label, status: "ok", durationMs: elapsed(), rows: data.rows.length });
      } catch (e) {
        if (id !== current.current) return;
        const message = errText(e);
        setOutcome({ kind: "error", message });
        setInfo({ label, status: "error", durationMs: elapsed(), message });
      }
    },
    [countInBackground],
  );

  const goToPage = useCallback(
    (page: number) => {
      if (source.kind === "table") void openTable(source.table, page);
      else setSource({ kind: "query", page });
    },
    [source, openTable],
  );

  const reset = useCallback(() => {
    current.current++;
    countSeq.current++;
    countedTable.current = null;
    setOutcome(null);
    setSource({ kind: "query", page: 0 });
    setInfo(null);
    setTableTotal(null);
  }, []);

  const paging = useMemo<Paging | null>(() => {
    if (outcome?.kind !== "ok" || !outcome.results.some((r) => r.columns.length > 0)) return null;
    const pageCountOf = (total: number) => Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (source.kind === "table") {
      const pageCount = tableTotal === null ? null : pageCountOf(tableTotal);
      const onPage = outcome.results[0].rows.length;
      const hasNext = pageCount === null ? onPage === PAGE_SIZE : source.page + 1 < pageCount;
      return { page: source.page, total: tableTotal, pageCount, hasNext };
    }
    const total = Math.max(...outcome.results.map((r) => r.rows.length));
    const pageCount = pageCountOf(total);
    return { page: source.page, total, pageCount, hasNext: source.page + 1 < pageCount };
  }, [outcome, source, tableTotal]);

  return { outcome, source, info, paging, runQuery, openTable, goToPage, reset };
}

export type ResultsApi = ReturnType<typeof useResults>;
