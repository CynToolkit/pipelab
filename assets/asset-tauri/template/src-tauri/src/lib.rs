use futures_util::{
    stream::{SplitSink, SplitStream},
    SinkExt, StreamExt,
};
use serde::{Deserialize, Serialize};
use serde_json::Value; // Using Value for flexibility in body initially
use std::{net::SocketAddr, sync::Arc};
use tauri::{
    async_runtime, webview::WebviewWindowBuilder, AppHandle, Manager, Runtime, WebviewUrl,
};
use tokio::{
    net::{TcpListener, TcpStream},
    sync::Mutex, // Using Mutex for the writer part
};
use tokio_tungstenite::{accept_async, tungstenite::Message, WebSocketStream};
// Note: Removed `use anyhow::{Error};` as it's unused when using anyhow::Result<()>

// --- Message Structures ---

/// Generic structure for incoming WebSocket messages
#[derive(Deserialize, Debug)]
struct IncomingMessage {
    url: String,
    #[serde(rename = "correlationId")] // Match JS naming
    correlation_id: Option<String>, // Optional correlation ID
    body: Option<Value>, // Use Option<Value> to handle cases where body might be missing
}

/// Generic structure for outgoing WebSocket responses
#[derive(Serialize, Debug)]
struct ResponseMessage<T: Serialize> {
    url: String,
    #[serde(rename = "correlationId")]
    correlation_id: Option<String>, // Echo back the correlation ID
    body: T, // Generic body for success or error
}

/// Example structure for a success response body
#[derive(Serialize, Debug)]
struct SuccessBody<T: Serialize> {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")] // Don't serialize data if it's None
    data: Option<T>, // Make data optional for responses that don't need it
}

/// Example structure for an error response body
#[derive(Serialize, Debug)]
struct ErrorBody {
    success: bool,
    error: String,
}

// --- WebSocket Handling ---

/// Handles an individual WebSocket connection
async fn handle_websocket<R: Runtime>(
    stream: TcpStream,
    app_handle: AppHandle<R>, // Pass AppHandle for Tauri interaction
) {
    let addr = stream
        .peer_addr()
        .expect("Connected stream should have peer address");
    println!("New WebSocket connection from: {}", addr);

    match accept_async(stream).await {
        Ok(ws_stream) => {
            println!("WebSocket connection established: {}", addr);
            let (write, read) = ws_stream.split();
            let writer = Arc::new(Mutex::new(write));
            process_messages(read, writer.clone(), app_handle, addr).await;
            println!("WebSocket connection closed: {}", addr);
        }
        Err(e) => {
            eprintln!("Error during WebSocket handshake for {}: {}", addr, e);
        }
    }
}

