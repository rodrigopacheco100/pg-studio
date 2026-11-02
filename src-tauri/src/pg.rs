//! Connection and SQL execution on Postgres.
//!
//! Uses the simple protocol (`simple_query`): every value comes back as text (or NULL),
//! which avoids mapping Postgres types and allows several statements per execution.

use crate::local::ConnectionConfig;
use serde::Serialize;
use tokio_postgres::error::ErrorPosition;
use std::time::Duration;
use postgres_native_tls::MakeTlsConnector;
use tokio_postgres::{CancelToken, Client, Config, NoTls, SimpleQueryMessage};

#[derive(Serialize, Default)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<Option<String>>>,
    /// Affected/returned rows, as reported by the server's CommandComplete.
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

/// Connection with the token that allows cancelling the running query.
pub struct Session {
    pub client: Client,
    token: CancelToken,
    tls: Option<MakeTlsConnector>,
}

impl Session {
    /// Asks the server to interrupt the query running on this connection.
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
        // TCP's default is to probe after 2 h of idleness; networks and proxies drop idle
        // connections well before that. Probing every 30 s keeps the connection alive and reveals drops early.
        .keepalives(true)
        .keepalives_idle(Duration::from_secs(30));

    if c.ssl {
        // Equivalent to libpq's sslmode=require: encrypts, but does not validate the certificate.
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
        let (client, conn) = cfg.connect(NoTls).await.map_err(|e| error_text(&e, None))?;
        tauri::async_runtime::spawn(async move {
            let _ = conn.await;
        });
        Ok(Session { token: client.cancel_token(), client, tls: None })
    }
}

/// 1-based line and column of the 1-based character `position` in `sql`.
fn line_col(sql: &str, position: u32) -> (usize, usize) {
    let before = sql.chars().take(position.saturating_sub(1) as usize);
    let (mut line, mut col) = (1, 1);
    for c in before {
        if c == '\n' {
            line += 1;
            col = 1;
        } else {
            col += 1;
        }
    }
    (line, col)
}

/// The message to show for a failed command. `tokio_postgres::Error` alone says just "db error";
/// the server's own report (message, detail, hint, position…) is what explains what went wrong.
fn error_text(e: &tokio_postgres::Error, sql: Option<&str>) -> String {
    let Some(db) = e.as_db_error() else { return e.to_string() };
    let mut out = format!("{}: {}", db.severity(), db.message());
    let mut add = |label: &str, value: Option<&str>| {
        if let Some(v) = value {
            out.push_str(&format!("\n{label}: {v}"));
        }
    };
    add("Detail", db.detail());
    add("Hint", db.hint());
    if let (Some(ErrorPosition::Original(pos)), Some(sql)) = (db.position(), sql) {
        let (line, col) = line_col(sql, *pos);
        add("Position", Some(&format!("line {line}, column {col}")));
    }
    add("Where", db.where_());
    add("Schema", db.schema());
    add("Table", db.table());
    add("Column", db.column());
    add("Constraint", db.constraint());
    add("SQLSTATE", Some(db.code().code()));
    out
}

