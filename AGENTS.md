# PG Studio

Cliente desktop de PostgreSQL. Tauri 2 (Rust) + React 19 + TypeScript + Vite + Tailwind 4 + shadcn/radix. Editor SQL em CodeMirror. Idioma da UI e dos comentários: português (pt-BR).

## Comandos

- `bun run dev` / `bun run tauri dev`: frontend / app completo
- `bun run build`: `tsc --noEmit` + `vite build` (use `npx tsc --noEmit` como checagem rápida)
- `bun test`: testes de `src/lib/*.test.ts`
- `cargo check` em `src-tauri/`: checagem do backend

## Arquitetura

- `src-tauri/src/lib.rs`: `AppState` e comandos Tauri (`#[tauri::command]`). Todo comando novo entra em `generate_handler!` e ganha um wrapper em `src/api.ts` (único lugar que chama `invoke`).
- `src-tauri/src/local.rs`: SQLite local (`pg-studio.sqlite`): conexões salvas, histórico, queries salvas.
- `src-tauri/src/pg.rs`: acesso ao PostgreSQL (conexão, queries, tabelas).
- `src-tauri/src/settings.rs`: configurações do programa (ver abaixo).
- `src/App.tsx`: layout (sidebar + abas Query/Histórico/Salvas + status bar). O `QueryView` fica sempre montado para preservar o editor.
- `src/hooks/`: estado da UI (`useConnections`, `useResults`, `useSettings`). `src/components/`, `src/views/`, `src/lib/` (utilitários puros, com testes). Componentes shadcn em `src/components/ui/`.
- `src/types.ts`: tipos compartilhados com o backend (serde em camelCase onde indicado).

## Configurações do programa (`settings.json`)

Arquivo `settings.json` no diretório de dados do app (`app_data_dir`, junto do SQLite). **Toda** configuração do programa passa por aqui; não crie outro mecanismo (localStorage, outro arquivo etc.).

- Backend: `Settings` + `SettingsStore` em `settings.rs`, guardado em `AppState.settings`. Comandos `get_settings` / `set_settings` (substitui o objeto inteiro). Campos ausentes ou arquivo corrompido caem nos padrões (`#[serde(default)]`); a escrita é atômica (arquivo temporário + rename).
- Frontend: `SettingsProvider` (em `main.tsx`) carrega uma vez e expõe `useSettings()` → `{ settings, update(patch) }`. `update` aplica na hora e persiste com debounce de 300 ms. Só renderiza a app depois de carregar.
- Para adicionar uma configuração: (1) campo e padrão em `Settings`/`Default` (`settings.rs`); (2) campo em `Settings` de `src/types.ts` (mesmo nome em camelCase); (3) usar `useSettings()` onde precisar. Nada mais muda.

Configurações atuais:

| Campo | Padrão | Uso |
|---|---|---|
| `sidebarWidth` | 256 (px) | Largura da sidebar; limites 180–560 em `Sidebar.tsx` |
| `editorHeight` | 300 (px) | Altura do editor SQL sobre os resultados; mínimo 128, máximo 80% da área (`QueryView.tsx`) |

Valores são inteiros (`u32` no Rust); arredonde antes de gravar.

## Redimensionamento

`src/components/ResizeHandle.tsx`: alça arrastável (`axis` `x`/`y`) posicionada na borda direita/inferior do pai, que precisa ser `relative`. Recebe `size`, `min`, `max` e `onChange`; os limites são aplicados nela. O valor vem e vai para `useSettings()`.

## Convenções

- Erros do backend são `String` (`CmdResult<T>`); no frontend use `errText`.
- Locks do `Mutex` nunca atravessam `.await`.
- Mantenha a mudança mínima e no dono certo da responsabilidade; sem abstrações especulativas.
