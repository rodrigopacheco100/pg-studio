//! Running SQL: results come back as text, labeled with column types when they can be learned.

use super::error::error_text;
use serde::Serialize;
use tokio_postgres::{Client, SimpleQueryMessage};

#[derive(Serialize, Default)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<Option<String>>>,
    /// PostgreSQL type name of each column (`bool`, `int4`…); empty when it could not be determined.
    pub types: Vec<String>,
    /// Affected/returned rows, as reported by the server's CommandComplete.
    pub affected: Option<u64>,
}

/// Like `run`, then labels the columns of each result with their PostgreSQL type. The simple protocol
/// sends every value as text without saying what it is, so `statements` (the individual statements of
/// `sql`, in order) are prepared to learn the types. Booleans come as `t`/`f` and are rewritten to
/// `true`/`false`. If the types cannot be matched to the results, they are left unlabeled.
pub async fn run_typed(client: &Client, sql: &str, statements: &[String]) -> Result<Vec<QueryResult>, String> {
    let mut results = run(client, sql).await?;
    let with_columns: Vec<usize> = (0..results.len()).filter(|&i| !results[i].columns.is_empty()).collect();
    let mut types: Vec<Vec<String>> = Vec::new();
    for statement in statements {
        if types.len() == with_columns.len() {
            break;
        }
        // Prepared after the script ran, so statements that depend on earlier ones resolve.
        let Ok(prepared) = client.prepare(statement).await else { return Ok(results) };
        if !prepared.columns().is_empty() {
            types.push(prepared.columns().iter().map(|c| c.type_().name().to_string()).collect());
        }
    }
    if types.len() != with_columns.len() {
        return Ok(results);
    }
    for (i, names) in with_columns.into_iter().zip(types) {
        let result = &mut results[i];
        if names.len() != result.columns.len() {
            continue;
        }
        for (c, name) in names.iter().enumerate() {
            if name == "bool" {
                for row in &mut result.rows {
                    row[c] = row[c].as_deref().map(|v| (if v == "t" { "true" } else { "false" }).to_string());
                }
            }
        }
        result.types = names;
    }
    Ok(results)
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
