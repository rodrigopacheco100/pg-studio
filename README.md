# PG Studio

Cliente desktop leve para PostgreSQL, feito com Tauri 2 (Rust) e React.

## Recursos

- Conexões salvas (com opção de SSL), abertas e fechadas pela sidebar
- Lista de tabelas do banco conectado; clique para ver o conteúdo, paginado
- Editor SQL (CodeMirror) com autocomplete de tabelas e colunas
- Execução com `Ctrl+Enter`; autocomplete com `Ctrl+Espaço`
- Histórico de queries executadas e queries salvas com nome
- Resultados com seleção de células e cópia como JSON, CSV, TSV e INSERT
- Reconexão automática quando a conexão cai, com aviso na barra de status
- Sidebar e editor redimensionáveis; os tamanhos são lembrados entre sessões

## Requisitos

- [Bun](https://bun.sh)
- [Rust](https://rustup.rs) (toolchain estável)
- [Dependências de sistema do Tauri 2](https://tauri.app/start/prerequisites/) para o seu sistema operacional

## Desenvolvimento

```sh
bun install
bun run tauri dev     # app completo (Tauri + Vite)
bun run dev           # só o frontend, em http://localhost:1420
bun test              # testes dos utilitários em src/lib
bun run build         # checagem de tipos + build do frontend
bun run tauri build   # gera o instalador
```

## Dados locais

Ficam no diretório de dados do app, no sistema operacional:

| Arquivo | Conteúdo |
|---|---|
| `pg-studio.sqlite` | conexões salvas, histórico e queries salvas |
| `settings.json` | configurações do programa (tamanhos da sidebar e do editor) |

As senhas das conexões ficam no SQLite sem criptografia.

## Estrutura

- `src/`: frontend React (componentes, views, hooks, utilitários)
- `src-tauri/`: backend Rust (comandos Tauri, acesso ao PostgreSQL, SQLite local, configurações)

Detalhes de arquitetura e convenções estão em [AGENTS.md](AGENTS.md).
