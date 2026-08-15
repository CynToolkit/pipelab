use futures_util::{stream::SplitStream, SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{net::SocketAddr, sync::Arc};
use tauri::{
    async_runtime, webview::WebviewWindowBuilder, AppHandle, Manager, Runtime, WebviewUrl,
};
use tokio::{
    net::{TcpListener, TcpStream},
    sync::Mutex,
};
use tokio_tungstenite::{accept_async, tungstenite::Message, WebSocketStream};

// ---------------------------------------------------------------------------
// IPC message contracts (mirrors the Pipelab engine WebSocket protocol)
// ---------------------------------------------------------------------------

#[derive(Deserialize, Debug)]
struct IncomingMessage {
    url: String,
    #[serde(rename = "correlationId")]
    correlation_id: Option<String>,
    body: Option<Value>,
}

#[derive(Serialize, Debug)]
struct ResponseMessage<T: Serialize> {
    url: String,
    #[serde(rename = "correlationId")]
    correlation_id: Option<String>,
    body: T,
}

#[derive(Serialize, Debug)]
struct SuccessBody<T: Serialize> {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<T>,
}

#[derive(Serialize, Debug)]
struct ErrorBody {
    success: bool,
    error: String,
}

type Writer = Arc<Mutex<SplitSink<WebSocketStream<TcpStream>, Message>>>;

// ---------------------------------------------------------------------------
// WebSocket connection handling
// ---------------------------------------------------------------------------

async fn handle_websocket<R: Runtime>(stream: TcpStream, app_handle: AppHandle<R>) {
    let addr = stream
        .peer_addr()
        .expect("connected stream should have a peer address");
    println!("New WebSocket connection from: {}", addr);

    match accept_async(stream).await {
        Ok(ws_stream) => {
            println!("WebSocket connection established: {}", addr);
            let (write, read) = ws_stream.split();
            let writer: Writer = Arc::new(Mutex::new(write));
            process_messages(read, writer, app_handle).await;
            println!("WebSocket connection closed: {}", addr);
        }
        Err(e) => eprintln!("Error during WebSocket handshake for {}: {}", addr, e),
    }
}

async fn process_messages<R: Runtime>(
    mut read: SplitStream<WebSocketStream<TcpStream>>,
    writer: Writer,
    app_handle: AppHandle<R>,
    _addr: SocketAddr,
) {
    while let Some(result) = read.next().await {
        match result {
            Ok(Message::Text(text)) => {
                match serde_json::from_str::<IncomingMessage>(&text) {
                    Ok(message) => {
                        let writer = writer.clone();
                        let app = app_handle.clone();
                        tokio::spawn(async move {
                            if let Err(e) = route_message(message, writer, app).await {
                                eprintln!("Error handling message: {}", e);
                            }
                        });
                    }
                    Err(e) => {
                        eprintln!("Failed to parse message: {}", e);
                        let response = ResponseMessage {
                            url: "unknown".into(),
                            correlation_id: None,
                            body: ErrorBody {
                                success: false,
                                error: format!("Invalid JSON: {e}"),
                            },
                        };
                        if let Ok(json) = serde_json::to_string(&response) {
                            let mut w = writer.lock().await;
                            let _ = w.send(Message::Text(json)).await;
                        }
                    }
                }
            }
            Ok(Message::Close(_)) => break,
            Ok(_) => {}
            Err(e) => {
                eprintln!("WebSocket read error: {}", e);
                break;
            }
        }
    }
}

async fn route_message<R: Runtime>(
    message: IncomingMessage,
    writer: Writer,
    app_handle: AppHandle<R>,
) -> anyhow::Result<()> {
    println!("Routing message for URL: {}", message.url);
    match message.url.as_str() {
        "/engine" => handle_engine(message, writer).await?,
        "/paths" => handle_paths(message, writer).await?,
        "/fs/file/write" => handle_fs_write(message, writer).await?,
        "/window/maximize" => handle_window(message, writer, app_handle, WindowOp::Maximize).await?,
        "/window/minimize" => handle_window(message, writer, app_handle, WindowOp::Minimize).await?,
        "/window/restore" => handle_window(message, writer, app_handle, WindowOp::Restore).await?,
        "/window/unmaximize" => {
            handle_window(message, writer, app_handle, WindowOp::Unmaximize).await?
        }
        "/exit" => handle_exit(message, writer, app_handle).await?,
        url => {
            let response = ResponseMessage {
                url: url.to_string(),
                correlation_id: message.correlation_id.clone(),
                body: ErrorBody {
                    success: false,
                    error: format!("Unhandled URL: {url}"),
                },
            };
            let json = serde_json::to_string(&response)?;
            let mut w = writer.lock().await;
            w.send(Message::Text(json)).await?;
        }
    }
    Ok(())
}

#[derive(Debug)]
enum WindowOp {
    Maximize,
    Minimize,
    Restore,
    Unmaximize,
}

async fn handle_window<R: Runtime>(
    message: IncomingMessage,
    writer: Writer,
    app_handle: AppHandle<R>,
    op: WindowOp,
) -> anyhow::Result<()> {
    let response = ResponseMessage {
        url: message.url.clone(),
        correlation_id: message.correlation_id.clone(),
        body: SuccessBody {
            success: true,
            data: Option::<()>::None,
        },
    };
    let json = serde_json::to_string(&response)?;
    match app_handle.get_webview_window("main") {
        Some(window) => {
            #[cfg(desktop)]
            match op {
                WindowOp::Maximize => window.maximize()?,
                WindowOp::Minimize => window.minimize()?,
                WindowOp::Restore => {
                    if window.is_maximized()? {
                        window.unmaximize()?;
                    }
                    window.set_focus()?;
                    if !window.is_visible()? {
                        window.show()?;
                    }
                }
                WindowOp::Unmaximize => window.unmaximize()?,
            }
            #[cfg(mobile)]
            {
                println!("Window operation {:?} is not supported on mobile", op);
            }
            let mut w = writer.lock().await;
            w.send(Message::Text(json)).await?;
        }
        None => return Err(anyhow::anyhow!("Main window not found")),
    }
    Ok(())
}

async fn handle_engine(message: IncomingMessage, writer: Writer) -> anyhow::Result<()> {
    let response = ResponseMessage {
        url: message.url.clone(),
        correlation_id: message.correlation_id.clone(),
        body: SuccessBody {
            success: true,
            data: Option::<()>::None,
        },
    };
    let json = serde_json::to_string(&response)?;
    let mut w = writer.lock().await;
    w.send(Message::Text(json)).await?;
    Ok(())
}

async fn handle_paths(message: IncomingMessage, writer: Writer) -> anyhow::Result<()> {
    let data = serde_json::json!({
        "appData": "data",
        "documents": "data",
    });
    let response = ResponseMessage {
        url: message.url.clone(),
        correlation_id: message.correlation_id.clone(),
        body: SuccessBody {
            success: true,
            data: Some(data),
        },
    };
    let json = serde_json::to_string(&response)?;
    let mut w = writer.lock().await;
    w.send(Message::Text(json)).await?;
    Ok(())
}

async fn handle_fs_write(message: IncomingMessage, writer: Writer) -> anyhow::Result<()> {
    let body = message
        .body
        .ok_or_else(|| anyhow::anyhow!("Missing request body for /fs/file/write"))?;
    let _path = body
        .get("path")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("Missing 'path' field"))?;
    let _content = body
        .get("content")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("Missing 'content' field"))?;
    // TODO: persist the file using the configured user-data directory.
    let response = ResponseMessage {
        url: message.url.clone(),
        correlation_id: message.correlation_id.clone(),
        body: SuccessBody {
            success: true,
            data: Option::<()>::None,
        },
    };
    let json = serde_json::to_string(&response)?;
    let mut w = writer.lock().await;
    w.send(Message::Text(json)).await?;
    Ok(())
}