/// Processes messages received from a single client
async fn process_messages<R: Runtime>(
    mut read: SplitStream<WebSocketStream<TcpStream>>,
    writer: Arc<Mutex<SplitSink<WebSocketStream<TcpStream>, Message>>>,
    app_handle: AppHandle<R>,
    addr: SocketAddr,
) {
    while let Some(message_result) = read.next().await {
        match message_result {
            Ok(msg) => {
                match msg {
                    Message::Text(text) => {
                        println!("Received text from {}: {}", addr, text);
                        match serde_json::from_str::<IncomingMessage>(&text) {
                            Ok(parsed_message) => {
                                let writer_clone = writer.clone();
                                let app_handle_clone = app_handle.clone();
                                let url = parsed_message.url.clone();
                                let correlation_id = parsed_message.correlation_id.clone();

                                tokio::spawn(async move {
                                    let writer_for_route = writer_clone.clone();
                                    // Using anyhow::Result allows easy error propagation with `?`
                                    if let Err(e) = route_message(
                                        parsed_message,
                                        writer_for_route,
                                        app_handle_clone,
                                    )
                                    .await
                                    {
                                        eprintln!(
                                            "Error handling message for url '{}': {}",
                                            url, e
                                        );
                                        let error_response = ResponseMessage {
                                            url,
                                            correlation_id,
                                            body: ErrorBody {
                                                success: false,
                                                error: e.to_string(),
                                            },
                                        };
                                        if let Ok(json_response) =
                                            serde_json::to_string(&error_response)
                                        {
                                            let mut w = writer_clone.lock().await;
                                            if let Err(send_err) =
                                                w.send(Message::Text(json_response)).await
                                            {
                                                eprintln!(
                                                    "Failed to send error response: {}",
                                                    send_err
                                                );
                                            }
                                        }
                                    }
                                });
                            }
                            Err(e) => {
                                eprintln!(
                                    "Failed to parse JSON from {}: {}. Message: {}",
                                    addr, e, text
                                );
                                let response = ResponseMessage {
                                    url: "unknown".to_string(),
                                    correlation_id: None,
                                    body: ErrorBody {
                                        success: false,
                                        error: format!("Invalid JSON format: {}", e),
                                    },
                                };
                                if let Ok(json_response) = serde_json::to_string(&response) {
                                    let mut w = writer.lock().await;
                                    if let Err(send_err) =
                                        w.send(Message::Text(json_response)).await
                                    {
                                        eprintln!(
                                            "Failed to send parse error response: {}",
                                            send_err
                                        );
                                    }
                                }
                            }
                        }
                    }
                    Message::Binary(_) => println!("Received binary data from {} (ignored)", addr),
                    Message::Ping(ping_data) => {
                        println!("Received Ping from {}", addr);
                        let mut w = writer.lock().await;
                        if let Err(e) = w.send(Message::Pong(ping_data)).await {
                            eprintln!("Failed to send Pong: {}", e);
                        }
                    }
                    Message::Pong(_) => println!("Received Pong from {}", addr),
                    Message::Close(_) => {
                        println!("Received Close frame from {}", addr);
                        break;
                    }
                    Message::Frame(_) => println!("Received raw Frame from {} (ignored)", addr),
                }
            }
            Err(e) => {
                eprintln!("WebSocket error reading message from {}: {}", addr, e);
                break;
            }
        }
    }
}

/// Routes the parsed message to the appropriate handler
// --- Fix: Changed return type to anyhow::Result<()> ---
async fn route_message<R: Runtime>(
    message: IncomingMessage,
    writer: Arc<Mutex<SplitSink<WebSocketStream<TcpStream>, Message>>>,
    app_handle: AppHandle<R>,
) -> anyhow::Result<()> {
    // Use anyhow::Result for easier error handling
    println!("Routing message for URL: {}", message.url);

    match message.url.as_str() {
        "/paths" => handle_paths(message, writer, app_handle).await?,
        "/fs/file/write" => handle_fs_write(message, writer, app_handle).await?,
        "/window/maximize" => handle_window_maximize(message, writer, app_handle).await?,
        "/fs/file/read" => handle_not_implemented(message, writer).await?,
        "/fs/file/read/binary" => handle_not_implemented(message, writer).await?,
        "/fs/folder/create" => handle_not_implemented(message, writer).await?,
        "/window/minimize" => handle_window_minimize(message, writer, app_handle).await?,
        "/window/request-attention" => handle_not_implemented(message, writer).await?,
        "/window/restore" => handle_window_restore(message, writer, app_handle).await?,
        "/dialog/folder" => handle_not_implemented(message, writer).await?,
        "/dialog/open" => handle_not_implemented(message, writer).await?,
        "/dialog/save" => handle_not_implemented(message, writer).await?,
        "/window/set-always-on-top" => handle_not_implemented(message, writer).await?,
        "/window/set-height" => handle_not_implemented(message, writer).await?,
        "/window/set-maximum-size" => handle_not_implemented(message, writer).await?,
        "/window/set-minimum-size" => handle_not_implemented(message, writer).await?,
        "/window/set-resizable" => handle_not_implemented(message, writer).await?,
        "/window/set-title" => handle_not_implemented(message, writer).await?,
        "/window/set-width" => handle_not_implemented(message, writer).await?,
        "/window/set-x" => handle_not_implemented(message, writer).await?,
        "/window/set-y" => handle_not_implemented(message, writer).await?,
        "/window/show-dev-tools" => handle_not_implemented(message, writer).await?,
        "/window/unmaximize" => handle_window_unmaximize(message, writer, app_handle).await?,
        "/window/set-fullscreen" => handle_not_implemented(message, writer).await?,
        "/engine" => handle_engine(message, writer).await?,
        "/open" => handle_not_implemented(message, writer).await?,
        "/show-in-explorer" => handle_not_implemented(message, writer).await?,
        "/run" => handle_not_implemented(message, writer).await?,
        "/fs/copy" => handle_not_implemented(message, writer).await?,
        "/fs/delete" => handle_not_implemented(message, writer).await?,
        "/fs/exist" => handle_not_implemented(message, writer).await?,
        "/fs/list" => handle_not_implemented(message, writer).await?,
        "/fs/file/size" => handle_not_implemented(message, writer).await?,
        "/fs/move" => handle_not_implemented(message, writer).await?,
        "/steam/raw" => handle_not_implemented(message, writer).await?,
        "/discord/set-activity" => handle_not_implemented(message, writer).await?,
        "/infos" => handle_not_implemented(message, writer).await?,
        "/exit" => handle_exit(message, writer, app_handle).await?,

        _ => {
            println!("Received unhandled URL: {}", message.url);
            let response = ResponseMessage {
                url: message.url.clone(),
                correlation_id: message.correlation_id.clone(),
                body: ErrorBody {
                    success: false,
                    error: format!("Unhandled URL: {}", message.url),
                },
            };
            let json_response = serde_json::to_string(&response)?;
            let mut w = writer.lock().await;
            w.send(Message::Text(json_response)).await?;
        }
    }
    Ok(())
}

