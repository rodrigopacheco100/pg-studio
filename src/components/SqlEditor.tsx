import { autocompletion } from "@codemirror/autocomplete";
import { indentWithTab } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useImperativeHandle, useRef } from "react";
import { type FormatOptions, formatSql } from "../lib/formatSql";
import { useSettings } from "../hooks/useSettings";
import { statementAtCursor } from "../lib/statements";
import { useDialogs } from "../hooks/useDialogs";
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

/** Uses shadcn's color variables; `oneDark` provides the syntax highlighting in the dark theme. */
const baseTheme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "var(--background)", color: "var(--foreground)" },
  "&.cm-focused": { outline: "none" },
  ".cm-gutters": { backgroundColor: "var(--background)", color: "var(--muted-foreground)", border: "none" },
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
const appearance = (dark: boolean, lineNumbers: boolean) => [dark ? oneDark : [], lineNumbers ? [] : hideLineNumbers];
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

export function SqlEditor({ ref, value, tables, onChange, onRun }: Props) {
  const dialogs = useDialogs();
  const { settings, dark } = useSettings();
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
            indentWithTab,
          ]),
        ),
        runGutter((sql) => latest.current.onRun(sql)),
        basicSetup,
        sql({ dialect: PostgreSQL }),
        appearanceSlot.current.of(appearance(dark, settings.lineNumbers)),
        indentSlot.current.of(indentation(settings.tabSize)),
        baseTheme,
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

  return <div className="min-h-0 flex-1 overflow-hidden [&_.cm-editor]:h-full" ref={host} />;
}