async fn handle_exit<R: Runtime>(
    message: IncomingMessage,
    writer: Writer,
    app_handle: AppHandle<R>,
) -> anyhow::Result<()> {
    let response = ResponseMessage {
        url: message.url.clone(),
        correlation_id: message.correlation_id.clone(),
        body: SuccessBody {
            success: true,
            data: Option::<()>::None,
        },
    };
    let json = serde_json::to_string(&response)?;
    let mut w = writer.lock().await;
    w.send(Message::Text(json)).await?;
    app_handle.exit(0);
    Ok(())
}

// ---------------------------------------------------------------------------
// WebSocket server (the on-device Pipelab engine bridge)
// ---------------------------------------------------------------------------

async fn start_websocket_server<R: Runtime>(app_handle: AppHandle<R>) {
    let addr = SocketAddr::from(([127, 0, 0, 1], 31753));
    let listener = match TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Failed to bind WebSocket server to {}: {}", addr, e);
            return;
        }
    };
    println!("Pipelab engine WebSocket server running on ws://{}", addr);

    loop {
        match listener.accept().await {
            Ok((stream, _)) => {
                let app = app_handle.clone();
                tokio::spawn(async move {
                    handle_websocket(stream, app).await;
                });
            }
            Err(e) => {
                eprintln!("Failed to accept connection: {}", e);
                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tauri entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        #[cfg(desktop)]
        .plugin(tauri_plugin_devtools::init())
        .setup(|app| {
            let handle = app.handle().clone();
            async_runtime::spawn(async move {
                start_websocket_server(handle).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Pipelab mobile");
}
