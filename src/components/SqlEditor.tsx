import { autocompletion } from "@codemirror/autocomplete";
import { indentWithTab, selectAll } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useImperativeHandle, useRef } from "react";
import { type FormatOptions, formatSql } from "../lib/formatSql";
import { useSettings } from "../hooks/useSettings";
import { useTheme } from "../hooks/useTheme";
import { statementAtCursor } from "../lib/statements";
import { useDialogs } from "../hooks/useDialogs";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { EditMenuItems } from "./EditMenu";
import { themeHighlighting } from "../lib/syntaxHighlight";
import { runGutter } from "./runGutter";
import { errText } from "../api";
import { createSqlCompletion } from "../lib/sqlComplete";
import type { TableInfo } from "../types";

export interface SqlEditorHandle {
  /** The selection, or the whole text if nothing is selected. */
  getRunText: () => string;
  /** The statement under the cursor (see `statementAtCursor`). */
  getCursorStatement: () => string;
  focus: () => void;
  /** Reformats the whole document as one undoable change; alerts if the SQL cannot be parsed. */
  format: () => void;
}

interface Props {
  ref?: React.Ref<SqlEditorHandle>;
  value: string;
  tables: TableInfo[];
  onChange: (value: string) => void;
  /** Runs `sql`: the selection/document text (Ctrl+Enter) or a single statement (▶ button). */
  onRun: (sql: string) => void;
}

/** Colors come from the theme's CSS variables (the interface tokens here, the `syntax-*` ones in `themeHighlighting`). */
const baseTheme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "var(--background)", color: "var(--foreground)" },
  "&.cm-focused": { outline: "none" },
  ".cm-gutters": { backgroundColor: "var(--background)", color: "var(--muted-foreground)", border: "none" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "color-mix(in oklch, var(--primary) 35%, transparent)",
  },
  "&.cm-focused .cm-matchingBracket": { backgroundColor: "color-mix(in oklch, var(--primary) 25%, transparent)" },
  ".cm-panels": { backgroundColor: "var(--popover)", color: "var(--popover-foreground)" },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "color-mix(in oklch, var(--muted) 50%, transparent)" },
  ".cm-scroller": { fontFamily: "var(--app-font-mono)", fontSize: "var(--app-editor-font-size)" },
  ".cm-tooltip": {
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "var(--accent)",
    color: "var(--accent-foreground)",
  },
});

const hideLineNumbers = EditorView.theme({ ".cm-lineNumbers": { display: "none" } });

/** The parts of the editor that follow the program settings; reconfigured when they change. */
const appearance = (dark: boolean, lineNumbers: boolean) => [EditorView.darkTheme.of(dark), lineNumbers ? [] : hideLineNumbers];
const indentation = (tabSize: number) => [EditorState.tabSize.of(tabSize), indentUnit.of(" ".repeat(tabSize))];

function getRunText(v: EditorView) {
  const s = v.state;
  const { from, to } = s.selection.main;
  return (from === to ? s.doc.toString() : s.sliceDoc(from, to)).trim();
}

function formatDocument(v: EditorView, options: FormatOptions, onError: (message: string) => void) {
  const text = v.state.doc.toString();
  try {
    const formatted = formatSql(text, options);
    if (formatted === text) return;
    v.dispatch({
      changes: { from: 0, to: text.length, insert: formatted },
      selection: { anchor: Math.min(v.state.selection.main.head, formatted.length) },
    });
  } catch (e) {
    onError(`Could not format the SQL:\n${errText(e)}`);
  }
}

/** Context menu of the editor: running, formatting and the edit entries. */
function EditorMenu({ view, onRun, onFormat }: { view: React.RefObject<EditorView | null>; onRun: (sql: string) => void; onFormat: () => void }) {
  return (
    <ContextMenuContent onCloseAutoFocus={(e) => { e.preventDefault(); view.current?.focus(); }}>
      <EditorMenuItems view={view} onRun={onRun} onFormat={onFormat} />
    </ContextMenuContent>
  );
}

