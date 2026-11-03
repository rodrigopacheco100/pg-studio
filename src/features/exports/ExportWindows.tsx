import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useExports } from "./useExports";
import { formatBytes, formatDuration, isRunning, percent, rowsText, STATUS_LABELS } from "./exportProgress";
import { formatLabel } from "./exportResult";
import type { ExportEntry } from "@/types";

/** Progress bar; without a percentage (total not known yet) it shows a pulsing stripe. */
function Progress({ entry }: { entry: ExportEntry }) {
  const pct = percent(entry);
  return (
    <div
      role="progressbar"
      aria-label={`Export of ${entry.source}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct ?? undefined}
      className="h-1.5 overflow-hidden rounded-full bg-muted"
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width]",
          entry.status === "failed" ? "bg-destructive" : entry.status === "cancelled" ? "bg-muted-foreground" : "bg-primary",
          pct === null && "animate-pulse",
        )}
        style={{ width: `${pct ?? 30}%` }}
      />
    </div>
  );
}

function ExportWindow({ entry }: { entry: ExportEntry }) {
  const { minimized, toggleMinimized, cancel, close } = useExports();
  const running = isRunning(entry);
  const isMinimized = minimized.has(entry.id);
  const pct = percent(entry);

  return (
    <div role="dialog" aria-label={`Export ${entry.source}`} className="pointer-events-auto rounded-lg border bg-popover text-popover-foreground shadow-lg">
      <div className="flex items-center gap-1 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium" title={entry.source}>{entry.source} → {formatLabel(entry.format)}</div>
          <div className={cn("text-xs text-muted-foreground", entry.status === "failed" && "text-destructive")}>
            {STATUS_LABELS[entry.status]}{pct !== null && ` · ${pct}%`}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={isMinimized ? "Expand" : "Minimize"}
          title={isMinimized ? "Expand" : "Minimize"}
          onClick={() => toggleMinimized(entry.id)}
        >
          {isMinimized ? <ChevronDown /> : <ChevronUp />}
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Close"
          title={running ? "Cancel the export first" : "Close"}
          disabled={running}
          onClick={() => close(entry.id)}
        >
          <X />
        </Button>
      </div>
      <div className="px-3 pb-2"><Progress entry={entry} /></div>
      {!isMinimized && (
        <div className="flex flex-col gap-2 border-t px-3 py-2 text-xs">
          <div className="flex justify-between gap-2 text-muted-foreground">
            <span>{rowsText(entry)}</span>
            <span>
              {formatBytes(entry.bytes)}
              {entry.duration_ms !== null && ` · ${formatDuration(entry.duration_ms)}`}
            </span>
          </div>
          <div className="selectable break-all text-muted-foreground" title={entry.path}>{entry.path}</div>
          {entry.error && <div className="selectable break-words text-destructive">{entry.error}</div>}
          {running && (
            <div className="flex justify-end">
              <Button size="xs" variant="outline" onClick={() => void cancel(entry.id)}>Cancel</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** One floating window per export of this session, stacked at the top right over every view. */
export function ExportWindows() {
  const { entries, windows } = useExports();
  const shown = windows.map((id) => entries.find((e) => e.id === id)).filter((e): e is ExportEntry => !!e);
  if (shown.length === 0) return null;
  return (
    <div className="pointer-events-none fixed top-12 right-4 z-50 flex w-80 flex-col gap-2">
      {shown.map((e) => <ExportWindow key={e.id} entry={e} />)}
    </div>
  );
}
