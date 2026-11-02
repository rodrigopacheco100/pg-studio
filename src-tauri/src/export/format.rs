//! The text of an export, built a chunk of rows at a time so a table never has to be held whole.

use crate::pg::{quote_ident, quote_literal};

/// A SQL literal: the quoted text, or `NULL`.
fn literal(v: Option<&str>) -> String {
    v.map_or_else(|| "NULL".to_string(), quote_literal)
}
use serde::Deserialize;
use serde_json::Value;

pub type Row = Vec<Option<String>>;

/// Rows per `INSERT` statement: one statement for a whole table would be too big to run.
const INSERT_BATCH: usize = 500;

#[derive(Deserialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Format {
    Csv,
    Json,
    Insert,
}

impl Format {
    pub fn name(self) -> &'static str {
        match self {
            Format::Csv => "csv",
            Format::Json => "json",
            Format::Insert => "insert",
        }
    }
}

/// Turns rows into the bytes of a file: `begin`, then `rows` for each chunk, then `end`.
pub struct RowWriter {
    format: Format,
    columns: Vec<String>,
    /// JSON keys: the column names, made unique (`select a.id, b.id` gives `id` and `id_2`).
    keys: Vec<String>,
    types: Vec<String>,
    /// `INSERT INTO <target>`, already quoted; only for `Format::Insert`.
    target: Option<String>,
    wrote_rows: bool,
}

impl RowWriter {
    pub fn new(format: Format, columns: Vec<String>, types: Vec<String>, target: Option<String>) -> Result<Self, String> {
        if format == Format::Insert && target.is_none() {
            return Err("INSERT statements need the table the rows come from".into());
        }
        let mut seen = std::collections::HashMap::<&str, usize>::new();
        let keys = columns
            .iter()
            .map(|c| {
                let n = seen.entry(c).or_insert(0);
                *n += 1;
                if *n == 1 { c.clone() } else { format!("{c}_{n}") }
            })
            .collect();
        Ok(Self { format, columns, keys, types, target, wrote_rows: false })
    }

    pub fn begin(&mut self) -> Vec<u8> {
        match self.format {
            Format::Csv => csv_line(self.columns.iter().map(|c| Some(c.as_str()))).into_bytes(),
            Format::Json => b"[".to_vec(),
            Format::Insert => Vec::new(),
        }
    }

    pub fn rows(&mut self, rows: &[Row]) -> Vec<u8> {
        if rows.is_empty() {
            return Vec::new();
        }
        let out = match self.format {
            Format::Csv => rows.iter().map(|r| csv_line(r.iter().map(|v| v.as_deref()))).collect(),
            Format::Json => {
                let objects: Vec<String> = rows.iter().map(|r| format!("\n  {}", self.json_object(r))).collect();
                let separator = if self.wrote_rows { "," } else { "" };
                format!("{separator}{}", objects.join(","))
            }
            Format::Insert => rows.chunks(INSERT_BATCH).map(|batch| self.insert_statement(batch)).collect(),
        };
        self.wrote_rows = true;
        out.into_bytes()
    }

    pub fn end(&mut self) -> Vec<u8> {
        match self.format {
            Format::Json => (if self.wrote_rows { "\n]\n" } else { "]\n" }).as_bytes().to_vec(),
            _ => Vec::new(),
        }
    }

    /// `{"id": "1", "data": {...}}`: values are text, except json / jsonb which are nested as JSON.
    fn json_object(&self, row: &Row) -> String {
        let pairs: Vec<String> = self
            .keys
            .iter()
            .zip(row)
            .enumerate()
            .map(|(i, (key, value))| {
                let json = match value {
                    None => Value::Null,
                    Some(v) if matches!(self.types.get(i).map(String::as_str), Some("json" | "jsonb")) => {
                        serde_json::from_str(v).unwrap_or_else(|_| Value::String(v.clone()))
                    }
                    Some(v) => Value::String(v.clone()),
                };
                format!("{}: {}", Value::String(key.clone()), json)
            })
            .collect();
        format!("{{{}}}", pairs.join(", "))
    }

