//! Connection and SQL execution on Postgres.
//!
//! Uses the simple protocol (`simple_query`): every value comes back as text (or NULL),
//! which avoids mapping Postgres types and allows several statements per execution.

mod catalog;
mod connection;
mod error;
mod query;

pub use catalog::{
    list_tables, table_count, table_data, table_details, table_item, DetailItem, TableInfo,
};
pub use connection::{open, set_statement_timeout, Session};
pub use query::{run_typed, QueryResult};
