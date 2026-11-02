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
- `src-tauri/src/json_store.rs`: `JsonStore<T>`, a value persisted as JSON (atomic writes, defaults on a missing/corrupted file). `settings.rs` (program settings) and `session.rs` (work in progress) are built on it.
- `src-tauri/src/files.rs`: `read_text_file` / `write_text_file` for SQL script files. Paths come from the native dialogs (`tauri-plugin-dialog`, wrapped in `files` in `src/api.ts`; permission `dialog:default` in `capabilities/default.json`).
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
- `src/lib/formatSql.ts`: PostgreSQL formatting via `sql-formatter` (upper-case keywords, 2 spaces). `SqlEditor`'s handle `format()` replaces the document in one undoable transaction; bound to the Beautify button and `Ctrl+Shift+F` in `QueryView`.
- `src/components/runGutter.ts`: a ▶ marker on the first line of each statement; clicking runs only that statement.
- `SqlEditor` calls `onRun(sql)`: `Ctrl+Enter` passes the selection or whole text, `Ctrl+Shift+Enter` the statement at the cursor, the ▶ its own statement.

## Editor documents

`src/hooks/useDocuments.ts` owns the open SQL documents (`Doc`: id, path, name, sql, saved; dirty = `sql !== saved`). There is always at least one. `create` / `open` / `save(id, asNew?)` / `close` / `change` / `select`; opening a path that is already open focuses its tab, closing a dirty document asks for confirmation. `QueryView` renders the tab bar and one `SqlEditor` per document (hidden when inactive, so undo history and cursor survive tab switches) and registers the file shortcuts on `window` while visible. Using a history or saved query opens it in a new tab. The Saved tab (SQLite) is separate from `.sql` files. Closing the window does not warn about unsaved tabs, because they are restored on the next start (see below).

## Session restore (`session.json`)

`session.json` (next to `settings.json`) holds the work in progress: the open documents with their unsaved text (`Doc` fields) and the active tab, plus the active connection id. Settings are preferences; the session is state, so they are separate files with the same machinery.

- Backend: `Session` in `session.rs`, commands `get_session` / `set_session`.
- Frontend: `SessionProvider` / `useSession()` give `initial` (the session at startup, constant) and `update(patch)`. Each owner records its own part: `useDocuments` on every change of docs/active tab, `App` on connect/disconnect/delete. `useConnections(restoreId)` reconnects once at startup and ignores failures (the id is kept, so a down server does not forget the connection).
- Persistence helpers: `usePersistedState` (load once, debounced save on change) is shared by settings and session; `lib/persist.ts` debounces and `flushOnClose()` (called in `main.tsx`) writes everything pending when the window closes (needs `core:window:allow-destroy`).

## Table tree (sidebar)

`TableNode` (`src/components/TableNode.tsx`): the arrow at the left of each table expands folders Columns, Constraints, Foreign Keys, Indexes and Permissions (views only get Columns and Permissions). A folder's contents are fetched lazily the first time it is expanded through `table_details(schema, table, kind)` (`pg::table_details`, catalog queries returning `{ name, detail }` rows). To add a folder: a `kind` branch in `pg::table_details`, the `DetailKind` in `src/types.ts`, and an entry in `FOLDERS`. A new table list (refresh, reconnect) remounts the nodes, which drops their cached details.

Double-clicking an item opens `ItemDetailsDialog`, which calls `table_item(schema, table, kind, name)`: `pg::table_item` builds one JSON document per kind in SQL (`json_build_object` over `pg_catalog`), typed in `src/types.ts` (`ColumnDetails`, `ConstraintDetails`, `ForeignKeyDetails`, `IndexDetails`, `PermissionDetails`, mapped by `ItemDetailsMap`). `src/components/itemScreens.tsx` has one screen per kind plus the shared blocks (`Properties`, `Section`, `Table`, `Code`). A new kind needs: the SQL branch, its type + `ItemDetailsMap` entry, and a screen.

## Conventions

- Backend errors are `String` (`CmdResult<T>`); on the frontend use `errText`.
- `Mutex` locks never cross an `.await`.
- Keep changes minimal and in the right owner of the responsibility; no speculative abstractions.