    fn insert_statement(&self, batch: &[Row]) -> String {
        let columns = self.columns.iter().map(|c| quote_ident(c)).collect::<Vec<_>>().join(", ");
        let values = batch
            .iter()
            .map(|r| format!("  ({})", r.iter().map(|v| literal(v.as_deref())).collect::<Vec<_>>().join(", ")))
            .collect::<Vec<_>>()
            .join(",\n");
        format!("INSERT INTO {} ({columns}) VALUES\n{values};\n", self.target.as_deref().unwrap_or_default())
    }
}

fn csv_line<'a>(values: impl Iterator<Item = Option<&'a str>>) -> String {
    let cells: Vec<String> = values
        .map(|v| match v {
            None => String::new(),
            Some(v) if v.contains(['"', ',', '\r', '\n']) => format!("\"{}\"", v.replace('"', "\"\"")),
            Some(v) => v.to_string(),
        })
        .collect();
    format!("{}\n", cells.join(","))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(values: &[Option<&str>]) -> Row {
        values.iter().map(|v| v.map(String::from)).collect()
    }

    fn render(format: Format, columns: &[&str], types: &[&str], target: Option<&str>, chunks: &[Vec<Row>]) -> String {
        let mut w = RowWriter::new(
            format,
            columns.iter().map(|c| c.to_string()).collect(),
            types.iter().map(|c| c.to_string()).collect(),
            target.map(String::from),
        )
        .unwrap();
        let mut out = w.begin();
        for chunk in chunks {
            out.extend(w.rows(chunk));
        }
        out.extend(w.end());
        String::from_utf8(out).unwrap()
    }

    #[test]
    fn csv_quotes_what_needs_it() {
        let rows = vec![row(&[Some("1"), Some("say \"hi\", ok")]), row(&[Some("2"), None])];
        assert_eq!(render(Format::Csv, &["id", "note"], &[], None, &[rows]), "id,note\n1,\"say \"\"hi\"\", ok\"\n2,\n");
    }

    #[test]
    fn csv_of_no_rows_is_the_header() {
        assert_eq!(render(Format::Csv, &["id"], &[], None, &[]), "id\n");
    }

    #[test]
    fn json_is_an_array_of_objects_across_chunks() {
        let out = render(
            Format::Json,
            &["id", "note"],
            &[],
            None,
            &[vec![row(&[Some("1"), Some("a\"b")])], vec![row(&[Some("2"), None])]],
        );
        let parsed: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(parsed, serde_json::json!([{"id": "1", "note": "a\"b"}, {"id": "2", "note": null}]));
        assert_eq!(render(Format::Json, &["id"], &[], None, &[]), "[]\n");
    }

    #[test]
    fn json_nests_json_columns_and_makes_keys_unique() {
        let out = render(
            Format::Json,
            &["id", "id", "data"],
            &["int4", "int4", "jsonb"],
            None,
            &[vec![row(&[Some("1"), Some("2"), Some("{\"a\": [1, 2]}")])]],
        );
        let parsed: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(parsed, serde_json::json!([{"id": "1", "id_2": "2", "data": {"a": [1, 2]}}]));
    }

    #[test]
    fn insert_quotes_everything_and_batches() {
        let rows: Vec<Row> = (0..501).map(|i| row(&[Some(&i.to_string()), Some("o'brien")])).collect();
        let out = render(Format::Insert, &["n", "Name"], &[], Some("\"public\".\"t\""), &[rows]);
        assert!(out.starts_with("INSERT INTO \"public\".\"t\" (\"n\", \"Name\") VALUES\n  ('0', 'o''brien'),\n"));
        assert_eq!(out.matches("INSERT INTO").count(), 2); // 500 + 1
        assert_eq!(out.lines().filter(|l| l.starts_with("  (")).count(), 501);
        assert!(out.ends_with("('500', 'o''brien');\n"));
    }

    #[test]
    fn insert_writes_null_and_needs_a_table() {
        let out = render(Format::Insert, &["a"], &[], Some("t"), &[vec![row(&[None])]]);
        assert_eq!(out, "INSERT INTO t (\"a\") VALUES\n  (NULL);\n");
        assert!(RowWriter::new(Format::Insert, vec![], vec![], None).is_err());
    }
}
