import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Paging } from "../hooks/useResults";
import type { Conn, RunInfo } from "../types";

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;

function formatMs(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}

interface Props {
  connection?: Conn;
  info: RunInfo | null;
  paging: Paging | null;
  onPage: (page: number) => void;
  /** A conexão caiu e foi reaberta: transações abertas e SET da sessão foram perdidos. */
  restored: boolean;
}

export function StatusBar({ connection, info, paging, onPage, restored }: Props) {
  const parts: string[] = [];
  if (info && info.status !== "running") {
    if (info.statements !== undefined && info.statements > 1) parts.push(plural(info.statements, "instrução", "instruções"));
    if (info.rows !== undefined) parts.push(plural(info.rows, "linha", "linhas"));
    if (info.affected !== undefined) parts.push(plural(info.affected, "linha afetada", "linhas afetadas"));
    if (info.durationMs !== undefined) parts.push(formatMs(info.durationMs));
  }

  return (
    <footer className="col-span-2 flex items-center justify-between gap-4 border-t bg-sidebar px-3 py-1 text-xs text-muted-foreground">
      <span className="truncate">
        {connection ? `${connection.user}@${connection.host}:${connection.port}/${connection.database}` : "Desconectado"}
      </span>
      {restored && (
        <span className="text-primary">Conexão reiniciada — transações abertas e SET da sessão foram perdidos</span>
      )}
      {info && (
        <span
          className={cn("truncate", info.status === "ok" && "text-primary", info.status === "error" && "text-destructive")}
          title={info.message}
        >
          {info.status === "running" && `${info.label} · executando…`}
          {info.status === "ok" && [info.label, ...parts].join(" · ")}
          {info.status === "error" && [info.label, "erro", ...parts].join(" · ")}
        </span>
      )}
      {paging && (
        <span className="flex items-center gap-1 text-foreground">
          <Button variant="ghost" size="icon-xs" title="Primeira página" disabled={paging.page === 0} onClick={() => onPage(0)}>
            <ChevronsLeft />
          </Button>
          <Button variant="ghost" size="icon-xs" title="Página anterior" disabled={paging.page === 0} onClick={() => onPage(paging.page - 1)}>
            <ChevronLeft />
          </Button>
          <span className="px-1">
            página {(paging.page + 1).toLocaleString("pt-BR")} de {paging.pageCount?.toLocaleString("pt-BR") ?? "…"}
          </span>
          <Button variant="ghost" size="icon-xs" title="Próxima página" disabled={!paging.hasNext} onClick={() => onPage(paging.page + 1)}>
            <ChevronRight />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title="Última página"
            disabled={paging.pageCount === null || !paging.hasNext}
            onClick={() => onPage(paging.pageCount! - 1)}
          >
            <ChevronsRight />
          </Button>
          <span className="ml-1 text-muted-foreground">
            {paging.total === null ? "contando registros…" : `${plural(paging.total, "registro", "registros")} no total`}
          </span>
        </span>
      )}
    </footer>
  );
}
