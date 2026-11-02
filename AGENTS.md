# PG Studio

Desktop PostgreSQL client. Tauri 2 (Rust) + React 19 + TypeScript + Vite + Tailwind 4 + shadcn/radix. SQL editor in CodeMirror. All UI text, comments, docs and commit messages are in English.

## Commands

- `bun run dev` / `bun run tauri dev`: frontend / full app
- `bun run build`: `tsc --noEmit` + `vite build` (use `npx tsc --noEmit` as a quick check)
- `bun test`: tests in `src/lib/*.test.ts`
- `cargo check` in `src-tauri/`: backend check

## Architecture

- `src-tauri/src/lib.rs`: only `run()` (plugins, state, `generate_handler!`). Every new command is registered there and gets a wrapper in `src/api.ts` (the only place that calls `invoke`).
- `src-tauri/src/commands/`: the `#[tauri::command]`s, thin and grouped by subject: `connections`, `folders`, `vault`, `queries` (running SQL, browsing tables), `history` (history + saved queries), `preferences` (settings + session), `files` (`read_text_file` / `write_text_file` for SQL script files; paths come from the native dialogs, wrapped in `files` in `src/api.ts`, permission `dialog:default` in `capabilities/default.json`).
- `src-tauri/src/state.rs`: `AppState` (stores, active connection, background row count) and the logic commands share: connect/disconnect, SSH routing, reopening a dropped connection, `CmdResult`. Mutex locks never cross an `.await`.
- `src-tauri/src/storage/`: local SQLite (`pg-studio.sqlite`), one module per table: `connections`, `folders`, `history`, `saved_queries`. Each owns its schema (`init`, including upgrades of older databases) and exposes plain functions taking `&Connection`, used as `connections::list`, `history::add`…
- `src-tauri/src/pg/`: PostgreSQL access: `connection` (open, cancel), `query` (run, typed results), `error` (error text), `catalog` (tables, details, items).
- `src-tauri/src/persist/`: `JsonStore<T>`, a value persisted as JSON (atomic writes, defaults on a missing/corrupted file), with `settings` (program settings) and `session` (work in progress) built on it.
- `src-tauri/src/secrets.rs`, `tunnel.rs`: password storage and the SSH tunnel (below).
- `src/App.tsx`: layout (sidebar + Query/History/Saved tabs + status bar). `QueryView` stays mounted to preserve the editor.
- `src/hooks/`: UI state (`useConnections`, `useResults`, `useSettings`). `src/components/`, `src/views/`, `src/lib/` (pure utilities, with tests). shadcn components in `src/components/ui/`.
- `src/types.ts`: types shared with the backend (serde in camelCase where noted).

## Program settings (`settings.json`)

`settings.json` lives in the app data directory (`app_data_dir`, next to the SQLite file). **Every** program setting goes through it; do not create another mechanism (localStorage, another file, etc.).

- Backend: `Settings` in `persist/settings.rs`, held in `AppState` as a `JsonStore<Settings>`. Commands `get_settings` / `set_settings` (replaces the whole object). Missing fields or a corrupted file fall back to the defaults (`#[serde(default)]`); writes are atomic (temporary file + rename).
- Frontend: `SettingsProvider` (in `main.tsx`) loads once and exposes `useSettings()` → `{ settings, update(patch) }`. `update` applies immediately and persists with a 300 ms debounce. The app only renders after loading.
- To add a setting: (1) field and default in `Settings`/`Default` (`persist/settings.rs`); (2) field in `Settings` of `src/types.ts` (same name in camelCase); (3) use `useSettings()` where needed. Nothing else changes.

Current settings:

| Field | Default | Use |
|---|---|---|
| `sidebarWidth` | 256 (px) | Sidebar width; limits 180–560 in `Sidebar.tsx` |
| `editorHeight` | 300 (px) | SQL editor height above the results; minimum 128, maximum 80% of the area (`QueryView.tsx`) |
| `theme` | `dark` | `dark` / `light` / `system`; `SettingsProvider` toggles the `dark` class on the root (`useSettings().dark`) |
| `uiFont`, `editorFont` | `roboto`, `system-mono` | Font ids from `UI_FONTS` / `EDITOR_FONTS` in `src/lib/fonts.ts` |
| `uiFontSize` | 16 (px) | Root font size (Tailwind is rem-based) |
| `editorFontSize` | 13 (px) | CSS variable `--app-editor-font-size`, read by the CodeMirror theme |
| `tabSize` | 2 | Editor indentation and Beautify width |
| `lineNumbers` | `true` | Editor gutter (hidden by CSS, so it can change live) |
| `keywordCase` | `upper` | Beautify: `upper` / `lower` / `preserve` |
| `pageSize` | 100 | Rows per results page (`useResults`); changing it returns to page 1 |
| `statementTimeoutSeconds` | 0 | `SET statement_timeout` on every session (`AppState::open_session`) and on the active one when changed; 0 = no limit |
| `confirmDestructive` | `true` | Ask before running destructive statements (`QueryView.run`) |
| `restoreConnection` | `true` | Reconnect to the session's last connection at startup (`App`) |
| `vaultAutoLockMinutes` | 0 | Lock the master-password vault after this idle time (`AppState::watch_vault_idle`); 0 = never |
| `confirmCloseDirty` | `true` | Ask before closing a tab with unsaved changes (`useDocuments`) |

