//! End-to-end test server: runs the app's real commands (SQLite, Postgres, SSH tunnel, vault) on Tauri's
//! mock runtime and exposes them over HTTP, so a browser driven by Playwright can use the real frontend
//! without a native window.
//!
//! `POST /ipc` takes `{"cmd": "...", "args": {...}}` and answers `{"ok": value}` or `{"err": value}`.
//! Each value of the `x-e2e-session` header gets its own app instance with its own data directory, so tests
//! are independent and can run in parallel. `GET /health` answers once the server is up.
//!
//! Only for tests: no authentication, permissive CORS. Environment: `PG_STUDIO_DATA_DIR` (required, parent of
//! the per-session directories), `E2E_PORT` (default 1430), `E2E_BIND` (default 127.0.0.1).

use pg_studio_lib::configure;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{ipc::{CallbackFn, InvokeBody, InvokeResponseBody}, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tiny_http::{Header, Method, Request, Response, Server};

type Sessions = Mutex<HashMap<String, Arc<WebviewWindow<MockRuntime>>>>;

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name, value).expect("valid header")
}

fn respond(request: Request, status: u16, body: Value) {
    let response = Response::from_string(body.to_string())
        .with_status_code(status)
        .with_header(header("Content-Type", "application/json"))
        .with_header(header("Access-Control-Allow-Origin", "*"))
        .with_header(header("Access-Control-Allow-Headers", "content-type, x-e2e-session"));
    let _ = request.respond(response);
}

/// The app instance of a session, created on first use with its own data directory.
fn session_window(sessions: &Sessions, root: &PathBuf, id: &str) -> Arc<WebviewWindow<MockRuntime>> {
    let mut sessions = sessions.lock().unwrap();
    sessions
        .entry(id.to_string())
        .or_insert_with(|| {
            let mut app = configure(mock_builder(), Some(root.join(id))).build(mock_context(noop_assets())).expect("build app");
            // One iteration is what runs the setup hook (state, stores); the deprecation is about looping on it.
            #[allow(deprecated)]
            app.run_iteration(|_, _| {});
            let window = WebviewWindowBuilder::new(&app, "main", WebviewUrl::default()).build().expect("window");
            std::mem::forget(app); // lives as long as the server
            Arc::new(window)
        })
        .clone()
}

fn main() {
    let root = PathBuf::from(std::env::var("PG_STUDIO_DATA_DIR").expect("PG_STUDIO_DATA_DIR must be set"));
    let port = std::env::var("E2E_PORT").unwrap_or_else(|_| "1430".into());
    let bind = std::env::var("E2E_BIND").unwrap_or_else(|_| "127.0.0.1".into());
    let sessions: Sessions = Mutex::new(HashMap::new());

    let server = Server::http(format!("{bind}:{port}")).expect("listen");
    eprintln!("e2e server listening on {bind}:{port}");
    // Commands run on their own threads, as they would in the real app: a long connect must not block the rest.
    std::thread::scope(|scope| {
        for mut request in server.incoming_requests() {
            let (sessions, root) = (&sessions, &root);
            scope.spawn(move || {
                if request.method() == &Method::Options {
                    return respond(request, 204, Value::Null);
                }
                if request.url() == "/health" {
                    return respond(request, 200, json!({ "ok": true }));
                }
                let session = request
                    .headers()
                    .iter()
                    .find(|h| h.field.equiv("x-e2e-session"))
                    .map(|h| h.value.to_string())
                    .unwrap_or_else(|| "default".into());
                if session.is_empty() || !session.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
                    return respond(request, 400, json!({ "err": "invalid session id" }));
                }
                let mut text = String::new();
                let _ = request.as_reader().read_to_string(&mut text);
                let Ok(call) = serde_json::from_str::<Value>(&text) else {
                    return respond(request, 400, json!({ "err": "invalid JSON" }));
                };
                let invoke = InvokeRequest {
                    cmd: call["cmd"].as_str().unwrap_or_default().to_string(),
                    callback: CallbackFn(0),
                    error: CallbackFn(1),
                    url: "tauri://localhost".parse().unwrap(), // a local origin, as in the real app
                    body: InvokeBody::Json(call["args"].clone()),
                    headers: Default::default(),
                    invoke_key: INVOKE_KEY.to_string(),
                };
                let window = session_window(sessions, root, &session);
                match get_ipc_response(&*window, invoke) {
                    Ok(InvokeResponseBody::Json(json)) => {
                        let value = serde_json::from_str::<Value>(&json).unwrap_or(Value::Null);
                        respond(request, 200, json!({ "ok": value }))
                    }
                    Ok(InvokeResponseBody::Raw(_)) => respond(request, 200, json!({ "ok": null })),
                    Err(err) => respond(request, 200, json!({ "err": err })),
                }
            });
        }
    });
}
