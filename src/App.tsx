import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConnectionDialog } from "./components/ConnectionDialog";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { errText } from "./api";
import { useConnections } from "./hooks/useConnections";
import { useSettings } from "./hooks/useSettings";
import { useResults } from "./hooks/useResults";
import type { Conn } from "./types";
import { HistoryView } from "./views/HistoryView";
import { QueryView } from "./views/QueryView";
import { SavedView } from "./views/SavedView";

type View = "query" | "history" | "saved";

export function App() {
  const ws = useConnections();
  const results = useResults();
  const [view, setView] = useState<View>("query");
  const [sql, setSql] = useState("");
  /** `undefined` = closed, `null` = new connection, `Conn` = editing. */
  const [dialog, setDialog] = useState<Conn | null | undefined>(undefined);

  const [restored, setRestored] = useState(false);
  const { settings, update } = useSettings();

  // The backend reopens the connection by itself when it drops; warns because the database session starts over.
  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    let timer: number | undefined;
    listen("connection-restored", () => {
      setRestored(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setRestored(false), 10000);
    }).then((unlisten) => (cancelled ? unlisten() : (off = unlisten)));
    return () => {
      cancelled = true;
      off?.();
      window.clearTimeout(timer);
    };
  }, []);

  const active = ws.connections.find((c) => c.id === ws.activeId);

  function resetWorkspace() {
    results.reset();
    setView("query");
  }

  async function toggle(c: Conn) {
    try {
      if (c.id === ws.activeId) await ws.disconnect();
      else await ws.connect(c.id!);
      resetWorkspace();
    } catch (e) {
      alert(`Failed to connect:\n${errText(e)}`);
    }
  }

  async function remove(c: Conn) {
    if (!confirm("Delete this connection?")) return;
    const wasActive = c.id === ws.activeId;
    await ws.remove(c.id!);
    if (wasActive) resetWorkspace();
  }

  function useSql(text: string) {
    setSql(text);
    setView("query");
  }

  const tabs: [View, string][] = [["query", "Query"], ["history", "History"], ["saved", "Saved"]];

  return (
    <TooltipProvider>
      <div className="grid h-screen grid-rows-[minmax(0,1fr)_auto]" style={{ gridTemplateColumns: `${settings.sidebarWidth}px 1fr` }}>
        <Sidebar
          connections={ws.connections}
          activeId={ws.activeId}
          tables={ws.tables}
          onNew={() => setDialog(null)}
          onEdit={setDialog}
          onDelete={remove}
          onToggle={toggle}
          onOpenTable={(t) => { setView("query"); void results.openTable(t); }}
          onRefreshTables={() => ws.refreshTables().catch((e) => alert(errText(e)))}
        />
        <main className="flex min-h-0 min-w-0 flex-col">
          <div className="flex items-center justify-between border-b px-2 pt-1">
            <Tabs value={view} onValueChange={(v) => setView(v as View)}>
              <TabsList variant="line">
                {tabs.map(([v, label]) => <TabsTrigger key={v} value={v}>{label}</TabsTrigger>)}
              </TabsList>
            </Tabs>
            <span className="pr-2 text-xs text-muted-foreground">
              {ws.connecting ? "Connecting…" : active ? `${active.name} (${active.database})` : ""}
            </span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Kept mounted to preserve the editor (cursor, undo) when switching tabs. */}
            <div className="flex min-h-0 flex-1 flex-col" hidden={view !== "query"}>
              <QueryView sql={sql} tables={ws.tables} onSqlChange={setSql} results={results} />
            </div>
            {view === "history" && <HistoryView onUse={useSql} />}
            {view === "saved" && <SavedView onUse={useSql} />}
          </div>
        </main>
        <StatusBar connection={active} info={results.info} paging={results.paging} onPage={results.goToPage} restored={restored} />

        {dialog !== undefined && (
          <ConnectionDialog
            initial={dialog}
            onClose={() => setDialog(undefined)}
            onSaved={() => { setDialog(undefined); void ws.reload(); }}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
