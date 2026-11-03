import { FileText, FolderOpen, Plus, X } from "lucide-react";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DocPane, type DocPaneHandle, type TabStatus } from "./DocPane";
import { type DocumentsApi, isDirty } from "./useDocuments";
import type { TableInfo, TableRef } from "@/types";

/** Commands of the active tab that the app menu and the sidebar can trigger. */
export interface QueryViewHandle {
  run: () => void;
  runAtCursor: () => void;
  format: () => void;
  saveQuery: () => Promise<void>;
  /** Opens a table in a tab of its own (or the empty one on screen), with its SQL in the editor. */
  openTable: (table: TableRef) => void;
  /** Clears the results of every tab (the connection changed). */
  reset: () => void;
}

interface Props {
  ref?: React.Ref<QueryViewHandle>;
  documents: DocumentsApi;
  tables: TableInfo[];
  /** Whether this view is the one on screen (it stays mounted while hidden). */
  visible: boolean;
  /** Info and pagination of the active tab, for the status bar. */
  onStatus: (status: TabStatus) => void;
}

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** Tabs, each with its own SQL editor and results, like DBeaver's editors. */
export function QueryView({ ref, documents, tables, visible, onStatus }: Props) {
  const { docs, active, select, create, change, open, save, close } = documents;
  const panes = useRef(new Map<number, DocPaneHandle>());
  /** What to show in a tab that has just been created, once its pane exists. */
  const [pending, setPending] = useState<{ id: number; show: (pane: DocPaneHandle) => void } | null>(null);
  /** Puts `sql` in the empty untitled tab on screen, or in a new one, and shows its results there. */
  function openIn(sql: string, show: (pane: DocPaneHandle) => void) {
    const blank = active.path === null && active.sql === "";
    if (blank) change(active.id, sql);
    setPending({ id: blank ? active.id : create(sql), show });
  }
  const pane = () => panes.current.get(active.id);

  useImperativeHandle(ref, () => ({
    run: () => pane()?.run(),
    runAtCursor: () => pane()?.runAtCursor(),
    format: () => pane()?.format(),
    saveQuery: () => pane()?.saveQuery() ?? Promise.resolve(),
    openTable: (table) => openIn(`SELECT * FROM ${quote(table.schema)}.${quote(table.name)};`, (p) => p.openTable(table)),
    reset: () => panes.current.forEach((p) => p.reset()),
  }));

  useEffect(() => {
    if (!pending) return;
    const target = panes.current.get(pending.id);
    if (!target) return;
    pending.show(target);
    setPending(null);
  }, [pending]);

  // Put the cursor back in the editor when switching tabs or coming back to this view.
  useEffect(() => {
    if (visible) panes.current.get(active.id)?.focus();
  }, [active.id, visible]);

  // File shortcuts live on the window so they work wherever the focus is inside this view.
  useEffect(() => {
    if (!visible) return;
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      const action =
        key === "s" ? () => save(active.id, e.shiftKey)
        : key === "o" && !e.shiftKey ? open
        : key === "t" && !e.shiftKey ? () => create()
        : key === "w" && !e.shiftKey ? () => close(active.id)
        : key === "f" && e.shiftKey ? () => panes.current.get(active.id)?.format()
        : null;
      if (!action) return;
      e.preventDefault();
      void action();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, active.id, save, open, create, close]);

  return (
    <>
    <div className="flex items-stretch border-b bg-muted/40">
      <div className="flex min-w-0 items-stretch overflow-x-auto">
        {docs.map((d) => (
          <div
            key={d.id}
            title={d.path ?? d.name}
            onClick={() => select(d.id)}
            onAuxClick={(e) => e.button === 1 && close(d.id)}
            className={cn(
              "group flex shrink-0 cursor-pointer items-center gap-1.5 border-r px-3 py-1.5 text-xs text-muted-foreground",
              d.id === active.id && "bg-background text-foreground",
            )}
          >
            <FileText className="size-3.5" />
            <span>{d.name}</span>
            <button
              title="Close (Ctrl+W)"
              onClick={(e) => { e.stopPropagation(); close(d.id); }}
              className="flex size-4 items-center justify-center rounded-sm hover:bg-muted"
            >
              {isDirty(d) ? <span className="size-2 rounded-full bg-primary group-hover:hidden" /> : null}
              <X className={cn("size-3", isDirty(d) && "hidden group-hover:block")} />
            </button>
          </div>
        ))}
      </div>
      <Button variant="ghost" size="icon-xs" className="m-1" title="New file (Ctrl+T)" onClick={() => create()}><Plus /></Button>
      <Button variant="ghost" size="icon-xs" className="my-1" title="Open file (Ctrl+O)" onClick={() => void open()}><FolderOpen /></Button>
    </div>
      {docs.map((d) => (
        <DocPane
          key={d.id}
          ref={(handle) => {
            if (handle) panes.current.set(d.id, handle);
            return () => void panes.current.delete(d.id);
          }}
          doc={d}
          tables={tables}
          active={d.id === active.id}
          onChange={(sql) => change(d.id, sql)}
          onStatus={onStatus}
          onSaveFile={() => void save(d.id)}
          onOpenSql={(sql) => openIn(sql, (p) => p.runSql(sql))}
        />
      ))}
    </>
  );
}
