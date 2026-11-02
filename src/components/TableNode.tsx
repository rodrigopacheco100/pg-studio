import { ChevronRight, Columns3, Eye, KeyRound, Link2, ListOrdered, ShieldCheck, Table2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import { api, errText } from "../api";
import { ItemDetailsDialog } from "./ItemDetailsDialog";
import type { DetailItem, DetailKind, TableInfo, TableRef } from "../types";

const FOLDERS: { kind: DetailKind; label: string; icon: ReactNode; tableOnly: boolean }[] = [
  { kind: "columns", label: "Columns", icon: <Columns3 />, tableOnly: false },
  { kind: "constraints", label: "Constraints", icon: <KeyRound />, tableOnly: true },
  { kind: "foreign_keys", label: "Foreign Keys", icon: <Link2 />, tableOnly: true },
  { kind: "indexes", label: "Indexes", icon: <ListOrdered />, tableOnly: true },
  { kind: "permissions", label: "Permissions", icon: <ShieldCheck />, tableOnly: false },
];

const row = "flex items-center gap-1.5 rounded-md py-1 pr-2 text-sm hover:bg-sidebar-accent";
const icon = "size-3.5 shrink-0 [&_svg]:size-3.5";

function Chevron({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      aria-label={open ? "Collapse" : "Expand"}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
    </button>
  );
}

type Loaded = { items: DetailItem[] } | { error: string } | null;

/** One folder (columns, indexes…) of a table; its contents are fetched the first time it is expanded. */
function Folder({ table, kind, label, icon: folderIcon }: { table: TableInfo; kind: DetailKind; label: string; icon: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Loaded>(null);
  const [selected, setSelected] = useState<string | null>(null);

  function toggle() {
    setOpen(!open);
    if (!open && !loaded) {
      api.tableDetails(table.schema, table.name, kind)
        .then((items) => setLoaded({ items }))
        .catch((e) => setLoaded({ error: errText(e) }));
    }
  }

  return (
    <div>
      <div onClick={toggle} className={cn(row, "cursor-pointer pl-6")}>
        <Chevron open={open} onToggle={toggle} />
        <span className={icon}>{folderIcon}</span>
        <span className="truncate">{label}</span>
        {loaded && "items" in loaded && <span className="text-xs text-muted-foreground">{loaded.items.length}</span>}
      </div>
      {open && (
        <div className="pl-11 text-xs">
          {!loaded && <div className="py-1 text-muted-foreground">Loading…</div>}
          {loaded && "error" in loaded && <div className="py-1 text-destructive">{loaded.error}</div>}
          {loaded && "items" in loaded && loaded.items.length === 0 && <div className="py-1 text-muted-foreground">None</div>}
          {loaded && "items" in loaded &&
            loaded.items.map((it, i) => (
              <div
                key={i}
                title={`${it.name}  ${it.detail}\nDouble-click for details`}
                onDoubleClick={() => setSelected(it.name)}
                className="flex cursor-pointer gap-2 rounded-sm py-0.5 hover:bg-sidebar-accent"
              >
                <span className="shrink-0">{it.name}</span>
                <span className="truncate text-muted-foreground">{it.detail}</span>
              </div>
            ))}
        </div>
      )}
      {selected !== null && (
        <ItemDetailsDialog table={table} kind={kind} name={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

/** A table (or view) in the sidebar: click opens its data, the arrow expands its structure. */
export function TableNode({ table, onOpen }: { table: TableInfo; onOpen: (t: TableRef) => void }) {
  const [open, setOpen] = useState(false);
  const isView = table.kind === "VIEW";
  return (
    <div>
      <div onClick={() => onOpen({ schema: table.schema, name: table.name })} className={cn(row, "cursor-pointer pl-1")}>
        <Chevron open={open} onToggle={() => setOpen(!open)} />
        {isView ? <Eye className={icon} /> : <Table2 className={icon} />}
        <span className="truncate">{table.name}</span>
      </div>
      {open &&
        FOLDERS.filter((f) => !(isView && f.tableOnly)).map((f) => (
          <Folder key={f.kind} table={table} kind={f.kind} label={f.label} icon={f.icon} />
        ))}
    </div>
  );
}