/// Runs `sql` (one or more statements) and returns one result per statement.
pub async fn run(client: &Client, sql: &str) -> Result<Vec<QueryResult>, String> {
    let messages = client.simple_query(sql).await.map_err(|e| error_text(&e, Some(sql)))?;

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

/// Tables/views with their columns (used by the editor's autocomplete).
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
            let table = tables.last_mut().expect("table was just inserted");
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

/// Total rows of the table, ignoring pagination.
pub async fn table_count(client: &Client, schema: &str, table: &str) -> Result<u64, String> {
    let sql = format!("SELECT count(*) FROM {}.{}", quote_ident(schema), quote_ident(table));
    let res = run(client, &sql).await?.into_iter().next().unwrap_or_default();
    res.rows
        .into_iter()
        .next()
        .and_then(|row| row.into_iter().next().flatten())
        .and_then(|n| n.parse().ok())
        .ok_or_else(|| "invalid count".to_string())
}

#[derive(Serialize)]
pub struct DetailItem {
    pub name: String,
    pub detail: String,
}

fn quote_literal(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

/// Catalog details of one table, for the sidebar tree. `kind` is one of `columns`, `constraints`,
/// `foreign_keys`, `indexes` or `permissions`.
pub async fn table_details(client: &Client, schema: &str, table: &str, kind: &str) -> Result<Vec<DetailItem>, String> {
    let rel = format!("{}::regclass", quote_literal(&format!("{}.{}", quote_ident(schema), quote_ident(table))));
    let sql = match kind {
        "columns" => format!(
            r#"SELECT a.attname,
                      format_type(a.atttypid, a.atttypmod)
                      || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
                      || COALESCE(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), '')
               FROM pg_attribute a
               LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
               WHERE a.attrelid = {rel} AND a.attnum > 0 AND NOT a.attisdropped
               ORDER BY a.attnum"#
        ),
        "constraints" => format!(
            "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
             WHERE conrelid = {rel} AND contype <> 'f' ORDER BY contype, conname"
        ),
        "foreign_keys" => format!(
            "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
             WHERE conrelid = {rel} AND contype = 'f' ORDER BY conname"
        ),
        "indexes" => format!(
            r#"SELECT c.relname,
                      CASE WHEN i.indisunique THEN 'UNIQUE ' ELSE '' END
                      || regexp_replace(pg_get_indexdef(i.indexrelid), '^CREATE (UNIQUE )?INDEX \S+ ON \S+ ', '')
               FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
               WHERE i.indrelid = {rel} ORDER BY c.relname"#
        ),
        "permissions" => format!(
            "SELECT grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type)
             FROM information_schema.table_privileges
             WHERE table_schema = {} AND table_name = {}
             GROUP BY grantee ORDER BY grantee",
            quote_literal(schema),
            quote_literal(table)
        ),
        other => return Err(format!("unknown detail kind: {other}")),
    };
    let res = run(client, &sql).await?.into_iter().next().unwrap_or_default();
    Ok(res
        .rows
        .into_iter()
        .map(|row| {
            let mut it = row.into_iter();
            DetailItem { name: it.next().flatten().unwrap_or_default(), detail: it.next().flatten().unwrap_or_default() }
        })
        .collect())
}

/// Everything the catalog knows about one item of a table (a column, constraint, foreign key, index or
/// grantee), as a JSON document whose shape depends on `kind` (see `ItemDetails` in `src/types.ts`).
pub async fn table_item(client: &Client, schema: &str, table: &str, kind: &str, name: &str) -> Result<serde_json::Value, String> {
    let rel = format!("{}::regclass", quote_literal(&format!("{}.{}", quote_ident(schema), quote_ident(table))));
    let (s, t, n) = (quote_literal(schema), quote_literal(table), quote_literal(name));
    let sql = match kind {
        "columns" => format!(
            r#"SELECT json_build_object(
                 'name', a.attname,
                 'position', a.attnum,
                 'type', format_type(a.atttypid, a.atttypmod),
                 'notNull', a.attnotnull,
                 'default', pg_get_expr(d.adbin, d.adrelid),
                 'identity', CASE a.attidentity WHEN 'a' THEN 'ALWAYS' WHEN 'd' THEN 'BY DEFAULT' END,
                 'generated', CASE a.attgenerated WHEN 's' THEN 'STORED' END,
                 'collation', CASE WHEN a.attcollation <> t.typcollation
                                   THEN (SELECT collname FROM pg_collation WHERE oid = a.attcollation) END,
                 'storage', CASE a.attstorage WHEN 'p' THEN 'PLAIN' WHEN 'e' THEN 'EXTERNAL'
                                              WHEN 'm' THEN 'MAIN' WHEN 'x' THEN 'EXTENDED' END,
                 'statisticsTarget', a.attstattarget,
                 'comment', col_description(a.attrelid, a.attnum),
                 'constraints', (SELECT coalesce(json_agg(json_build_object('name', c.conname, 'definition', pg_get_constraintdef(c.oid, true)) ORDER BY c.conname), '[]'::json)
                                 FROM pg_constraint c WHERE c.conrelid = a.attrelid AND a.attnum = ANY(c.conkey)),
                 'indexes', (SELECT coalesce(json_agg(ic.relname ORDER BY ic.relname), '[]'::json)
                             FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid
                             WHERE i.indrelid = a.attrelid AND a.attnum = ANY(i.indkey::int2[])),
                 'referencedBy', (SELECT coalesce(json_agg(json_build_object('name', c.conname, 'table', c.conrelid::regclass::text, 'definition', pg_get_constraintdef(c.oid, true)) ORDER BY c.conname), '[]'::json)
                                  FROM pg_constraint c WHERE c.confrelid = a.attrelid AND c.contype = 'f' AND a.attnum = ANY(c.confkey))
               )::text
               FROM pg_attribute a
               JOIN pg_type t ON t.oid = a.atttypid
               LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
               WHERE a.attrelid = {rel} AND a.attname = {n} AND a.attnum > 0 AND NOT a.attisdropped"#
        ),
        "constraints" => format!(
            r#"SELECT json_build_object(
                 'name', c.conname,
                 'type', CASE c.contype WHEN 'p' THEN 'PRIMARY KEY' WHEN 'u' THEN 'UNIQUE' WHEN 'c' THEN 'CHECK'
                                        WHEN 'x' THEN 'EXCLUDE' WHEN 't' THEN 'TRIGGER' ELSE c.contype::text END,
                 'definition', pg_get_constraintdef(c.oid, true),
                 'columns', (SELECT coalesce(json_agg(a.attname ORDER BY k.ord), '[]'::json)
                             FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
                             JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum),
                 'deferrable', c.condeferrable,
                 'deferred', c.condeferred,
                 'validated', c.convalidated,
                 'noInherit', c.connoinherit,
                 'index', (SELECT relname FROM pg_class WHERE oid = c.conindid AND c.conindid <> 0),
                 'comment', obj_description(c.oid, 'pg_constraint')
               )::text
               FROM pg_constraint c
               WHERE c.conrelid = {rel} AND c.conname = {n} AND c.contype <> 'f'"#
        ),
        "foreign_keys" => format!(
            r#"SELECT json_build_object(
                 'name', c.conname,
                 'definition', pg_get_constraintdef(c.oid, true),
                 'referencedTable', c.confrelid::regclass::text,
                 'columns', (SELECT coalesce(json_agg(json_build_object('column', a.attname, 'referencedColumn', ra.attname) ORDER BY k.ord), '[]'::json)
                             FROM unnest(c.conkey, c.confkey) WITH ORDINALITY k(l, r, ord)
                             JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.l
                             JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = k.r),
                 'onUpdate', CASE c.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
                                                WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END,
                 'onDelete', CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
                                                WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END,
                 'match', CASE c.confmatchtype WHEN 'f' THEN 'FULL' WHEN 'p' THEN 'PARTIAL' ELSE 'SIMPLE' END,
                 'deferrable', c.condeferrable,
                 'deferred', c.condeferred,
                 'validated', c.convalidated,
                 'comment', obj_description(c.oid, 'pg_constraint')
               )::text
               FROM pg_constraint c
               WHERE c.conrelid = {rel} AND c.conname = {n} AND c.contype = 'f'"#
        ),
        "indexes" => format!(
            r#"SELECT json_build_object(
                 'name', ic.relname,
                 'definition', pg_get_indexdef(i.indexrelid),
                 'method', am.amname,
                 'unique', i.indisunique,
                 'primary', i.indisprimary,
                 'valid', i.indisvalid,
                 'clustered', i.indisclustered,
                 'predicate', pg_get_expr(i.indpred, i.indrelid, true),
                 'keyColumns', i.indnkeyatts,
                 'columns', (SELECT coalesce(json_agg(pg_get_indexdef(i.indexrelid, k, true) ORDER BY k), '[]'::json)
                             FROM generate_series(1, i.indnatts) k),
                 'size', pg_size_pretty(pg_relation_size(i.indexrelid)),
                 'tablespace', (SELECT spcname FROM pg_tablespace WHERE oid = ic.reltablespace),
                 'constraint', (SELECT conname FROM pg_constraint WHERE conindid = i.indexrelid AND conrelid = i.indrelid LIMIT 1),
                 'comment', obj_description(i.indexrelid, 'pg_class')
               )::text
               FROM pg_index i
               JOIN pg_class ic ON ic.oid = i.indexrelid
               JOIN pg_am am ON am.oid = ic.relam
               WHERE i.indrelid = {rel} AND ic.relname = {n}"#
        ),
        "permissions" => format!(
            r#"SELECT json_build_object(
                 'grantee', {n},
                 'owner', (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = {rel}),
                 'privileges', (SELECT coalesce(json_agg(json_build_object('privilege', privilege_type, 'grantor', grantor, 'grantable', is_grantable = 'YES') ORDER BY privilege_type), '[]'::json)
                                FROM information_schema.table_privileges
                                WHERE table_schema = {s} AND table_name = {t} AND grantee = {n}),
                 'columnPrivileges', (SELECT coalesce(json_agg(json_build_object('column', column_name, 'privilege', privilege_type, 'grantable', is_grantable = 'YES') ORDER BY column_name, privilege_type), '[]'::json)
                                      FROM information_schema.column_privileges
                                      WHERE table_schema = {s} AND table_name = {t} AND grantee = {n}
                                        AND NOT EXISTS (SELECT 1 FROM information_schema.table_privileges tp
                                                        WHERE tp.table_schema = {s} AND tp.table_name = {t}
                                                          AND tp.grantee = {n} AND tp.privilege_type = column_privileges.privilege_type))
               )::text"#
        ),
        other => return Err(format!("unknown detail kind: {other}")),
    };
    let res = run(client, &sql).await?.into_iter().next().unwrap_or_default();
    let json = res
        .rows
        .into_iter()
        .next()
        .and_then(|row| row.into_iter().next().flatten())
        .ok_or_else(|| format!("{name} was not found"))?;
    serde_json::from_str(&json).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::line_col;

    #[test]
    fn line_col_counts_characters_and_lines() {
        let sql = "select 1;\nselect ç, x from t";
        assert_eq!(line_col(sql, 1), (1, 1));
        assert_eq!(line_col(sql, 11), (2, 1));
        // `x` is the 11th character of line 2 although `ç` takes two bytes.
        assert_eq!(line_col(sql, 10 + 11), (2, 11));
    }
}
