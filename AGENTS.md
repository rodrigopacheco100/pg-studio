# PG Studio

Desktop PostgreSQL client. Tauri 2 (Rust) + React 19 + TypeScript + Vite + Tailwind 4 + shadcn/radix. SQL editor in CodeMirror. All UI text, comments, docs and commit messages are in English.

## Commands

- `bun run dev` / `bun run tauri dev`: frontend / full app
- `bun run build`: `tsc --noEmit` + `vite build` (use `npx tsc --noEmit` as a quick check)
- `bun test`: tests in `src/lib/*.test.ts`
- `cargo check` in `src-tauri/`: backend check

## Architecture

- `src-tauri/src/lib.rs`: `AppState` and Tauri commands (`#[tauri::command]`). Every new command goes into `generate_handler!` and gets a wrapper in `src/api.ts` (the only place that calls `invoke`).
- `src-tauri/src/local.rs`: local SQLite (`pg-studio.sqlite`): saved connections, history, saved queries.
- `src-tauri/src/pg.rs`: PostgreSQL access (connection, queries, tables).
- `src-tauri/src/settings.rs`: program settings (see below).
- `src/App.tsx`: layout (sidebar + Query/History/Saved tabs + status bar). `QueryView` stays mounted to preserve the editor.
- `src/hooks/`: UI state (`useConnections`, `useResults`, `useSettings`). `src/components/`, `src/views/`, `src/lib/` (pure utilities, with tests). shadcn components in `src/components/ui/`.
- `src/types.ts`: types shared with the backend (serde in camelCase where noted).

## Program settings (`settings.json`)

`settings.json` lives in the app data directory (`app_data_dir`, next to the SQLite file). **Every** program setting goes through it; do not create another mechanism (localStorage, another file, etc.).

- Backend: `Settings` + `SettingsStore` in `settings.rs`, held in `AppState.settings`. Commands `get_settings` / `set_settings` (replaces the whole object). Missing fields or a corrupted file fall back to the defaults (`#[serde(default)]`); writes are atomic (temporary file + rename).
- Frontend: `SettingsProvider` (in `main.tsx`) loads once and exposes `useSettings()` → `{ settings, update(patch) }`. `update` applies immediately and persists with a 300 ms debounce. The app only renders after loading.
- To add a setting: (1) field and default in `Settings`/`Default` (`settings.rs`); (2) field in `Settings` of `src/types.ts` (same name in camelCase); (3) use `useSettings()` where needed. Nothing else changes.

Current settings:

| Field | Default | Use |
|---|---|---|
| `sidebarWidth` | 256 (px) | Sidebar width; limits 180–560 in `Sidebar.tsx` |
| `editorHeight` | 300 (px) | SQL editor height above the results; minimum 128, maximum 80% of the area (`QueryView.tsx`) |

Values are integers (`u32` in Rust); round before saving.

## Resizing

`src/components/ResizeHandle.tsx`: draggable handle (`axis` `x`/`y`) placed on the parent's right/bottom edge; the parent must be `relative`. Takes `size`, `min`, `max` and `onChange`; the limits are applied inside it. The value comes from and goes to `useSettings()`. While dragging it disables text selection on `body`.

## SQL editor

- `src/lib/statements.ts`: `splitStatements` splits a script on `;` outside strings, quoted identifiers, comments and `$tag$` blocks; `statementAtCursor` picks the statement under the cursor. Not handled: backslash escapes in `E'...'` strings.
- `src/components/runGutter.ts`: a ▶ marker on the first line of each statement; clicking runs only that statement.
- `SqlEditor` calls `onRun(sql)`: `Ctrl+Enter` passes the selection or whole text, `Ctrl+Shift+Enter` the statement at the cursor, the ▶ its own statement.

## Conventions

- Backend errors are `String` (`CmdResult<T>`); on the frontend use `errText`.
- `Mutex` locks never cross an `.await`.
- Keep changes minimal and in the right owner of the responsibility; no speculative abstractions.