// --- Example Handler Implementations (Stubs) ---

// --- Fix: Changed return type for all handlers to anyhow::Result<()> ---

async fn handle_not_implemented(
    message: IncomingMessage,
    writer: Arc<Mutex<SplitSink<WebSocketStream<TcpStream>, Message>>>,
) -> anyhow::Result<()> {
    // Use anyhow::Result
    println!("Handler not implemented for URL: {}", message.url);
    let response = ResponseMessage {
        url: message.url.clone(),
        correlation_id: message.correlation_id.clone(),
        body: ErrorBody {
            success: false,
            error: format!("Feature not implemented: {}", message.url),
        },
    };
    let json_response = serde_json::to_string(&response)?;
    let mut w = writer.lock().await;
    w.send(Message::Text(json_response)).await?;
    Ok(())
}

async fn handle_engine(
    message: IncomingMessage,
    writer: Arc<Mutex<SplitSink<WebSocketStream<TcpStream>, Message>>>,
) -> anyhow::Result<()> {
    // Use anyhow::Result
    println!(
        "Handling /engine request. Body (if any): {:?}",
        message.body
    );
    let response = ResponseMessage {
        url: message.url.clone(),
        correlation_id: message.correlation_id.clone(),
        body: SuccessBody {
            success: true,
            data: Option::<()>::None,
        },
    };
    let json_response = serde_json::to_string(&response)?;
    let mut w = writer.lock().await;
    w.send(Message::Text(json_response)).await?;
    Ok(())
}

async fn handle_paths<R: Runtime>(
    message: IncomingMessage,
    writer: Arc<Mutex<SplitSink<WebSocketStream<TcpStream>, Message>>>,
    app_handle: AppHandle<R>,
) -> anyhow::Result<()> {
    // Use anyhow::Result
    println!("Handling /paths request. Body (if any): {:?}", message.body);

    // --- Fix: Use ok_or_else correctly on Option ---
    // let user_data_path = app_handle.path().app_data_dir()
    //     .ok_or_else(|| anyhow::anyhow!("Could not get app data dir"))?; // ok_or_else is called on Option<PathBuf>
    // let documents_path = dirs::document_dir()
    //     .ok_or_else(|| anyhow::anyhow!("Could not get documents dir"))?; // ok_or_else is called on Option<PathBuf>

    let data = serde_json::json!({
        "appData": "data", // user_data_path,
        "documents": "data", // documents_path,
    });

    let response = ResponseMessage {
        url: message.url.clone(),
        correlation_id: message.correlation_id.clone(),
        body: SuccessBody {
            success: true,
            data: Some(data),
        },
    };
    let json_response = serde_json::to_string(&response)?;
    let mut w = writer.lock().await;
    w.send(Message::Text(json_response)).await?;
    Ok(())
}

