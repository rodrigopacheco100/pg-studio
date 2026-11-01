import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "../api";
import type { SavedQuery } from "../types";

export function SavedView({ onUse }: { onUse: (sql: string) => void }) {
  const [items, setItems] = useState<SavedQuery[]>([]);
  const load = useCallback(() => api.listSavedQueries().then(setItems), []);
  useEffect(() => void load(), [load]);

  return (
    <ScrollArea className="min-h-0 flex-1">
      {items.length === 0 && <div className="p-4 text-sm text-muted-foreground">Nenhuma query salva.</div>}
      {items.map((q) => (
        <div key={q.id} className="flex items-start gap-3 border-b px-4 py-2 hover:bg-muted/50">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{q.name}</div>
            <pre
              onClick={() => onUse(q.sql)}
              className="cursor-pointer font-mono text-xs break-words whitespace-pre-wrap text-muted-foreground"
            >
              {q.sql}
            </pre>
          </div>
          <Button variant="ghost" size="icon-xs" title="Excluir" onClick={() => api.deleteSavedQuery(q.id!).then(load)}>
            <Trash2 />
          </Button>
        </div>
      ))}
    </ScrollArea>
  );
}