/** Mounted only while the menu is open, so the selection is the current one. */
function EditorMenuItems({ view, onRun, onFormat }: { view: React.RefObject<EditorView | null>; onRun: (sql: string) => void; onFormat: () => void }) {
  const v = view.current;
  const selection = v?.state.selection.main;
  const hasSelection = !!selection && !selection.empty;
  const selectedText = () => (v && selection ? v.state.sliceDoc(selection.from, selection.to) : "");
  return (
    <>
      <ContextMenuItem onSelect={() => v && onRun(getRunText(v))}>{hasSelection ? "Run selection" : "Run"}</ContextMenuItem>
      <ContextMenuItem onSelect={() => v && onRun(statementAtCursor(v.state.doc.toString(), v.state.selection.main.head))}>
        Run statement at cursor
      </ContextMenuItem>
      <ContextMenuItem onSelect={onFormat}>Beautify</ContextMenuItem>
      <ContextMenuSeparator />
      <EditMenuItems
        canCut={hasSelection}
        canCopy={hasSelection}
        canPaste
        cut={() => { void navigator.clipboard.writeText(selectedText()); v?.dispatch(v.state.replaceSelection("")); }}
        copy={() => void navigator.clipboard.writeText(selectedText())}
        paste={(text) => v?.dispatch(v.state.replaceSelection(text))}
        selectAll={() => v && selectAll(v)}
      />
    </>
  );
}

export function SqlEditor({ ref, value, tables, onChange, onRun }: Props) {
  const dialogs = useDialogs();
  const { settings } = useSettings();
  const { dark } = useTheme();
  const appearanceSlot = useRef(new Compartment());
  const indentSlot = useRef(new Compartment());
  const formatOptions = useRef<FormatOptions>(settings);
  formatOptions.current = settings;
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // Callbacks and tables change without recreating the editor.
  const latest = useRef({ onChange, onRun, tables });
  latest.current = { onChange, onRun, tables };

  useImperativeHandle(ref, () => ({ getRunText: () => getRunText(view.current!), focus: () => view.current?.focus(),
    getCursorStatement: () => {
      const { doc, selection } = view.current!.state;
      return statementAtCursor(doc.toString(), selection.main.head);
    },
    format: () => formatDocument(view.current!, formatOptions.current, (m) => void dialogs.alert(m)),
  }));

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      doc: value,
      extensions: [
        Prec.highest(
          keymap.of([
            { key: "Mod-Enter", run: (target) => (latest.current.onRun(getRunText(target)), true) },
            {
              key: "Mod-Shift-Enter",
              run: (target) => {
                const { doc, selection } = target.state;
                latest.current.onRun(statementAtCursor(doc.toString(), selection.main.head));
                return true;
              },
            },
          ]),
        ),
        // Below the default precedence of the snippet keymap, so Tab moves between snippet fields first.
        keymap.of([indentWithTab]),
        runGutter((sql) => latest.current.onRun(sql)),
        basicSetup,
        sql({ dialect: PostgreSQL }),
        appearanceSlot.current.of(appearance(dark, settings.lineNumbers)),
        indentSlot.current.of(indentation(settings.tabSize)),
        baseTheme,
        themeHighlighting,
        autocompletion({ override: [createSqlCompletion(() => latest.current.tables)] }),
        EditorView.updateListener.of((u) => u.docChanged && latest.current.onChange(u.state.doc.toString())),
      ],
    });
    view.current = v;
    return () => v.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the editor is created once; `value` is synced below
  }, []);

  useEffect(() => {
    view.current?.dispatch({
      effects: [
        appearanceSlot.current.reconfigure(appearance(dark, settings.lineNumbers)),
        indentSlot.current.reconfigure(indentation(settings.tabSize)),
      ],
    });
  }, [dark, settings.lineNumbers, settings.tabSize]);

  // External changes (e.g. using a query from the history).
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="min-h-0 flex-1 overflow-hidden [&_.cm-editor]:h-full" ref={host} />
      </ContextMenuTrigger>
      <EditorMenu
        view={view}
        onRun={(sql) => latest.current.onRun(sql)}
        onFormat={() => view.current && formatDocument(view.current, formatOptions.current, (m) => void dialogs.alert(m))}
      />
    </ContextMenu>
  );
}
