use std::fs;
use std::net::{SocketAddr, TcpListener, TcpStream, UdpSocket};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use tauri::Manager;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_shell::{process::CommandEvent, ShellExt};

const SERVER_HOST: &str = "0.0.0.0";
const LOCALHOST: &str = "127.0.0.1";
const SIDECAR_BINARY: &str = "rms-server-sidecar";
const WINDOW_LABEL: &str = "main";

fn format_http_url(host: &str, port: u16) -> String {
    if port == 80 {
        return format!("http://{host}");
    }

    format!("http://{host}:{port}")
}

fn detect_lan_ip() -> String {
    let socket = UdpSocket::bind("0.0.0.0:0");
    let Ok(socket) = socket else {
        return "127.0.0.1".to_string();
    };

    let _ = socket.connect("8.8.8.8:80");
    let Ok(address) = socket.local_addr() else {
        return "127.0.0.1".to_string();
    };

    address.ip().to_string()
}

fn eval_status_script(app: &tauri::AppHandle, script: &str) {
    let Some(window) = app.get_webview_window(WINDOW_LABEL) else {
        return;
    };

    if let Err(error) = window.eval(script) {
        eprintln!("[launcher] failed to evaluate script: {error}");
    }
}

fn append_log(app: &tauri::AppHandle, message: &str) {
    let script = format!("window.appendLog?.({message:?});");
    eval_status_script(app, &script);
}

fn set_runtime_info(
    app: &tauri::AppHandle,
    local_url: &str,
    lan_url: &str,
    db_path: &str,
) {
    let script = format!(
        "window.setRuntimeInfo?.({local_url:?}, {lan_url:?}, {db_path:?});"
    );
    eval_status_script(app, &script);
}

fn reserve_local_port() -> Result<u16, String> {
    let listener = TcpListener::bind((LOCALHOST, 0)).map_err(|error| error.to_string())?;
    let address = listener.local_addr().map_err(|error| error.to_string())?;
    Ok(address.port())
}

fn wait_for_server(port: u16, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    let address = SocketAddr::from(([127, 0, 0, 1], port));

    while Instant::now() < deadline {
        if TcpStream::connect_timeout(&address, Duration::from_millis(250)).is_ok() {
            return true;
        }

        std::thread::sleep(Duration::from_millis(200));
    }

    false
}

fn has_index_html(directory: &Path) -> bool {
    directory.join("index.html").is_file()
}

fn find_web_dist_in_resources(resource_dir: &Path) -> Option<PathBuf> {
    let direct_candidates = [
        resource_dir.to_path_buf(),
        resource_dir.join("web-dist"),
        resource_dir.join("dist"),
        resource_dir.join("web").join("dist"),
        resource_dir.join("_up_").join("_up_").join("web").join("dist"),
    ];

    for candidate in direct_candidates {
        if has_index_html(&candidate) {
            return Some(candidate);
        }
    }

    const MAX_SEARCH_DEPTH: usize = 5;
    let mut stack = vec![(resource_dir.to_path_buf(), 0usize)];

    while let Some((directory, depth)) = stack.pop() {
        if has_index_html(&directory) {
            return Some(directory);
        }

        if depth >= MAX_SEARCH_DEPTH {
            continue;
        }

        let Ok(entries) = fs::read_dir(&directory) else {
            continue;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push((path, depth + 1));
            }
        }
    }

    None
}

fn resolve_web_dist(app: &tauri::AppHandle) -> PathBuf {
    let workspace_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("web")
        .join("dist");

    if let Ok(resource_dir) = app.path().resource_dir() {
        if let Some(web_dist) = find_web_dist_in_resources(&resource_dir) {
            return web_dist;
        }
    }

    if has_index_html(&workspace_path) {
        return workspace_path;
    }

    workspace_path
}

fn start_sidecar(app: &tauri::AppHandle) -> Result<(), String> {
    append_log(app, "Preparing local runtime...");

    let server_port = reserve_local_port()?;
    append_log(app, &format!("Selected available port: {server_port}"));

    let app_data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;

    let db_path = app_data_dir.join("rms-local.db");
    let db_path_text = db_path.display().to_string();

    let web_dist = resolve_web_dist(app);
    let web_dist_text = web_dist.display().to_string();

    let lan_ip = detect_lan_ip();
    let local_url = format_http_url(LOCALHOST, server_port);
    let lan_url = format_http_url(&lan_ip, server_port);

    set_runtime_info(app, &local_url, &lan_url, &db_path_text);
    append_log(app, &format!("Database path: {db_path_text}"));
    append_log(app, &format!("Serving web assets from: {web_dist_text}"));
    append_log(app, &format!("LAN URL: {lan_url}"));

    let sidecar_args = vec![
        "--host".to_string(),
        SERVER_HOST.to_string(),
        "--port".to_string(),
        server_port.to_string(),
        "--db-path".to_string(),
        db_path_text,
        "--web-dist".to_string(),
        web_dist_text,
    ];

    append_log(app, "Starting sidecar runtime...");

    let (mut rx, sidecar) = app
        .shell()
        .sidecar(SIDECAR_BINARY)
        .map_err(|error| error.to_string())?
        .args(sidecar_args)
        .spawn()
        .map_err(|error| error.to_string())?;

    std::mem::forget(sidecar);

    let log_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line).trim().to_string();
                    if !text.is_empty() {
                        append_log(&log_handle, &format!("[sidecar] {text}"));
                    }
                }
                CommandEvent::Stderr(line) => {
                    let text = String::from_utf8_lossy(&line).trim().to_string();
                    if !text.is_empty() {
                        append_log(&log_handle, &format!("[sidecar:err] {text}"));
                    }
                }
                _ => {}
            }
        }
    });

    append_log(app, "Waiting for HTTP server readiness...");

    if wait_for_server(server_port, Duration::from_secs(10)) {
        append_log(app, "Server is ready. Opening browser...");

        app.opener()
            .open_url(&local_url, None::<&str>)
            .map_err(|error| error.to_string())?;

        append_log(app, &format!("Opened: {local_url}"));
        return Ok(());
    }

    append_log(app, "Server did not become ready within timeout.");
    Err("Sidecar readiness timeout".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
                if let Err(error) = window.show() {
                    eprintln!("[launcher] failed to show window: {error}");
                }
            }

            let app_handle = app.handle().clone();
            if let Err(error) = start_sidecar(&app_handle) {
                append_log(&app_handle, &format!("Launcher error: {error}"));
                eprintln!("[launcher] failed to start sidecar: {error}");
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
