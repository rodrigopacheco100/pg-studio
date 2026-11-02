import { Trash2 } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useExports } from "../hooks/useExports";
import { formatBytes, formatDuration, isRunning, percent, rowsText, STATUS_LABELS } from "../lib/exportProgress";
import { formatLabel } from "../lib/exportResult";

/** History of file exports, with how each one went. */
export function ExportsView() {
  const { entries, refresh, clear } = useExports();
  useEffect(() => void refresh().catch(() => {}), [refresh]);

  return (
    <>
      <div className="flex items-center border-b px-3 py-2">
        <Button variant="outline" size="sm" disabled={entries.every(isRunning)} onClick={() => void clear()}>
          <Trash2 /> Clear finished
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {entries.length === 0 && <div className="p-4 text-sm text-muted-foreground">No exports yet. Right-click the results and choose Export all rows.</div>}
        {entries.map((e) => (
          <div key={e.id} className="flex flex-col gap-0.5 border-b px-4 py-2 text-sm" data-export={e.id}>
            <div className="flex items-baseline gap-3">
              <span className="font-medium">{e.source} → {formatLabel(e.format)}</span>
              <span className={cn("text-xs", e.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
                {STATUS_LABELS[e.status]}{isRunning(e) && percent(e) !== null ? ` · ${percent(e)}%` : ""}
              </span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{e.started_at} UTC</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {rowsText(e)} · {formatBytes(e.bytes)}{e.duration_ms !== null && ` · ${formatDuration(e.duration_ms)}`}
            </div>
            <div className="selectable text-xs break-all text-muted-foreground">{e.path}</div>
            {e.error && <div className="selectable text-xs break-words text-destructive">{e.error}</div>}
          </div>
        ))}
      </ScrollArea>
    </>
  );
}
