//! Turning Postgres errors into the text shown to the user.

use tokio_postgres::error::ErrorPosition;

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
pub(super) fn error_text(e: &tokio_postgres::Error, sql: Option<&str>) -> String {
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
