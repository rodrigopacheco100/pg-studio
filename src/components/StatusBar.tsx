import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Paging } from "../hooks/useResults";
import type { Conn, RunInfo } from "../types";

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

function formatMs(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}

interface Props {
  connection?: Conn;
  info: RunInfo | null;
  paging: Paging | null;
  onPage: (page: number) => void;
  /** The connection dropped and was reopened: open transactions and session SET were lost. */
  restored: boolean;
}

export function StatusBar({ connection, info, paging, onPage, restored }: Props) {
  const parts: string[] = [];
  if (info && info.status !== "running") {
    if (info.statements !== undefined && info.statements > 1) parts.push(plural(info.statements, "statement", "statements"));
    if (info.rows !== undefined) parts.push(plural(info.rows, "row", "rows"));
    if (info.affected !== undefined) parts.push(plural(info.affected, "row affected", "rows affected"));
    if (info.durationMs !== undefined) parts.push(formatMs(info.durationMs));
  }

  return (
    <footer className="col-span-2 flex items-center justify-between gap-4 border-t bg-sidebar px-3 py-1 text-xs text-muted-foreground">
      <span className="truncate">
        {connection ? `${connection.user}@${connection.host}:${connection.port}/${connection.database}` : "Disconnected"}
      </span>
      {restored && (
        <span className="text-primary">Connection restarted — open transactions and session SET were lost</span>
      )}
      {info && (
        <span
          className={cn("truncate text-muted-foreground", info.status === "error" && "text-destructive")}
          title={info.message}
        >
          {info.status === "running" && `${info.label} · running…`}
          {info.status === "ok" && [info.label, ...parts].join(" · ")}
          {info.status === "error" && [info.label, "error", ...parts].join(" · ")}
        </span>
      )}
      {paging && (
        <span className="flex items-center gap-1 text-foreground">
          <Button variant="ghost" size="icon-xs" title="First page" disabled={paging.page === 0} onClick={() => onPage(0)}>
            <ChevronsLeft />
          </Button>
          <Button variant="ghost" size="icon-xs" title="Previous page" disabled={paging.page === 0} onClick={() => onPage(paging.page - 1)}>
            <ChevronLeft />
          </Button>
          <span className="px-1">
            page {(paging.page + 1).toLocaleString("en-US")} of {paging.pageCount?.toLocaleString("en-US") ?? "…"}
          </span>
          <Button variant="ghost" size="icon-xs" title="Next page" disabled={!paging.hasNext} onClick={() => onPage(paging.page + 1)}>
            <ChevronRight />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title="Last page"
            disabled={paging.pageCount === null || !paging.hasNext}
            onClick={() => onPage(paging.pageCount! - 1)}
          >
            <ChevronsRight />
          </Button>
          <span className="ml-1 text-muted-foreground">
            {paging.total === null ? "counting records…" : `${plural(paging.total, "record", "records")} total`}
          </span>
        </span>
      )}
    </footer>
  );
}
