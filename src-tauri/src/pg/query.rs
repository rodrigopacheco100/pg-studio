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
    /// For each column, the foreign keys it is part of (whose columns are all in the result); empty when no
    /// column is part of one.
    pub refs: Vec<Vec<FkTarget>>,
    /// Affected/returned rows, as reported by the server's CommandComplete.
    pub affected: Option<u64>,
}

/// A column of a foreign key: where it is in the result and the referenced column it points to.
#[derive(Serialize, Clone)]
pub struct FkColumn {
    pub index: usize,
    pub column: String,
}

/// A foreign key whose columns are all in the result, and the table it references.
#[derive(Serialize, Clone)]
pub struct FkTarget {
    pub name: String,
    pub schema: String,
    pub table: String,
    pub columns: Vec<FkColumn>,
}

/// Like `run`, then labels the columns of each result with their PostgreSQL type. The simple protocol
/// sends every value as text without saying what it is, so `statements` (the individual statements of
/// `sql`, in order) are prepared to learn the types. Booleans come as `t`/`f` and are rewritten to
/// `true`/`false`. If the types cannot be matched to the results, they are left unlabeled.
pub async fn run_typed(client: &Client, sql: &str, statements: &[String]) -> Result<Vec<QueryResult>, String> {
    let mut results = run(client, sql).await?;
    let with_columns: Vec<usize> = (0..results.len()).filter(|&i| !results[i].columns.is_empty()).collect();
    let mut types: Vec<Vec<String>> = Vec::new();
    // (table oid, column number) of each column, where the server tells.
    let mut origins: Vec<Vec<Option<(u32, i16)>>> = Vec::new();
    for statement in statements {
        if types.len() == with_columns.len() {
            break;
        }
        // Prepared after the script ran, so statements that depend on earlier ones resolve.
        let Ok(prepared) = client.prepare(statement).await else { return Ok(results) };
        if !prepared.columns().is_empty() {
            types.push(prepared.columns().iter().map(|c| c.type_().name().to_string()).collect());
            origins.push(prepared.columns().iter().map(|c| c.table_oid().zip(c.column_id()).filter(|(o, _)| *o != 0)).collect());
        }
    }
    if types.len() != with_columns.len() {
        return Ok(results);
    }
    let keys = foreign_keys(client, origins.iter().flatten().flatten().map(|(o, _)| *o)).await;
    for ((i, names), origin) in with_columns.into_iter().zip(types).zip(origins) {
        let result = &mut results[i];
        if names.len() != result.columns.len() {
            continue;
        }
        let refs = fk_refs(&origin, &keys);
        if refs.iter().any(|r| !r.is_empty()) {
            result.refs = refs;
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

/// A foreign key of a table, from the catalog: its referencing column numbers and the referenced columns.
struct ForeignKey {
    table_oid: u32,
    name: String,
    schema: String,
    table: String,
    /// (column number in the referencing table, referenced column name), in key order.
    columns: Vec<(i16, String)>,
}

/// The foreign keys of the given tables. A failed lookup only means no buttons, so errors are ignored.
async fn foreign_keys(client: &Client, tables: impl Iterator<Item = u32>) -> Vec<ForeignKey> {
    let mut oids: Vec<String> = tables.map(|o| o.to_string()).collect();
    oids.sort();
    oids.dedup();
    if oids.is_empty() {
        return Vec::new();
    }
    let sql = format!(
        "SELECT c.conrelid::text, c.conname, n.nspname, rc.relname,
                (SELECT json_agg(json_build_array(k.l, ra.attname) ORDER BY k.ord)::text
                 FROM unnest(c.conkey, c.confkey) WITH ORDINALITY k(l, r, ord)
                 JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = k.r)
         FROM pg_constraint c
         JOIN pg_class rc ON rc.oid = c.confrelid
         JOIN pg_namespace n ON n.oid = rc.relnamespace
         WHERE c.contype = 'f' AND c.conrelid IN ({})
         ORDER BY c.conname",
        oids.join(", ")
    );
    let Ok(rows) = run(client, &sql).await else { return Vec::new() };
    let mut keys = Vec::new();
    for row in rows.into_iter().next().map(|r| r.rows).unwrap_or_default() {
        let Ok([Some(rel), Some(name), Some(schema), Some(table), Some(cols)]) = <[Option<String>; 5]>::try_from(row) else { continue };
        let (Ok(table_oid), Ok(columns)) = (rel.parse(), serde_json::from_str::<Vec<(i16, String)>>(&cols)) else { continue };
        keys.push(ForeignKey { table_oid, name, schema, table, columns });
    }
    keys
}

/// Per result column, the foreign keys it takes part in whose columns are all in the result.
fn fk_refs(origin: &[Option<(u32, i16)>], keys: &[ForeignKey]) -> Vec<Vec<FkTarget>> {
    let index_of = |oid: u32, num: i16| origin.iter().position(|o| *o == Some((oid, num)));
    origin
        .iter()
        .map(|o| {
            let Some((oid, num)) = *o else { return Vec::new() };
            keys.iter()
                .filter(|k| k.table_oid == oid && k.columns.iter().any(|(n, _)| *n == num))
                .filter_map(|k| {
                    let columns = k
                        .columns
                        .iter()
                        .map(|(n, name)| index_of(oid, *n).map(|index| FkColumn { index, column: name.clone() }))
                        .collect::<Option<Vec<_>>>()?;
                    Some(FkTarget { name: k.name.clone(), schema: k.schema.clone(), table: k.table.clone(), columns })
                })
                .collect()
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(name: &str, columns: &[(i16, &str)]) -> ForeignKey {
        ForeignKey {
            table_oid: 1,
            name: name.into(),
            schema: "public".into(),
            table: "t".into(),
            columns: columns.iter().map(|(n, c)| (*n, c.to_string())).collect(),
        }
    }

    #[test]
    fn fk_refs_offers_every_key_a_column_is_part_of() {
        // Result columns: a (1), b (2), c (3), all of table 1.
        let origin = vec![Some((1, 1)), Some((1, 2)), Some((1, 3))];
        let keys = [key("composite", &[(1, "x"), (2, "y")]), key("single_a", &[(1, "id")])];
        let refs = fk_refs(&origin, &keys);
        assert_eq!(refs[0].iter().map(|t| t.name.as_str()).collect::<Vec<_>>(), ["composite", "single_a"]);
        assert_eq!(refs[0][0].columns.iter().map(|c| c.index).collect::<Vec<_>>(), [0, 1]);
        assert_eq!(refs[1].len(), 1);
        assert!(refs[2].is_empty());
    }

    #[test]
    fn fk_refs_skips_keys_with_a_column_missing_from_the_result() {
        let origin = vec![Some((1, 1)), None];
        assert!(fk_refs(&origin, &[key("composite", &[(1, "x"), (2, "y")])])[0].is_empty());
    }
}
