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
import { environmentOf } from "./lib/environments";
import { cn } from "@/lib/utils";
import { UpdateDialog } from "./components/UpdateDialog";
import { WhatsNewDialog } from "./components/WhatsNewDialog";
import { useUpdater } from "./hooks/useUpdater";
import { useVault } from "./hooks/useVault";
import { releasesBetween, type Release } from "./lib/changelog";
import { APP_VERSION, RELEASES } from "./lib/releases";
import { useConnections } from "./hooks/useConnections";
import { useSession } from "./hooks/useSession";
import { useSettings } from "./hooks/useSettings";
import { useDialogs } from "./hooks/useDialogs";
import { useDocuments } from "./hooks/useDocuments";
import { useResults } from "./hooks/useResults";
import type { Conn, Folder } from "./types";
import { ExportsView } from "./views/ExportsView";
import { HistoryView } from "./views/HistoryView";
import { QueryView, type QueryViewHandle } from "./views/QueryView";
import { SavedView } from "./views/SavedView";

type View = "query" | "history" | "saved" | "exports";

export function App() {
  const dialogs = useDialogs();
  const session = useSession();
  const ensureVault = useVault();
  const { settings, update } = useSettings();
  const ws = useConnections(settings.restoreConnection ? session.initial.connectionId : null);
  const results = useResults();
  const [view, setView] = useState<View>("query");
  const documents = useDocuments();
  /** `undefined` = closed, `null` = new connection, `Conn` = editing. */
  const [dialog, setDialog] = useState<Conn | null | undefined>(undefined);

  const [restored, setRestored] = useState(false);
  const updater = useUpdater();
  /** `null` = closed. `since` is the version the user had before (a post-update notice) or none (the full history). */
  const [notes, setNotes] = useState<{ releases: Release[]; since: string | null } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const queryView = useRef<QueryViewHandle>(null);

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

  // After an update, show what changed since the version the user had before; record this version either way.
  useEffect(() => {
    const seen = session.initial.seenVersion;
    if (seen !== APP_VERSION) {
      const releases = seen === null ? [] : releasesBetween(RELEASES, seen, APP_VERSION);
      if (releases.length > 0) setNotes({ releases, since: seen });
      session.update({ seenVersion: APP_VERSION });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, at startup
  }, []);

  // Look for a new version once at startup. Failing (offline, no release yet) is not worth bothering the user.
  useEffect(() => {
    if (settings.checkForUpdates) updater.lookUp().catch((e) => console.error("Update check failed:", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, at startup
  }, []);

  async function checkForUpdates() {
    try {
      if ((await updater.lookUp()) === "current") await dialogs.alert(`You're up to date (v${APP_VERSION}).`, "Check for updates");
    } catch (e) {
      await dialogs.alert(`Could not check for updates:\n${errText(e)}`, "Check for updates");
    }
  }

  const active = ws.connections.find((c) => c.id === ws.activeId);
  const environment = environmentOf(active);

  function resetWorkspace() {
    results.reset();
    setView("query");
  }

  async function toggle(c: Conn) {
    try {
      if (c.id === ws.activeId) await ws.disconnect();
      else {
        let password: string | undefined;
        let sshSecret: string | undefined;
        if (c.save_password) {
          if (!(await ensureVault())) return;
        } else {
          const typed = await dialogs.prompt(`Password for ${c.user}@${c.host}`, c.name, { secret: true });
          if (typed === null) return;
          password = typed;
          if (c.ssh_enabled && c.ssh_auth !== "agent") {
            const what = c.ssh_auth === "password" ? "SSH password" : "SSH key passphrase (empty if none)";
            const ssh = await dialogs.prompt(`${what} for ${c.ssh_user}@${c.ssh_host}`, c.name, { secret: true });
            if (ssh === null) return;
            sshSecret = ssh;
          }
        }
        await ws.connect(c.id!, password, sshSecret);
      }
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

  const tabs: [View, string][] = [["query", "Query"], ["history", "History"], ["saved", "Saved"], ["exports", "Exports"]];

  return (
    <TooltipProvider>
      <div
        className="grid h-screen"
        style={{
          gridTemplateColumns: `${settings.sidebarWidth}px 1fr`,
          gridTemplateRows: environment ? "auto auto minmax(0,1fr) auto" : "auto minmax(0,1fr) auto",
        }}
      >
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
          checkForUpdates={() => void checkForUpdates()}
          showReleaseHistory={() => setNotes({ releases: RELEASES, since: null })}
          connected={ws.activeId !== null}
        />
        {environment && active && (
          <div className={cn("col-span-2 truncate px-3 py-0.5 text-center text-xs font-semibold tracking-wide uppercase", environment.band)}>
            {environment.label} · {active.name} ({active.database})
          </div>
        )}
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
            {view === "exports" && <ExportsView />}
          </div>
        </main>
        <StatusBar connection={active} info={results.info} paging={results.paging} onPage={results.goToPage} restored={restored} />

        {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
        {notes && (
          <WhatsNewDialog
            title={notes.since ? "PG Studio was updated" : "Release history"}
            description={notes.since ? `What changed since v${notes.since}` : `You have v${APP_VERSION}`}
            releases={notes.releases}
            onClose={() => setNotes(null)}
          />
        )}
        {updater.available && !notes && <UpdateDialog update={updater.available} onClose={updater.dismiss} />}
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
