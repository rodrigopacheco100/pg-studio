import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { api } from "../api";
import type { HistoryEntry } from "../types";

export function HistoryView({ onUse }: { onUse: (sql: string) => void }) {
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const load = useCallback(() => api.listHistory().then(setItems), []);
  useEffect(() => void load(), [load]);

  return (
    <>
      <div className="flex items-center border-b px-3 py-2">
        <Button variant="outline" size="sm" onClick={() => api.clearHistory().then(load)}>
          <Trash2 /> Clear history
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {items.length === 0 && <div className="p-4 text-sm text-muted-foreground">History is empty.</div>}
        {items.map((h) => (
          <div key={h.id} className="flex items-start gap-3 border-b px-4 py-2 hover:bg-muted/50">
            <pre
              onClick={() => onUse(h.sql)}
              className="flex-1 cursor-pointer font-mono text-xs break-words whitespace-pre-wrap"
            >
              {h.sql}
            </pre>
            <span className={cn("shrink-0 text-xs text-muted-foreground", h.error && "text-destructive")}>
              {h.ran_at} · {h.duration_ms} ms{h.error ? " · error" : ""}
            </span>
          </div>
        ))}
      </ScrollArea>
    </>
  );
}
