# PG Studio

Desktop PostgreSQL client. Tauri 2 (Rust) + React 19 + TypeScript + Vite + Tailwind 4 + shadcn/radix. SQL editor in CodeMirror. All UI text, comments, docs and commit messages are in English.

## Commands

- `bun run dev` / `bun run tauri dev`: frontend / full app
- `bun run build`: `tsc --noEmit` + `vite build` (use `npx tsc --noEmit` as a quick check)
- `bun run test`: tests in `src/lib/*.test.ts` (plain `bun test` would also pick up the Playwright specs in `e2e/`)
- `cargo check` in `src-tauri/`: backend check

## Architecture

- `src-tauri/src/lib.rs`: only `run()` (plugins, state, `generate_handler!`). Every new command is registered there and gets a wrapper in `src/api.ts` (the only place that calls `invoke`).
- `src-tauri/src/commands/`: the `#[tauri::command]`s, thin and grouped by subject: `connections`, `folders`, `vault`, `queries` (running SQL, browsing tables), `history` (history + saved queries), `exports` (background file exports), `preferences` (settings + session), `files` (`read_text_file` / `write_text_file` for SQL script files; paths come from the native dialogs, wrapped in `files` in `src/api.ts`, permission `dialog:default` in `capabilities/default.json`).
- `src-tauri/src/state.rs`: `AppState` (stores, active connection with its `pg::Session`, whose cancel token `cancel_query` uses for the Stop button, background row count) and the logic commands share: connect/disconnect, SSH routing, reopening a dropped connection, `CmdResult`. Mutex locks never cross an `.await`.
- `src-tauri/src/storage/`: local SQLite (`pg-studio.sqlite`), one module per table: `connections`, `folders`, `history`, `saved_queries`, `exports`. Each owns its schema (`init`, including upgrades of older databases) and exposes plain functions taking `&Connection`, used as `connections::list`, `history::add`…
- `src-tauri/src/pg/`: PostgreSQL access: `connection` (open, cancel), `query` (run, typed results), `cursor` (reading a result in chunks, for exports), `error` (error text), `catalog` (tables, details, items, the SQL of the grid view).
- `src-tauri/src/export/`: background file exports (below).
- `src-tauri/src/persist/`: `JsonStore<T>`, a value persisted as JSON (atomic writes, defaults on a missing/corrupted file), with `settings` (program settings) and `session` (work in progress) built on it, and `themes` (imported theme files).
- `src-tauri/src/secrets.rs`, `tunnel.rs`, `known_hosts.rs`: password storage, the SSH tunnel and its trusted host keys (below).
- `src/app/App.tsx`: layout (sidebar + Query/History/Saved tabs + status bar). `QueryView` stays mounted to preserve the editors.
- The frontend is organized by feature. `src/app/`: the shell (`App`, `AppMenu`, `StatusBar`). `src/features/<name>/`: everything of one area, flat, with its components, views, hooks, pure utilities and their `*.test.ts`: `connections` (sidebar, connection dialog, vault, ordering), `schema` (table tree, item details), `editor` (SQL editor, documents, statements, autocomplete, destructive check, `QueryView`), `results` (grid, filters, sort, pagination, `useResults`), `exports`, `history` (History and Saved views), `settings` (settings dialog, themes, fonts, `useSettings`, `useTheme`), `updates` (updater, release notes). `src/components/` holds only what several features share (`EditMenu`, `OptionSelect`, `PasswordInput`, `ResizeHandle`) and the shadcn components in `src/components/ui/`; `src/hooks/` the shared hooks (`useDialogs`, `usePersistedState`, `useSession`); `src/lib/` the shared utilities (`persist`, `utils`). `src/styles/themes/`: built-in theme files. `main.tsx` stays at the root (the Vite entry).
- Imports: `@/…` across folders, `./x` within the same folder. A feature may import from another feature's files, but code in `components/`, `hooks/` and `lib/` never imports from `features/` or `app/`. A file used by only one feature lives in that feature; move it to the shared folders when a second feature needs it.
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
| `theme` | `dark` | Id of a theme (built-in `dark` / `light` or an imported one) or `system`; see Themes below |
| `uiFont`, `editorFont` | `roboto`, `system-mono` | Font ids from `UI_FONTS` / `EDITOR_FONTS` in `src/features/settings/fonts.ts` |
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
| `checkForUpdates` | `true` | Look for a new version when the app starts (`App`) |

