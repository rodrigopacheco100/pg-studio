//! Conexão e execução de SQL no Postgres.
//!
//! Usa o protocolo simples (`simple_query`): todo valor volta como texto (ou NULL),
//! o que dispensa mapear tipos Postgres e permite várias instruções por execução.

use crate::local::ConnectionConfig;
use serde::Serialize;
use std::time::Duration;
use postgres_native_tls::MakeTlsConnector;
use tokio_postgres::{CancelToken, Client, Config, NoTls, SimpleQueryMessage};

#[derive(Serialize, Default)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<Option<String>>>,
    /// Linhas afetadas/retornadas, conforme o CommandComplete do servidor.
    pub affected: Option<u64>,
}

#[derive(Serialize)]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
}

#[derive(Serialize)]
pub struct TableInfo {
    pub schema: String,
    pub name: String,
    pub kind: String,
    pub columns: Vec<ColumnInfo>,
}

/// Conexão com o token que permite cancelar a query em andamento.
pub struct Session {
    pub client: Client,
    token: CancelToken,
    tls: Option<MakeTlsConnector>,
}

impl Session {
    /// Pede ao servidor para interromper a query em execução nesta conexão.
    pub async fn cancel(&self) {
        let _ = match &self.tls {
            Some(tls) => self.token.cancel_query(tls.clone()).await,
            None => self.token.cancel_query(NoTls).await,
        };
    }
}

pub async fn open(c: &ConnectionConfig) -> Result<Session, String> {
    let mut cfg = Config::new();
    cfg.host(&c.host)
        .port(c.port)
        .dbname(&c.database)
        .user(&c.user)
        .password(&c.password)
        .connect_timeout(Duration::from_secs(10))
        // O padrão do TCP é sondar após 2 h de ociosidade; redes e proxies derrubam conexões
        // ociosas bem antes disso. Sondar a cada 30 s mantém a conexão viva e revela quedas cedo.
        .keepalives(true)
        .keepalives_idle(Duration::from_secs(30));

    if c.ssl {
        // Equivale a sslmode=require do libpq: criptografa, mas não valida o certificado.
        let tls = native_tls::TlsConnector::builder()
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|e| e.to_string())?;
        let tls = MakeTlsConnector::new(tls);
        let (client, conn) = cfg.connect(tls.clone()).await.map_err(|e| e.to_string())?;
        tauri::async_runtime::spawn(async move {
            let _ = conn.await;
        });
        Ok(Session { token: client.cancel_token(), client, tls: Some(tls) })
    } else {
        let (client, conn) = cfg.connect(NoTls).await.map_err(|e| e.to_string())?;
        tauri::async_runtime::spawn(async move {
            let _ = conn.await;
        });
        Ok(Session { token: client.cancel_token(), client, tls: None })
    }
}

/// Executa `sql` (uma ou mais instruções) e devolve um resultado por instrução.
pub async fn run(client: &Client, sql: &str) -> Result<Vec<QueryResult>, String> {
    let messages = client.simple_query(sql).await.map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    let mut current: Option<QueryResult> = None;
    for msg in messages {
        match msg {
            SimpleQueryMessage::RowDescription(cols) => {
                current = Some(QueryResult {
                    columns: cols.iter().map(|c| c.name().to_string()).collect(),
                    ..Default::default()
                });
            }
            SimpleQueryMessage::Row(row) => {
                let res = current.get_or_insert_with(|| QueryResult {
                    columns: row.columns().iter().map(|c| c.name().to_string()).collect(),
                    ..Default::default()
                });
                res.rows
                    .push((0..row.columns().len()).map(|i| row.get(i).map(str::to_string)).collect());
            }
            SimpleQueryMessage::CommandComplete(n) => {
                let mut res = current.take().unwrap_or_default();
                res.affected = Some(n);
                results.push(res);
            }
            _ => {}
        }
    }
    Ok(results)
}

/// Tabelas/views com suas colunas (usadas no autocomplete do editor).
pub async fn list_tables(client: &Client) -> Result<Vec<TableInfo>, String> {
    let sql = "SELECT t.table_schema, t.table_name, t.table_type, c.column_name, c.data_type
               FROM information_schema.tables t
               LEFT JOIN information_schema.columns c
                 ON c.table_schema = t.table_schema AND c.table_name = t.table_name
               WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
                 AND t.table_schema NOT LIKE 'pg_toast%'
               ORDER BY t.table_schema, t.table_name, c.ordinal_position";
    let res = run(client, sql).await?.into_iter().next().unwrap_or_default();

    let mut tables: Vec<TableInfo> = Vec::new();
    for row in res.rows {
        let mut it = row.into_iter();
        let schema = it.next().flatten().unwrap_or_default();
        let name = it.next().flatten().unwrap_or_default();
        let kind = it.next().flatten().unwrap_or_default();
        let column = it.next().flatten();
        let data_type = it.next().flatten().unwrap_or_default();

        if tables.last().map_or(true, |t| t.schema != schema || t.name != name) {
            tables.push(TableInfo { schema, name, kind, columns: Vec::new() });
        }
        if let Some(column) = column {
            let table = tables.last_mut().expect("tabela acabou de ser inserida");
            table.columns.push(ColumnInfo { name: column, data_type });
        }
    }
    Ok(tables)
}

fn quote_ident(s: &str) -> String {
    format!("\"{}\"", s.replace('"', "\"\""))
}

pub async fn table_data(
    client: &Client,
    schema: &str,
    table: &str,
    limit: u32,
    offset: u32,
) -> Result<QueryResult, String> {
    let sql = format!(
        "SELECT * FROM {}.{} LIMIT {} OFFSET {}",
        quote_ident(schema),
        quote_ident(table),
        limit,
        offset
    );
    Ok(run(client, &sql).await?.into_iter().next().unwrap_or_default())
}

/// Total de linhas da tabela, ignorando paginação.
pub async fn table_count(client: &Client, schema: &str, table: &str) -> Result<u64, String> {
    let sql = format!("SELECT count(*) FROM {}.{}", quote_ident(schema), quote_ident(table));
    let res = run(client, &sql).await?.into_iter().next().unwrap_or_default();
    res.rows
        .into_iter()
        .next()
        .and_then(|row| row.into_iter().next().flatten())
        .and_then(|n| n.parse().ok())
        .ok_or_else(|| "contagem inválida".to_string())
}
