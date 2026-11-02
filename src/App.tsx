import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppMenu } from "./components/AppMenu";
import { SettingsDialog } from "./components/SettingsDialog";
import { ConnectionDialog } from "./components/ConnectionDialog";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { errText } from "./api";
import { useConnections } from "./hooks/useConnections";
import { useSession } from "./hooks/useSession";
import { useSettings } from "./hooks/useSettings";
import { useDialogs } from "./hooks/useDialogs";
import { useDocuments } from "./hooks/useDocuments";
import { useResults } from "./hooks/useResults";
import type { Conn, Folder } from "./types";
import { HistoryView } from "./views/HistoryView";
import { QueryView, type QueryViewHandle } from "./views/QueryView";
import { SavedView } from "./views/SavedView";

type View = "query" | "history" | "saved";

export function App() {
  const dialogs = useDialogs();
  const session = useSession();
  const ws = useConnections(session.initial.connectionId);
  const results = useResults();
  const [view, setView] = useState<View>("query");
  const documents = useDocuments();
  /** `undefined` = closed, `null` = new connection, `Conn` = editing. */
  const [dialog, setDialog] = useState<Conn | null | undefined>(undefined);

  const [restored, setRestored] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const queryView = useRef<QueryViewHandle>(null);
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
      session.update({ connectionId: ws.activeId === c.id ? null : c.id });
      resetWorkspace();
    } catch (e) {
      void dialogs.alert(`Failed to connect:\n${errText(e)}`);
    }
  }

  async function remove(c: Conn) {
    if (!(await dialogs.confirm("Delete this connection?", { title: "Delete connection", confirmLabel: "Delete" }))) return;
    const wasActive = c.id === ws.activeId;
    await ws.remove(c.id!);
    if (wasActive) {
      session.update({ connectionId: null });
      resetWorkspace();
    }
  }

  async function newFolder() {
    const name = (await dialogs.prompt("Folder name", "New folder"))?.trim();
    if (name) await ws.createFolder(name).catch((e) => dialogs.alert(errText(e)));
  }

  async function renameFolder(f: Folder) {
    const name = (await dialogs.prompt(`New name for "${f.name}"`, "Rename folder"))?.trim();
    if (name) await ws.renameFolder(f.id, name).catch((e) => dialogs.alert(errText(e)));
  }

  async function deleteFolder(f: Folder) {
    if (!(await dialogs.confirm(`Delete folder "${f.name}"? Its connections are kept at the top level.`, { title: "Delete folder", confirmLabel: "Delete" }))) return;
    await ws.deleteFolder(f.id).catch((e) => dialogs.alert(errText(e)));
  }

  function useSql(text: string) {
    documents.create(text);
    setView("query");
  }

  const tabs: [View, string][] = [["query", "Query"], ["history", "History"], ["saved", "Saved"]];

  return (
    <TooltipProvider>
      <div className="grid h-screen grid-rows-[auto_minmax(0,1fr)_auto]" style={{ gridTemplateColumns: `${settings.sidebarWidth}px 1fr` }}>
        <AppMenu
          newFile={() => { setView("query"); documents.create(); }}
          openFile={() => { setView("query"); void documents.open(); }}
          saveFile={() => void documents.save(documents.active.id)}
          saveFileAs={() => void documents.save(documents.active.id, true)}
          closeTab={() => void documents.close(documents.active.id)}
          run={() => { setView("query"); queryView.current?.run(); }}
          runAtCursor={() => { setView("query"); queryView.current?.runAtCursor(); }}
          beautify={() => { setView("query"); queryView.current?.format(); }}
          saveQuery={() => void queryView.current?.saveQuery()}
          newConnection={() => setDialog(null)}
          refreshTables={() => ws.refreshTables().catch((e) => dialogs.alert(errText(e)))}
          openSettings={() => setSettingsOpen(true)}
          connected={ws.activeId !== null}
        />
        <Sidebar
          connections={ws.connections}
          folders={ws.folders}
          onMoveConnection={ws.move}
          onMoveFolder={ws.moveFolder}
          onNewFolder={() => void newFolder()}
          onRenameFolder={(f) => void renameFolder(f)}
          onDeleteFolder={(f) => void deleteFolder(f)}
          activeId={ws.activeId}
          tables={ws.tables}
          onNew={() => setDialog(null)}
          onEdit={setDialog}
          onDelete={remove}
          onToggle={toggle}
          onOpenTable={(t) => { setView("query"); void results.openTable(t); }}
          onRefreshTables={() => ws.refreshTables().catch((e) => dialogs.alert(errText(e)))}
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
              <QueryView ref={queryView} documents={documents} tables={ws.tables} results={results} visible={view === "query"} />
            </div>
            {view === "history" && <HistoryView onUse={useSql} />}
            {view === "saved" && <SavedView onUse={useSql} />}
          </div>
        </main>
        <StatusBar connection={active} info={results.info} paging={results.paging} onPage={results.goToPage} restored={restored} />

        {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
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