`SettingsDialog` groups them in tabs (Appearance, Editor, Query, General); `Field` (dropdown with presets) and `Toggle` bind one setting each, so a new setting is one more line there.

Values are integers (`u32` in Rust); round before saving.

## Resizing

`src/components/ResizeHandle.tsx`: draggable handle (`axis` `x`/`y`) placed on the parent's right/bottom edge; the parent must be `relative`. Takes `size`, `min`, `max` and `onChange`; the limits are applied inside it. The value comes from and goes to `useSettings()`. While dragging it disables text selection on `body`.

## SQL editor

- `src/lib/statements.ts`: `splitStatements` splits a script on `;` outside strings, quoted identifiers, comments and `$tag$` blocks; `statementAtCursor` picks the statement under the cursor. Not handled: backslash escapes in `E'...'` strings.
- `src/lib/formatSql.ts`: PostgreSQL formatting via `sql-formatter` (upper-case keywords, 2 spaces). `SqlEditor`'s handle `format()` replaces the document in one undoable transaction; bound to the Beautify button and `Ctrl+Shift+F` in `QueryView`.
- Column types: the simple protocol returns every value as text without types, so `pg::run_typed` prepares the individual statements (sent by the frontend alongside the SQL, from `splitStatements`) after running the script to learn each result's column types (`QueryResult.types`). Booleans are rewritten from `t`/`f` to `true`/`false`, and the grid shows them in italics. If the statements cannot be matched to the results, `types` stays empty and values are shown as received.
- `src/lib/destructive.ts`: `destructiveStatements` finds `DROP`, `TRUNCATE` and `DELETE` / `UPDATE` without a top-level `WHERE` (also after a `WITH`), ignoring strings and comments. `QueryView.run` lists them in a confirmation before any run (menu, shortcuts and the ▶ marker all go through it) unless `confirmDestructive` is off. Not detected: DELETE/UPDATE inside a data-modifying CTE body, `ALTER ... DROP`.
- `src/components/runGutter.ts`: a ▶ marker on the first line of each statement; clicking runs only that statement.
- `SqlEditor` calls `onRun(sql)`: `Ctrl+Enter` passes the selection or whole text, `Ctrl+Shift+Enter` the statement at the cursor, the ▶ its own statement.

## Editor documents

`src/hooks/useDocuments.ts` owns the open SQL documents (`Doc`: id, path, name, sql, saved; dirty = `sql !== saved`). There is always at least one. `create` / `open` / `save(id, asNew?)` / `close` / `change` / `select`; opening a path that is already open focuses its tab, closing a dirty document asks for confirmation. `QueryView` renders the tab bar and one `SqlEditor` per document (hidden when inactive, so undo history and cursor survive tab switches) and registers the file shortcuts on `window` while visible. Using a history or saved query opens it in a new tab. The Saved tab (SQLite) is separate from `.sql` files. Closing the window does not warn about unsaved tabs, because they are restored on the next start (see below).

## Session restore (`session.json`)

`session.json` (next to `settings.json`) holds the work in progress: the open documents with their unsaved text (`Doc` fields) and the active tab, plus the active connection id. Settings are preferences; the session is state, so they are separate files with the same machinery.

- Backend: `Session` in `persist/session.rs`, commands `get_session` / `set_session`.
- Frontend: `SessionProvider` / `useSession()` give `initial` (the session at startup, constant) and `update(patch)`. Each owner records its own part: `useDocuments` on every change of docs/active tab, `App` on connect/disconnect/delete. `useConnections(restoreId)` reconnects once at startup and ignores failures (the id is kept, so a down server does not forget the connection).
- Persistence helpers: `usePersistedState` (load once, debounced save on change) is shared by settings and session; `lib/persist.ts` debounces and `flushOnClose()` (called in `main.tsx`) writes everything pending when the window closes (needs `core:window:allow-destroy`).

## Table tree (sidebar)

`TableNode` (`src/components/TableNode.tsx`): the arrow at the left of each table expands folders Columns, Constraints, Foreign Keys, Indexes and Permissions (views only get Columns and Permissions). A folder's contents are fetched lazily the first time it is expanded through `table_details(schema, table, kind)` (`pg::table_details`, catalog queries returning `{ name, detail }` rows). To add a folder: a `kind` branch in `pg::table_details`, the `DetailKind` in `src/types.ts`, and an entry in `FOLDERS`. A new table list (refresh, reconnect) remounts the nodes, which drops their cached details.

