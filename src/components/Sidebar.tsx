import { useRef } from "react";
import { Database, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useSettings } from "../hooks/useSettings";
import { ResizeHandle } from "./ResizeHandle";
import { TableNode } from "./TableNode";
import type { Conn, TableInfo, TableRef } from "../types";

interface Props {
  connections: Conn[];
  activeId: number | null;
  tables: TableInfo[];
  onNew: () => void;
  onEdit: (c: Conn) => void;
  onDelete: (c: Conn) => void;
  onToggle: (c: Conn) => void;
  onOpenTable: (t: TableRef) => void;
  onRefreshTables: () => void;
}

function SectionHeader({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 pt-3 pb-1">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</span>
      {children}
    </div>
  );
}

export function Sidebar(p: Props) {
  const { settings, update } = useSettings();
  let lastSchema = "";
  // A refresh or reconnection yields a new table list; remounting collapses the nodes and drops their cached details.
  const epoch = useRef(0);
  const seen = useRef(p.tables);
  if (seen.current !== p.tables) {
    seen.current = p.tables;
    epoch.current++;
  }
  return (
    <aside className="relative flex min-h-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <ResizeHandle axis="x" size={settings.sidebarWidth} min={180} max={560} onChange={(sidebarWidth) => update({ sidebarWidth })} />
      <SectionHeader title="Connections">
        <Button variant="ghost" size="icon-xs" title="New connection" onClick={p.onNew}>
          <Plus />
        </Button>
      </SectionHeader>
      <ul className="px-1.5">
        {p.connections.map((c) => (
          <li
            key={c.id}
            onClick={() => p.onToggle(c)}
            className={cn(
              "group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent",
              c.id === p.activeId && "bg-sidebar-accent font-medium text-sidebar-primary",
            )}
          >
            <Database className="size-4 shrink-0" />
            <span className="flex-1 truncate" title={`${c.user}@${c.host}:${c.port}/${c.database}`}>{c.name}</span>
            <span className="hidden gap-0.5 group-hover:flex">
              <Button variant="ghost" size="icon-xs" title="Edit" onClick={(e) => { e.stopPropagation(); p.onEdit(c); }}>
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon-xs" title="Delete" onClick={(e) => { e.stopPropagation(); p.onDelete(c); }}>
                <Trash2 />
              </Button>
            </span>
          </li>
        ))}
        {p.connections.length === 0 && (
          <li className="px-2 py-1.5 text-sm text-muted-foreground">No connections. Click + to create one.</li>
        )}
      </ul>

      {p.activeId !== null && (
        <>
          <SectionHeader title="Tables">
            <Button variant="ghost" size="icon-xs" title="Refresh" onClick={p.onRefreshTables}>
              <RefreshCw />
            </Button>
          </SectionHeader>
          <ScrollArea className="min-h-0 flex-1">
            <div className="px-1.5 pb-2">
              {p.tables.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">No tables.</div>}
              {p.tables.map((t) => {
                const header = t.schema !== lastSchema;
                lastSchema = t.schema;
                return (
                  <div key={`${t.schema}.${t.name}`}>
                    {header && <div className="px-2 pt-2 pb-0.5 text-xs text-muted-foreground">{t.schema}</div>}
                    <TableNode key={epoch.current} table={t} onOpen={p.onOpenTable} />
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </>
      )}
    </aside>
  );
}