async fn handle_fs_write<R: Runtime>(
    message: IncomingMessage,
    writer: Arc<Mutex<SplitSink<WebSocketStream<TcpStream>, Message>>>,
    _app_handle: AppHandle<R>,
) -> anyhow::Result<()> {
    // Use anyhow::Result
    println!("Handling /fs/file/write request.");

    let body_value = message
        .body
        .ok_or_else(|| anyhow::anyhow!("Missing request body for /fs/file/write"))?;
    let path = body_value
        .get("path")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("Missing 'path' field in body"))?;
    let content = body_value
        .get("content")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("Missing 'content' field in body"))?;

    println!(
        "Attempting to write to path: '{}', Content length: {}",
        path,
        content.len()
    );
    // tokio::fs::write(path, content).await?; // Add actual file writing logic here

    let response = ResponseMessage {
        url: message.url.clone(),
        correlation_id: message.correlation_id.clone(),
        body: SuccessBody {
            success: true,
            data: Option::<()>::None,
        },
    };
    let json_response = serde_json::to_string(&response)?;
    let mut w = writer.lock().await;
    w.send(Message::Text(json_response)).await?;
    Ok(())
}

async fn handle_window_maximize<R: Runtime>(
    message: IncomingMessage,
    writer: Arc<Mutex<SplitSink<WebSocketStream<TcpStream>, Message>>>,
    app_handle: AppHandle<R>,
) -> anyhow::Result<()> {
    // Use anyhow::Result
    println!("Handling /window/maximize request");
    match app_handle.get_webview_window("main") {
        Some(window) => {
            #[cfg(desktop)] // This block only compiles on desktop targets
            {
                window.maximize()?; // This call is safe here
                println!("Window 'main' maximized.");
            }
            #[cfg(mobile)] // This block only compiles on mobile targets
            {
                // On mobile, maximize doesn't exist/make sense in the same way.
                println!("Window maximize is not supported on mobile. Returning error.");
                // Return an error indicating the operation is not supported on this platform.
                return Err(anyhow::anyhow!(
                    "Window maximize is not supported on this platform"
                ));
            }

            let response = ResponseMessage {
                url: message.url.clone(),
                correlation_id: message.correlation_id.clone(),
                body: SuccessBody {
                    success: true,
                    data: Option::<()>::None,
                },
            };
            let json_response = serde_json::to_string(&response)?;
            let mut w = writer.lock().await;
            w.send(Message::Text(json_response)).await?;
        }
        None => {
            return Err(anyhow::anyhow!("Main window not found")); // Return anyhow error
        }
    }
    Ok(())
}

async fn handle_window_minimize<R: Runtime>(
    message: IncomingMessage,
    writer: Arc<Mutex<SplitSink<WebSocketStream<TcpStream>, Message>>>,
    app_handle: AppHandle<R>,
) -> anyhow::Result<()> {
    // Use anyhow::Result
    println!("Handling /window/minimize request");
    match app_handle.get_webview_window("main") {
        Some(window) => {
            #[cfg(desktop)]
            {
                window.minimize()?;
                println!("Window 'main' minimized.");
            }
            #[cfg(mobile)]
            {
                println!("Window minimize is not supported on mobile. Returning error.");
                return Err(anyhow::anyhow!(
                    "Window minimize is not supported on this platform"
                ));
            }
            let response = ResponseMessage {
                url: message.url.clone(),
                correlation_id: message.correlation_id.clone(),
                body: SuccessBody {
                    success: true,
                    data: Option::<()>::None,
                },
            };
            let json_response = serde_json::to_string(&response)?;
            let mut w = writer.lock().await;
            w.send(Message::Text(json_response)).await?;
        }
        None => {
            return Err(anyhow::anyhow!("Main window not found"));
        }
    }
    Ok(())
}