`SettingsDialog` groups them in tabs (Appearance, Editor, Query, General, Security — the last also lists the known SSH servers); `Field` (dropdown with presets) and `Toggle` bind one setting each, so a new setting is one more line there.

Values are integers (`u32` in Rust); round before saving.

## Resizing

`src/components/ResizeHandle.tsx`: draggable handle (`axis` `x`/`y`) placed on the parent's right/bottom edge; the parent must be `relative`. Takes `size`, `min`, `max` and `onChange`; the limits are applied inside it. The value comes from and goes to `useSettings()`. While dragging it disables text selection on `body`.

## SQL editor

- `src/features/editor/statements.ts`: `splitStatements` splits a script on `;` outside strings, quoted identifiers, comments and `$tag$` blocks (`skipQuoted` also handles the backslash escapes of `E'...'` strings, shared with `destructive.ts`); `statementAtCursor` picks the statement under the cursor.
- `src/features/editor/formatSql.ts`: PostgreSQL formatting via `sql-formatter` (upper-case keywords, 2 spaces). `SqlEditor`'s handle `format()` replaces the document in one undoable transaction; bound to the Beautify button and `Ctrl+Shift+F` in `QueryView`.
- Column types: the simple protocol returns every value as text without types, so `pg::run_typed` prepares the individual statements (sent by the frontend alongside the SQL, from `splitStatements`) after running the script to learn each result's column types (`QueryResult.types`). Booleans are rewritten from `t`/`f` to `true`/`false`, and the grid shows them in italics. If the statements cannot be matched to the results, `types` stays empty and values are shown as received.
- `src/features/editor/destructive.ts`: `destructiveStatements` finds `DROP`, `TRUNCATE`, `ALTER ... DROP` (except `DROP DEFAULT` / `NOT NULL`) and `DELETE` / `UPDATE` without a `WHERE` at their own level (also after a `WITH` and inside data-modifying CTE bodies), ignoring strings and comments. `QueryView.run` lists them in a confirmation before any run (menu, shortcuts and the ▶ marker all go through it) unless `confirmDestructive` is off.
- Autocomplete (`src/features/editor/sqlComplete.ts`): tables (with an automatic alias), columns, keywords and `SNIPPETS` (`sel`, `ins`, `upd`, `del`, `crt`, `idx`, `cte`, `cnt`), offered only at the start of a statement; `Tab` walks through a snippet's `${fields}`. `SqlEditor` keeps `indentWithTab` below the default precedence so the snippet keymap gets `Tab` first.
- `src/features/editor/runGutter.ts`: a ▶ marker on the first line of each statement; clicking runs only that statement.
- `SqlEditor` calls `onRun(sql)`: `Ctrl+Enter` passes the selection or whole text, `Ctrl+Shift+Enter` the statement at the cursor, the ▶ its own statement.

## Results grid

`ResultViewer` shows the rows of one result and lets the user sort and filter them: a sort button in each header (ascending, descending, off; NULLs last) and a Filter toggle that opens the `FilterBar`. It only edits a `GridView` (`src/features/results/gridView.ts`, tested) and shows the `result` it is given, already sorted and filtered, so selection, copy and JSON act on what is on screen. The view covers the whole result, not the page: `useResults` owns it (`views`, `setView`, per result) and applies it before pagination.