Double-clicking an item opens `ItemDetailsDialog`, which calls `table_item(schema, table, kind, name)`: `pg::table_item` builds one JSON document per kind in SQL (`json_build_object` over `pg_catalog`), typed in `src/types.ts` (`ColumnDetails`, `ConstraintDetails`, `ForeignKeyDetails`, `IndexDetails`, `PermissionDetails`, mapped by `ItemDetailsMap`). `src/components/itemScreens.tsx` has one screen per kind plus the shared blocks (`Properties`, `Section`, `Table`, `Code`). A new kind needs: the SQL branch, its type + `ItemDetailsMap` entry, and a screen.

## Connection folders and ordering

Stored in `pg-studio.sqlite`: table `connection_folders` (id, name, position) and columns `folder_id`/`position` on `connections` (added by `storage::connections::init` on older databases; ties fall back to the name). Folders are flat. `Sidebar` uses native HTML5 drag and drop (hence `dragDropEnabled: false` on the window in `tauri.conf.json`): drop a connection on a folder (end of it), on a connection (before it, in its folder) or on the strip below the list (top level); drop a folder on a folder (before it) or on the strip (end). `lib/connectionOrder.ts` computes the new order (tested), `useConnections` applies it optimistically and persists the whole order via `reorder_connections` / `reorder_folders`. Deleting a folder moves its connections to the top level. While connected only the active connection is shown, without dragging. Collapsed folders are UI state only.

## Connection passwords

Passwords are never kept in SQLite. `src-tauri/src/secrets.rs` (`Secrets`, in `AppState.secrets`) stores them in the OS credential store via the `keyring` crate (service `pg-studio`, user `connection-<id>`; the backend feature is chosen per target in `Cargo.toml`). Where there is none (probed once; e.g. WSL or Linux without a Secret Service) it uses `vault.json` instead: entries encrypted with ChaCha20-Poly1305 under a key derived from a master password (Argon2id). The key lives in memory only, after `vault_open(password, create)`; the frontend gets the state from `vault_status` and `useVault()` (`ensureVault()` asks for / creates the master password when needed; called before saving a password, testing with a stored one and connecting). A forgotten master password cannot be recovered.

`list_connections` returns passwords blank; saving with a blank password keeps the stored one. `save_password` (checkbox in `ConnectionDialog`) decides whether to store at all: when off, the password is asked in a masked `dialogs.prompt(..., { secret: true })` at each connect and passed to `connect(id, password)`. Passwords left in SQLite by older versions are moved into the store at startup and after the vault is unlocked (`storage::connections::migrate_passwords`); until then they still work.

## SSH tunnel

A connection can reach the server through SSH (`ssh_*` fields of `ConnectionConfig`/`Conn`, columns in `connections`). `src-tauri/src/tunnel.rs` (russh) authenticates with a private key (optional passphrase), a password or the ssh-agent, then listens on `127.0.0.1:<random port>` and forwards each connection to the database `host:port` through the SSH server. `AppState::route` (`state.rs`) opens the tunnel and returns the config `pg::open` should use (host/port pointing at the local end); `Active` keeps the `Tunnel` alive (dropping it closes everything), the tunneled `config` for `pg::open` / the background count, and the `origin` config so a dropped connection rebuilds the tunnel in `AppState::client`. The SSH password / passphrase is `ssh_secret`: handled exactly like `password` (secret store key `connection-<id>-ssh`, blank in lists, blank on save keeps it, asked at connect when `save_password` is off). Host keys use trust on first use (`known_hosts.json`): a changed key is refused until its entry is removed. The ssh-agent uses `SSH_AUTH_SOCK` on unix and the OpenSSH named pipe on Windows.

## Menu and preferences

- `AppMenu` (`src/components/AppMenu.tsx`, radix menubar in `ui/menubar.tsx`) is the menu bar: File, Query, Connection, Settings. It only receives callbacks (`MenuActions`); `App` wires them to `useDocuments`, the connections hook and `QueryView`'s handle (`QueryViewHandle`: run, runAtCursor, format, saveQuery). Keyboard shortcuts are handled in `QueryView`; the menu only displays them, so keep both in sync.
- `SettingsDialog` edits the settings through `useSettings().update`; changes apply and persist immediately.
- Fonts: the font packages (`@fontsource-variable/*`) are imported in `index.css` and listed in `src/lib/fonts.ts` (`UI_FONTS`, `EDITOR_FONTS`: id, label, CSS family). `SettingsProvider` copies the chosen families into the CSS variables `--app-font-sans` / `--app-font-mono` on the root; Tailwind's `font-sans` / `font-mono` and the CodeMirror theme read those. To offer a new font: add the package import in `index.css` and an entry in `fonts.ts`. An unknown saved id falls back to the first option.

## Conventions

- Never call `window.confirm/alert/prompt`: the webview places them at arbitrary spots. Use `useDialogs()` (`confirm`, `alert`, `prompt`; all async, in `src/hooks/useDialogs.tsx`).
- Backend errors are `String` (`CmdResult<T>`); on the frontend use `errText`.
- `Mutex` locks never cross an `.await`.
- Keep changes minimal and in the right owner of the responsibility; no speculative abstractions.