async fn handle_window_restore<R: Runtime>(
    message: IncomingMessage,
    writer: Arc<Mutex<SplitSink<WebSocketStream<TcpStream>, Message>>>,
    app_handle: AppHandle<R>,
) -> anyhow::Result<()> {
    // Use anyhow::Result
    println!("Handling /window/restore request");
    match app_handle.get_webview_window("main") {
        Some(window) => {
            #[cfg(desktop)]
            {
                if window.is_maximized()? {
                    window.unmaximize()?;
                }
                window.set_focus()?;
                if !window.is_visible()? {
                    window.show()?;
                }
                println!("Window 'main' restored (attempted).");
            }
            #[cfg(mobile)]
            {
                println!("Window restore is not supported on mobile. Returning error.");
                return Err(anyhow::anyhow!(
                    "Window restore is not supported on this platform"
                ));
            }

            let response = ResponseMessage {
                url: message.url.clone(),
                correlation_id: message.correlation_id.clone(),
                body: SuccessBody {
                    success: true,
                    data: Option::<()>::None,
                },
            };
            let json_response = serde_json::to_string(&response)?;
            let mut w = writer.lock().await;
            w.send(Message::Text(json_response)).await?;
        }
        None => {
            return Err(anyhow::anyhow!("Main window not found"));
        }
    }
    Ok(())
}

async fn handle_window_unmaximize<R: Runtime>(
    message: IncomingMessage,
    writer: Arc<Mutex<SplitSink<WebSocketStream<TcpStream>, Message>>>,
    app_handle: AppHandle<R>,
) -> anyhow::Result<()> {
    // Use anyhow::Result
    println!("Handling /window/unmaximize request");
    match app_handle.get_webview_window("main") {
        Some(window) => {
            #[cfg(desktop)]
            {
                window.unmaximize()?; // <-- Your original line, now conditional
                println!("Window 'main' unmaximized.");
            }
            #[cfg(mobile)]
            {
                println!("Window unmaximize is not supported on mobile. Returning error.");
                return Err(anyhow::anyhow!(
                    "Window unmaximize is not supported on this platform"
                ));
            }
            let response = ResponseMessage {
                url: message.url.clone(),
                correlation_id: message.correlation_id.clone(),
                body: SuccessBody {
                    success: true,
                    data: Option::<()>::None,
                },
            };
            let json_response = serde_json::to_string(&response)?;
            let mut w = writer.lock().await;
            w.send(Message::Text(json_response)).await?;
        }
        None => {
            return Err(anyhow::anyhow!("Main window not found"));
        }
    }
    Ok(())
}

async fn handle_exit<R: Runtime>(
    message: IncomingMessage,
    writer: Arc<Mutex<SplitSink<WebSocketStream<TcpStream>, Message>>>,
    app_handle: AppHandle<R>,
) -> anyhow::Result<()> {
    // Use anyhow::Result
    println!("Handling /exit request");
    let response = ResponseMessage {
        url: message.url.clone(),
        correlation_id: message.correlation_id.clone(),
        body: SuccessBody {
            success: true,
            data: Option::<()>::None,
        },
    };
    let json_response = serde_json::to_string(&response)?;
    let mut w = writer.lock().await;
    w.send(Message::Text(json_response)).await?;

    app_handle.exit(0);
    // TODO: support exit code
    // app_handle.exit(message.body.code);
    Ok(())
}

// --- WebSocket Server ---

async fn start_websocket_server<R: Runtime>(app_handle: AppHandle<R>) {
    let addr = SocketAddr::from(([127, 0, 0, 1], 31753));
    let listener = match TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Failed to bind WebSocket server to {}: {}", addr, e);
            return;
        }
    };
    println!("WebSocket server running on ws://{}", addr);

    loop {
        match listener.accept().await {
            Ok((stream, _)) => {
                let app_handle_clone = app_handle.clone();
                tokio::spawn(async move {
                    handle_websocket(stream, app_handle_clone).await;
                });
            }
            Err(e) => {
                eprintln!("Failed to accept incoming connection: {}", e);
                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
            }
        }
    }
}

// --- Tauri Setup ---

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(move |app| {
            let app_handle = app.handle().clone();
            async_runtime::spawn(async move {
                start_websocket_server(app_handle).await;
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
