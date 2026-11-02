import { useRef, useState } from "react";
import { ChevronRight, Database, Folder, FolderOpen, FolderPlus, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useSettings } from "../hooks/useSettings";
import { ResizeHandle } from "./ResizeHandle";
import { TableNode } from "./TableNode";
import type { Conn, Folder as FolderT, TableInfo, TableRef } from "../types";

interface Props {
  connections: Conn[];
  folders: FolderT[];
  onMoveConnection: (id: number, folderId: number | null, beforeId: number | null) => void;
  onMoveFolder: (id: number, beforeId: number | null) => void;
  onNewFolder: () => void;
  onRenameFolder: (f: FolderT) => void;
  onDeleteFolder: (f: FolderT) => void;
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
  // Drag and drop of connections (into folders, reordering) and folders (reordering); `over` marks the drop target.
  const drag = useRef<{ kind: "conn" | "folder"; id: number } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const browsing = p.activeId === null;
  const topLevel = p.connections.filter((c) => c.folder_id === null || !p.folders.some((f) => f.id === c.folder_id));

  function start(e: React.DragEvent, d: NonNullable<typeof drag.current>) {
    drag.current = d;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(d.id)); // required by some webviews to start a drag
  }
  function lowerHalf(e: React.DragEvent) {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientY > r.top + r.height / 2;
  }
  function allow(e: React.DragEvent, key: string) {
    if (!drag.current) return;
    e.preventDefault();
    e.stopPropagation();
    setOver(key);
  }

  const row = (c: Conn) => (
    <li
      key={c.id}
      draggable={browsing}
      onDragStart={(e) => start(e, { kind: "conn", id: c.id! })}
      onDragEnd={() => { drag.current = null; setOver(null); }}
      onDragOver={(e) => drag.current?.kind === "conn" && allow(e, `c${c.id}${lowerHalf(e) ? ":after" : ""}`)}
      onDrop={(e) => {
        e.preventDefault();
        if (drag.current?.kind === "conn") {
          // Lower half = after this row, i.e. before its next sibling (or at the end of the folder).
          const siblings = p.connections.filter((x) => x.folder_id === c.folder_id);
          const before = lowerHalf(e) ? (siblings[siblings.indexOf(c) + 1]?.id ?? null) : c.id;
          p.onMoveConnection(drag.current.id, c.folder_id, before);
        }
        drag.current = null;
        setOver(null);
      }}
      onClick={() => p.onToggle(c)}
      className={cn(
        "group relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-sidebar-accent",
        c.id === p.activeId && "bg-sidebar-accent font-medium text-sidebar-primary",
        over === `c${c.id}` && "border-t-2 border-sidebar-primary",
        over === `c${c.id}:after` && "border-b-2 border-sidebar-primary",
      )}
    >
      <Database className="size-4 shrink-0" />
      <span className="min-w-0 flex-1" title={`${c.user}@${c.host}:${c.port}/${c.database}`}>
        <span className="block truncate">{c.name}</span>
        {/* Follows the name's color (selection) but a bit dimmer. */}
        <span
          className={cn(
            "block truncate text-xs font-normal",
            c.id === p.activeId ? "text-sidebar-primary/70" : "text-muted-foreground",
          )}
        >
          {c.user}@{c.host}:{c.port}/{c.database}
        </span>
      </span>
      {/* Overlaid instead of laid out, so showing it on hover never changes the row's size. */}
      <span className="absolute inset-y-0 right-1 hidden items-center gap-0.5 rounded-md bg-sidebar-accent pl-1 group-hover:flex">
        <Button variant="ghost" size="icon-xs" title="Edit" onClick={(e) => { e.stopPropagation(); p.onEdit(c); }}>
          <Pencil />
        </Button>
        <Button variant="ghost" size="icon-xs" title="Delete" onClick={(e) => { e.stopPropagation(); p.onDelete(c); }}>
          <Trash2 />
        </Button>
      </span>
    </li>
  );

  return (
    <aside className="relative flex min-h-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <ResizeHandle axis="x" size={settings.sidebarWidth} min={180} max={560} onChange={(sidebarWidth) => update({ sidebarWidth })} />
      {/* Dropping on the header (above the list) moves to the start. */}
      <div
        className={cn(browsing && over === "start" && "border-b-2 border-sidebar-primary")}
        onDragOver={(e) => browsing && allow(e, "start")}
        onDrop={(e) => {
          e.preventDefault();
          if (drag.current?.kind === "conn") p.onMoveConnection(drag.current.id, null, topLevel[0]?.id ?? null);
          else if (drag.current) p.onMoveFolder(drag.current.id, p.folders[0]?.id ?? null);
          drag.current = null;
          setOver(null);
        }}
      >
      <SectionHeader title="Connections">
        <span className="flex gap-0.5">
          <Button variant="ghost" size="icon-xs" title="New folder" onClick={p.onNewFolder}>
            <FolderPlus />
          </Button>
          <Button variant="ghost" size="icon-xs" title="New connection" onClick={p.onNew}>
            <Plus />
          </Button>
        </span>
      </SectionHeader>
      </div>
      <ul className={cn("px-1.5", browsing && "flex min-h-0 flex-1 flex-col")} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}>
        {/* Once connected, only the active connection stays, giving the tables the room; disconnecting lists all again. */}
        {browsing ? (
          <>
            {p.folders.map((f) => {
              const open = !collapsed.has(f.id);
              const folderOver = over === `f${f.id}`;
              return (
                <li key={`f${f.id}`}>
                  <div
                    draggable
                    onDragStart={(e) => start(e, { kind: "folder", id: f.id })}
                    onDragEnd={() => { drag.current = null; setOver(null); }}
                    onDragOver={(e) => allow(e, `f${f.id}`)}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (drag.current?.kind === "conn") p.onMoveConnection(drag.current.id, f.id, null);
                      else if (drag.current) p.onMoveFolder(drag.current.id, f.id);
                      drag.current = null;
                      setOver(null);
                    }}
                    onClick={() => setCollapsed((c) => { const n = new Set(c); if (!n.delete(f.id)) n.add(f.id); return n; })}
                    className={cn(
                      "group relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-sidebar-accent",
                      folderOver && (drag.current?.kind === "conn" ? "bg-sidebar-accent ring-1 ring-sidebar-primary" : "border-t-2 border-sidebar-primary"),
                    )}
                  >
                    <ChevronRight className={cn("size-4 shrink-0 transition-transform", open && "rotate-90")} />
                    {open ? <FolderOpen className="size-4 shrink-0" /> : <Folder className="size-4 shrink-0" />}
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="absolute inset-y-0 right-1 hidden items-center gap-0.5 rounded-md bg-sidebar-accent pl-1 group-hover:flex">
                      <Button variant="ghost" size="icon-xs" title="Rename folder" onClick={(e) => { e.stopPropagation(); p.onRenameFolder(f); }}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon-xs" title="Delete folder" onClick={(e) => { e.stopPropagation(); p.onDeleteFolder(f); }}>
                        <Trash2 />
                      </Button>
                    </span>
                  </div>
                  {open && (
                    <ul className="ml-4 border-l pl-1">
                      {p.connections.filter((c) => c.folder_id === f.id).map(row)}
                    </ul>
                  )}
                </li>
              );
            })}
            {topLevel.map(row)}
            {/* Drop zone below the list, filling the free space: moves to the end of the top level, or the folder to the end. */}
            <li
              className={cn("min-h-4 flex-1", over === "end" && "border-t-2 border-sidebar-primary")}
              onDragOver={(e) => allow(e, "end")}
              onDrop={(e) => {
                e.preventDefault();
                if (drag.current?.kind === "conn") p.onMoveConnection(drag.current.id, null, null);
                else if (drag.current) p.onMoveFolder(drag.current.id, null);
                drag.current = null;
                setOver(null);
              }}
            />
          </>
        ) : (
          p.connections.filter((c) => c.id === p.activeId).map(row)
        )}
        {p.connections.length === 0 && p.folders.length === 0 && (
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
