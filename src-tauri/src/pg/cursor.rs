//! Reading a big result a chunk at a time with a server-side cursor, for exports.

use super::error::error_text;
use super::query::run;
use tokio_postgres::Client;

const NAME: &str = "pg_studio_export";

/// A cursor on a `SELECT`, inside a read-only transaction that `close` ends.
pub struct Cursor<'a> {
    client: &'a Client,
    pub columns: Vec<String>,
    /// PostgreSQL type name of each column.
    pub types: Vec<String>,
}

impl<'a> Cursor<'a> {
    pub async fn open(client: &'a Client, select: &str) -> Result<Cursor<'a>, String> {
        // The simple protocol sends no types: prepare the statement to learn them.
        let prepared = client.prepare(select).await.map_err(|e| error_text(&e, Some(select)))?;
        let columns = prepared.columns().iter().map(|c| c.name().to_string()).collect();
        let types = prepared.columns().iter().map(|c| c.type_().name().to_string()).collect();
        client
            .batch_execute(&format!("BEGIN READ ONLY; DECLARE {NAME} NO SCROLL CURSOR FOR {select}"))
            .await
            .map_err(|e| error_text(&e, Some(select)))?;
        Ok(Cursor { client, columns, types })
    }

    /// The next `n` rows (none left: empty). Booleans come as `t` / `f` and are rewritten to `true` / `false`.
    pub async fn fetch(&self, n: u32) -> Result<Vec<Vec<Option<String>>>, String> {
        let mut rows = run(self.client, &format!("FETCH FORWARD {n} FROM {NAME}"))
            .await?
            .into_iter()
            .next()
            .map(|r| r.rows)
            .unwrap_or_default();
        for (c, ty) in self.types.iter().enumerate() {
            if ty == "bool" {
                for row in &mut rows {
                    row[c] = row[c].as_deref().map(|v| (if v == "t" { "true" } else { "false" }).to_string());
                }
            }
        }
        Ok(rows)
    }

    pub async fn close(self) {
        let _ = self.client.batch_execute("ROLLBACK").await;
    }
}
