import { type Extension, RangeSet, RangeSetBuilder, StateField } from "@codemirror/state";
import { EditorView, GutterMarker, gutter } from "@codemirror/view";
import { splitStatements } from "../lib/statements";

class RunMarker extends GutterMarker {
  constructor(readonly sql: string) {
    super();
  }
  eq(other: RunMarker) {
    return other.sql === this.sql;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-run-btn";
    el.title = "Run this query";
    el.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M6 4l14 8-14 8z"/></svg>';
    return el;
  }
}

/** One marker per statement, on the line where it starts. */
const markers = StateField.define<RangeSet<RunMarker>>({
  create: (state) => build(state.doc.toString(), state.doc),
  update: (value, tr) => (tr.docChanged ? build(tr.state.doc.toString(), tr.state.doc) : value),
});

function build(text: string, doc: { lineAt(pos: number): { from: number } }) {
  const builder = new RangeSetBuilder<RunMarker>();
  let lastLine = -1;
  for (const { from, to } of splitStatements(text)) {
    const line = doc.lineAt(from).from;
    if (line === lastLine) continue; // several statements on the same line: only the first gets the play
    lastLine = line;
    builder.add(line, line, new RunMarker(text.slice(from, to)));
  }
  return builder.finish();
}

const theme = EditorView.baseTheme({
  ".cm-run-gutter": { width: "18px" },
  ".cm-run-btn": {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    cursor: "pointer",
    color: "#22c55e",
    opacity: "0.75",
  },
  ".cm-run-btn:hover": { opacity: "1" },
});

/** Gutter with a ▶ button beside the first line of each statement; clicking runs only that one. */
export function runGutter(onRun: (sql: string) => void): Extension {
  return [
    markers,
    theme,
    gutter({
      class: "cm-run-gutter",
      markers: (view) => view.state.field(markers),
      domEventHandlers: {
        mousedown(view, line) {
          let sql: string | undefined;
          view.state.field(markers).between(line.from, line.from, (_f, _t, m) => void (sql = m.sql));
          if (sql === undefined) return false;
          onRun(sql);
          return true;
        },
      },
    }),
  ];
}
