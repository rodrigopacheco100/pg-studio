import { AlignLeft, FileText, FolderOpen, Play, Plus, Save, SaveAll, Square, X } from "lucide-react";
import { useEffect, useImperativeHandle, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/api";
import { ResizeHandle } from "@/components/ResizeHandle";
import { ResultsPane } from "@/features/results/ResultsPane";
import { SqlEditor, type SqlEditorHandle } from "./SqlEditor";
import { destructiveStatements } from "./destructive";
import { useDialogs } from "@/hooks/useDialogs";
import { type DocumentsApi, isDirty } from "./useDocuments";
import { useSettings } from "@/features/settings/useSettings";
import type { ResultsApi } from "@/features/results/useResults";
import type { TableInfo } from "@/types";

/** Commands of the active editor that the app menu can trigger. */
export interface QueryViewHandle {
  run: () => void;
  runAtCursor: () => void;
  format: () => void;
  saveQuery: () => Promise<void>;
}

interface Props {
  ref?: React.Ref<QueryViewHandle>;
  documents: DocumentsApi;
  tables: TableInfo[];
  results: ResultsApi;
  /** Whether this view is the one on screen (it stays mounted while hidden). */
  visible: boolean;
}

/** Tabbed query editors on top of the shared results pane. */
export function QueryView({ ref, documents, tables, results, visible }: Props) {
  const { docs, active, select, create, change, open, save, close } = documents;
  const editors = useRef(new Map<number, SqlEditorHandle>());
  const { settings, update } = useSettings();
  const dialogs = useDialogs();

  async function run(text: string) {
    if (!text) return;
    const risky = settings.confirmDestructive ? destructiveStatements(text) : [];
    if (risky.length > 0) {
      const shown = risky.slice(0, 5).map((d) => `• ${d.reason}: ${d.sql}`);
      if (risky.length > shown.length) shown.push(`…and ${risky.length - shown.length} more`);
      const ok = await dialogs.confirm(shown.join("\n"), { title: "Run destructive statements?", confirmLabel: "Run" });
      if (!ok) return;
    }
    void results.runQuery(text);
  }

  async function saveQuery() {
    if (!active.sql.trim()) return;
    const name = await dialogs.prompt("Query name:", "Save query");
    if (name) await api.saveQuery({ id: null, name, sql: active.sql });
  }

  const editor = () => editors.current.get(active.id);
  useImperativeHandle(ref, () => ({
    run: () => run(editor()?.getRunText() ?? ""),
    runAtCursor: () => run(editor()?.getCursorStatement() ?? ""),
    format: () => editor()?.format(),
    saveQuery,
  }));

  // Put the cursor back in the editor when switching tabs or coming back to this view.
  useEffect(() => {
    if (visible) editors.current.get(active.id)?.focus();
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
        : key === "f" && e.shiftKey ? () => editor()?.format()
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
      <div className="relative flex max-h-[80%] min-h-32 shrink-0 flex-col border-b" style={{ height: settings.editorHeight }}>
        <ResizeHandle axis="y" size={settings.editorHeight} min={128} onChange={(editorHeight) => update({ editorHeight })} />
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
        <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5">
          {results.outcome?.kind === "running" ? (
            <Button size="sm" variant="destructive" onClick={() => void api.cancelQuery()} title="Cancel the running query"><Square /> Stop</Button>
          ) : (
            <Button size="sm" onClick={() => run(editor()?.getRunText() ?? "")}><Play /> Run</Button>
          )}
          <Button size="sm" variant="outline" onClick={() => editor()?.format()} title="Format the SQL in this tab (Ctrl+Shift+F)"><AlignLeft /> Beautify</Button>
          <Button size="sm" variant="outline" onClick={() => void save(active.id)} title="Save file (Ctrl+S)"><SaveAll /> Save file</Button>
          <Button size="sm" variant="outline" onClick={saveQuery} title="Keep this query in the Saved tab"><Save /> Save query</Button>
          <span className="ml-auto text-xs text-muted-foreground">Ctrl+Enter runs all · Ctrl+Shift+Enter runs the query at the cursor · Ctrl+Space autocompletes</span>
        </div>
        {docs.map((d) => (
          <div key={d.id} className="flex min-h-0 flex-1 flex-col" hidden={d.id !== active.id}>
            <SqlEditor
              ref={(handle) => {
                if (handle) editors.current.set(d.id, handle);
                return () => void editors.current.delete(d.id);
              }}
              value={d.sql}
              tables={tables}
              onChange={(sql) => change(d.id, sql)}
              onRun={run}
            />
          </div>
        ))}
      </div>
      <ResultsPane results={results} />
    </>
  );
}