- **Filters** (`src/features/results/gridFilter.ts`, tested): each is a row of the `FilterBar`: a column, an operator and a value (`name starts with al`, `id ≥ 10`). The operators follow the column's type (`kindOf` on `result.types`: number, date, bool, text): text gets `contains` / `does not contain` / `starts with` / `ends with`; dates are ISO text and get `starts with`; every kind has `=`, `≠`, `is null`, `is not null`, and all but bool the orderings. Contains/starts/ends ignore case, `=` does not; numbers compare by value, dates and text bytewise; as in SQL a NULL passes only `is null`. Editing the bar only changes a draft: nothing is filtered until **Search** (or Enter in a value), which puts the draft into the `GridView`; Clear resets both. A filter without a value, or with a number that does not parse, is incomplete: it filters nothing (`isActiveFilter`). All active filters must pass.
- **Queries** arrive whole: `applyView` sorts and filters them on the client (`displayed`), then `ResultsPane` slices the page and `paging.total` counts the filtered rows. Numbers sort by value, other types as text.
- **Opened tables** are paginated by the server, so the view goes there: `table_data` / `table_count` take a `GridQuery` (`pg/catalog.rs`: sort column and filters, columns by name) that becomes `ORDER BY "col" NULLS LAST` and a `WHERE` built by `GridFilter::condition` (operator names are whitelisted, identifiers quoted, literals escaped, `%` `_` `\` taken literally in `ILIKE` patterns; unit-tested). `gridFilter.ts::evaluate` and `GridFilter::condition` implement the same filters for queries and tables: change them together. The total in the footer counts the matching rows. A view change (a sort click, a Search) reloads from page 0 and keeps the rows on screen meanwhile (`openTable(..., quiet)`), so the filter bar does not flicker.
- **Foreign keys:** `pg::run_typed` also learns each column's origin (`table_oid`/`column_id` of the prepared statement), looks up the foreign keys of those tables (`foreign_keys`) and fills `QueryResult.refs` (`fk_refs`, unit-tested): per column, the keys it is part of whose columns are all in the result (`FkTarget`: name, referenced table, and for each key column its index in the result plus the referenced column). Every non-NULL cell of such a column shows a button (`FollowButton`; a dropdown to pick the key when the column is in several). It opens `ReferencedRowDialog`: the referenced table filtered through `table_data` by every column of the key with the row's values (NULL → `is_null`), in a plain grid (`ResultViewer` without `onViewChange` has no sort/filter and, without `onExport`, no export). **Open in new tab** (`onOpenSql` → `QueryView.openIn` → `DocPaneHandle.runSql`) opens `SELECT * … WHERE …` in a tab.
- **Export:** the grid's context menu has Export all rows → CSV / JSON / SQL INSERT (INSERT only for opened tables); see Exports below.
- The view resets on a new query or table. Elements marked `data-nodrag` (sort button, filter fields) are ignored by the grid's mouse selection and context menu.

## Exports

Export all rows (grid context menu → `ResultsPane.exportResult`) asks where to save (`pickExportPath`) and starts a background job; it covers every row, not the page, in the sorted/filtered order on screen.

- **Backend** (`src-tauri/src/export/`): `start_export` records the job in SQLite (`storage/exports.rs`, table `exports`: source, format, path, status `running`/`done`/`cancelled`/`failed`, rows done/total, bytes, error, start, duration; a job left `running` when the app closed is marked failed at startup) and spawns it (`AppState::start_export`; the spawner closure is built in `lib.rs` because it needs the app handle). A **table** is read on a connection of its own (`AppState::background_session`) with a server-side cursor (`pg::Cursor`, 1000 rows a fetch) after a `count(*)` for the percentage (if counting fails the total stays unknown and the bar is indeterminate); the `GridQuery` of the grid becomes its `SELECT`. A **query's** rows are sent with the request (they are already sorted/filtered in the frontend) and written in chunks of 5000. `RowWriter` (`export/format.rs`, unit-tested) builds CSV / JSON (array of objects, json/jsonb nested) / INSERT (statements of 500 rows, identifiers always quoted) a chunk at a time. The file is built as `<path>.part`, renamed when complete and deleted on failure or cancel. `ExportControl` (kept in `AppState.exports` while running) cancels: it sets a flag the loop checks and interrupts the server's query with the session's cancel token. Commands: `start_export`, `cancel_export`, `list_exports`, `clear_exports` (finished ones only).
- **Frontend:** progress is read by polling `list_exports` every 400 ms while any export runs (events do not reach the e2e browser, and the record in SQLite is the source of truth anyway). `ExportsProvider` (`features/exports/useExports.tsx`, in `main.tsx`) owns the entries, which exports have a floating window (those started in this session) and which are minimized, and renders `ExportWindows`: one window per export at the top right over every view, with title, percentage bar, rows, size, path and error; Minimize folds it to the title and bar; Cancel while it runs; Close only once it ended (it stays in the history). The **Exports** tab (`features/exports/ExportsView.tsx`) lists the history with how each went and clears the finished ones. Percentages, sizes and durations are in `features/exports/exportProgress.ts` (tested).

## Editor documents

`src/features/editor/useDocuments.ts` owns the open SQL documents (`Doc`: id, path, name, sql, saved; dirty = `sql !== saved`). There is always at least one. `create` / `open` / `save(id, asNew?)` / `close` / `change` / `select`; opening a path that is already open focuses its tab, closing a dirty document asks for confirmation. `QueryView` renders the tab bar and one `DocPane` per document (hidden when inactive, so undo history, cursor and results survive tab switches). A `DocPane` owns its `SqlEditor`, toolbar and its own `useResults()` + `ResultsPane`, so every tab has its own results; it reports its info/pagination to the status bar while active (`onStatus`). Clicking a table in the sidebar calls `QueryViewHandle.openTable`: it puts `SELECT * FROM "schema"."table";` in a new tab (or in the empty untitled one on screen) and shows the table's first page, paginated by the server, in that tab's results and registers the file shortcuts on `window` while visible. Using a history or saved query opens it in a new tab. The Saved tab (SQLite) is separate from `.sql` files. Closing the window does not warn about unsaved tabs, because they are restored on the next start (see below).

## Session restore (`session.json`)

`session.json` (next to `settings.json`) holds the work in progress: the open documents with their unsaved text (`Doc` fields) and the active tab, plus the active connection id. Settings are preferences; the session is state, so they are separate files with the same machinery.

- Backend: `Session` in `persist/session.rs`, commands `get_session` / `set_session`.
- Frontend: `SessionProvider` / `useSession()` give `initial` (the session at startup, constant) and `update(patch)`. Each owner records its own part: `useDocuments` on every change of docs/active tab, `App` on connect/disconnect/delete. `useConnections(restoreId)` reconnects once at startup and ignores failures (the id is kept, so a down server does not forget the connection).
- Persistence helpers: `usePersistedState` (load once, debounced save on change) is shared by settings and session; `lib/persist.ts` debounces and `flushOnClose()` (called in `main.tsx`) writes everything pending when the window closes (needs `core:window:allow-destroy`).

## Table tree (sidebar)

`TableNode` (`src/features/schema/TableNode.tsx`): the arrow at the left of each table expands folders Columns, Constraints, Foreign Keys, Indexes and Permissions (views only get Columns and Permissions). A folder's contents are fetched lazily the first time it is expanded through `table_details(schema, table, kind)` (`pg::table_details`, catalog queries returning `{ name, detail }` rows). To add a folder: a `kind` branch in `pg::table_details`, the `DetailKind` in `src/types.ts`, and an entry in `FOLDERS`. A new table list (refresh, reconnect) remounts the nodes, which drops their cached details.

Double-clicking an item opens `ItemDetailsDialog`, which calls `table_item(schema, table, kind, name)`: `pg::table_item` builds one JSON document per kind in SQL (`json_build_object` over `pg_catalog`), typed in `src/types.ts` (`ColumnDetails`, `ConstraintDetails`, `ForeignKeyDetails`, `IndexDetails`, `PermissionDetails`, mapped by `ItemDetailsMap`). `src/features/schema/itemScreens.tsx` has one screen per kind plus the shared blocks (`Properties`, `Section`, `Table`, `Code`). A new kind needs: the SQL branch, its type + `ItemDetailsMap` entry, and a screen.

## Connection folders and ordering

Stored in `pg-studio.sqlite`: table `connection_folders` (id, name, position) and columns `folder_id`/`position` on `connections` (added by `storage::connections::init` on older databases; ties fall back to the name). Folders are flat. `Sidebar` uses native HTML5 drag and drop (hence `dragDropEnabled: false` on the window in `tauri.conf.json`): drop a connection on a folder (end of it), on a connection (before it, in its folder) or on the strip below the list (top level); drop a folder on a folder (before it) or on the strip (end). `features/connections/connectionOrder.ts` computes the new order (tested), `useConnections` applies it optimistically and persists the whole order via `reorder_connections` / `reorder_folders`. Deleting a folder moves its connections to the top level. While connected only the active connection is shown, without dragging. Collapsed folders are UI state only.

## Connection passwords

Passwords are never kept in SQLite. `src-tauri/src/secrets.rs` (`Secrets`, in `AppState.secrets`) stores them in the OS credential store via the `keyring` crate (service `pg-studio`, user `connection-<id>`; the backend feature is chosen per target in `Cargo.toml`). Where there is none (probed once; e.g. WSL or Linux without a Secret Service) it uses `vault.json` instead: entries encrypted with ChaCha20-Poly1305 under a key derived from a master password (Argon2id). The key lives in memory only, after `vault_open(password, create)`; the frontend gets the state from `vault_status` and `useVault()` (`ensureVault()` asks for / creates the master password when needed; called before saving a password, testing with a stored one and connecting). A forgotten master password cannot be recovered.

`list_connections` returns passwords blank; saving with a blank password keeps the stored one. **Duplicate** (sidebar menu or button) opens `ConnectionDialog` with a copy (`id` null, name `… (copy)`, same folder) and `copyOf` = the source id: `save_connection` / `test_connection` take `secrets_from` and fill a blank password / SSH secret with the source's stored ones (`inherit_secrets`), so the copy keeps the password unless a new one is typed. **Editing the open connection** reconnects (`App.saved`) when something it depends on changed (`features/connections/connectionChange.ts`: host, port, database, user, ssl, SSH settings or a newly typed secret; a new name, folder or environment does not), asking for the password again if it is not stored (`connectTo`). `save_password` (checkbox in `ConnectionDialog`) decides whether to store at all: when off, the password is asked in a masked `dialogs.prompt(..., { secret: true })` at each connect and passed to `connect(id, password)`. Passwords left in SQLite by older versions are moved into the store at startup and after the vault is unlocked (`storage::connections::migrate_passwords`); until then they still work.

## SSH tunnel

A connection can reach the server through SSH (`ssh_*` fields of `ConnectionConfig`/`Conn`, columns in `connections`). `src-tauri/src/tunnel.rs` (russh) authenticates with a private key (optional passphrase), a password or the ssh-agent, then listens on `127.0.0.1:<random port>` and forwards each connection to the database `host:port` through the SSH server. `AppState::route` (`state.rs`) opens the tunnel and returns the config `pg::open` should use (host/port pointing at the local end); `Active` keeps the `Tunnel` alive (dropping it closes everything), the tunneled `config` for `pg::open` / the background count, and the `origin` config so a dropped connection rebuilds the tunnel in `AppState::client`. The SSH password / passphrase is `ssh_secret`: handled exactly like `password` (secret store key `connection-<id>-ssh`, blank in lists, blank on save keeps it, asked at connect when `save_password` is off). Host keys use trust on first use (`src-tauri/src/known_hosts.rs`, persisted in `known_hosts.json`): a changed key is refused until the server is forgotten in Settings › Security (`KnownHostsList`, commands `list_known_hosts` / `forget_known_host`). The ssh-agent uses `SSH_AUTH_SOCK` on unix and the OpenSSH named pipe on Windows.

## Context menus

The webview's native menu is blocked globally (`main.tsx`); every place that needs one renders its own with the Radix `ContextMenu` (`ui/context-menu.tsx`): text fields (`ui/input.tsx` → `FieldMenu`: cut / copy / paste / select all), the SQL editor (`SqlEditor`: run, run statement, beautify + edit entries), the results grid (`ResultViewer`), and the sidebar (connections, folders, tables). `components/EditMenu.tsx` has the shared edit entries (`EditMenuItems`). Paste reads the clipboard with `navigator.clipboard.readText()`; when the webview refuses it, Ctrl+V still works. To add a menu, wrap the element in `ContextMenu` + `ContextMenuTrigger asChild` and keep it to the actions that make sense there.

## Menu and preferences

- `AppMenu` (`src/app/AppMenu.tsx`, radix menubar in `ui/menubar.tsx`) is the menu bar: File, Query, Connection, Settings, Help. It only receives callbacks (`MenuActions`); `App` wires them to `useDocuments`, the connections hook and `QueryView`'s handle (`QueryViewHandle`: run, runAtCursor, format, saveQuery). Keyboard shortcuts are handled in `QueryView`; the menu only displays them, so keep both in sync.
- `SettingsDialog` edits the settings through `useSettings().update`; changes apply and persist immediately.
- Fonts: the font packages (`@fontsource-variable/*`) are imported in `index.css` and listed in `src/features/settings/fonts.ts` (`UI_FONTS`, `EDITOR_FONTS`: id, label, CSS family). `SettingsProvider` copies the chosen families into the CSS variables `--app-font-sans` / `--app-font-mono` on the root; Tailwind's `font-sans` / `font-mono` and the CodeMirror theme read those. To offer a new font: add the package import in `index.css` and an entry in `fonts.ts`. An unknown saved id falls back to the first option.

## Themes

A theme is a JSON file `{ name, type: "dark" | "light", colors: { <token>: <css color> } }` (format and tokens in `src/styles/themes/README.md`). The built-in ones (Dark, Light, Dracula, Omni) are `src/styles/themes/*.json`, bundled and ordered by `src/features/settings/themes.ts` (which also reserves their names; `dark` and `light` are the base that partial themes are completed from; Dracula and Omni follow their official palettes); imported ones are files in the `styles` folder of the app data directory (`persist/themes.rs`, commands `list_themes` / `save_theme` / `delete_theme`; only a slug is accepted as an id, so a file name cannot escape the folder). The backend only stores text; `src/features/settings/theme.ts` validates it (`parseTheme`: known tokens only, colors checked against a safe pattern since they end up in CSS) and completes a partial theme from the built-in theme of its type (`resolveColors`).

`ThemeProvider` (`features/settings/useTheme.tsx`, inside `SettingsProvider`) picks the theme from `settings.theme` (`system` follows the OS between the built-in dark and light), writes its colors to the root as CSS variables and toggles the `dark` class from the theme's `type`; `useTheme().dark` is what the editor uses to choose its syntax highlighting. `index.css` keeps only a first-paint fallback for `--background` / `--foreground`: to change a built-in color edit the JSON, not the CSS. Settings › Appearance (`ThemeSettings`) lists the themes, imports one from pasted text or a file (`ImportThemeDialog`, errors shown inside the dialog), copies the current theme as a template and deletes imported themes.

## Updates and release notes

- **Updater:** `tauri-plugin-updater` + `tauri-plugin-process` (registered in `run()`, permissions in `capabilities/default.json`). `plugins.updater` in `tauri.conf.json` has the public key and the endpoint (`releases/latest/download/latest.json` on GitHub); `bundle.createUpdaterArtifacts` makes the build produce signed update packages. `App` checks once at startup (unless `checkForUpdates` is off; failures are ignored) and Help › Check for updates… checks on demand (`useUpdater`). A found update opens `UpdateDialog` (its notes, Install and restart / Later). The notes are `latest.json`'s `notes`, which `tauri-action` only fills from its `releaseBody` input: `release.yml` reads the body of the release created by the `prepare` job and passes it (without that the dialog showed no notes until after the update, when `WhatsNewDialog` reads the bundled `CHANGELOG.md`). `noteBlocks` (`features/updates/changelog.ts`) turns the markdown body into headings, bullets and text.
- **Signing key:** the private key is NOT in the repo. It lives at `~/.tauri/pg-studio.key` on the maintainer's machine and in the GitHub secrets `TAURI_SIGNING_PRIVATE_KEY` (+ `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, empty for the current key), which `release.yml` passes to `tauri-action`. Losing it, or changing the public key, means installed copies can no longer update.
- **What changed:** `CHANGELOG.md` (repo root) has one `## v<version> - <date>` section per release with `- ` bullets; the release workflow prepends the new section and commits it with the version bump. The app bundles the file (`src/features/updates/releases.ts`, parsed by `features/updates/changelog.ts`). On startup `App` compares `Session.seenVersion` (what the user last ran) with `APP_VERSION` (injected by Vite from `package.json`) and, if the app was updated, opens `WhatsNewDialog` with the releases in between; a first run (no `seenVersion`) shows nothing. Help › What's new… shows the whole history. Keep the section format, the parser depends on it.

## End-to-end tests (`e2e/`)

`bun run e2e` (or `bash e2e/run.sh [playwright args]`) runs Playwright flows against the real app in an isolated Docker Compose environment (`e2e/docker-compose.yml`): `postgres` (seeded by `fixtures/seed.sql`), `bastion` (sshd that generates test keys in a shared volume), `backend`, `web` and `tests`. Nothing from the host is used and no ports are published; images build with `network: host` only to download packages. The run builds the images, runs the tests and tears everything down (`down -v`); reports go to `e2e/reports`.

Playwright cannot drive the native Tauri window on Linux, so the production frontend runs in Chromium and its `invoke` is replaced (`support/tauri-shim.ts`) by calls to `src-tauri/src/bin/e2e_server.rs` (cargo feature `e2e`): the app's real commands (`configure()` in `lib.rs`) on Tauri's mock runtime behind HTTP. Each test gets its own app instance and data directory (`x-e2e-session` header), so tests are independent and run in parallel. The shim answers the "save as" dialog with `window.__E2E_SAVE_PATH` (`studio.answerSaveDialog`, files read back with `studio.readBackendFile`). Not covered: the native window, the other plugins (dialogs, events) and the OS keychain (there is none in the containers, so the master-password vault is what gets tested).

Tests only act through the interface (`support/studio.ts` names the recurring gestures; `support/test.ts` provides the `studio` fixture). Tests that change data create tables with unique names. To add a flow: a `tests/<area>.spec.ts` with the fixture; test data belongs in `fixtures/seed.sql`. The Playwright version in `e2e/package.json` must match the image tag in `docker/tests.Dockerfile`.

## README

`README.md` is the public face of the project (pitch, feature list, install, build, local data). Keep it in sync in the same change that alters what it describes:

- A user-visible feature is added, changed or removed → update the matching bullet under **Features** (keep the grouped sections: SQL editor, Results grid, Exports, Browsing, Connections, Personalization); new capabilities of note may also go in **Why PG Studio**.
- A file is added to or removed from the app data directory → update the **Local data** table.
- Commands, requirements or supported platforms change (`package.json` scripts, `release.yml` matrix, Tauri prerequisites) → update **Install** / **Build from source**.
- A top-level folder is added → update **Project layout**.

Write it for users, not contributors: short, benefit-first bullets with the real shortcuts and names; internals belong here in `AGENTS.md`. Do not claim anything the app does not do. The project is MIT-licensed (`LICENSE`); keep the badge and the License section in step if that changes. Release notes stay in `CHANGELOG.md`, which the release workflow generates; do not edit it by hand.

## Conventions

- Never call `window.confirm/alert/prompt`: the webview places them at arbitrary spots. Use `useDialogs()` (`confirm`, `alert`, `prompt`; all async, in `src/hooks/useDialogs.tsx`).
- Backend errors are `String` (`CmdResult<T>`); on the frontend use `errText`.
- `Mutex` locks never cross an `.await`.
- Keep changes minimal and in the right owner of the responsibility; no speculative abstractions.
