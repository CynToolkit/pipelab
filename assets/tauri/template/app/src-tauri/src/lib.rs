use futures_util::StreamExt;
use serde::Deserialize;
use std::env;
use std::error::Error;
use std::fs;
use std::io::Read;
use std::net::SocketAddr;
use std::sync::Arc;
use std::{borrow::Cow, sync::Mutex};
use steamworks::AppId;
use steamworks::Client;
use steamworks::FriendFlags;
use steamworks::PersonaStateChange;
use tauri::path::BaseDirectory;
use tauri::{async_runtime::block_on, Manager, RunEvent, WindowEvent};
use tauri::{Runtime, Window};
use tokio::sync::mpsc::{Receiver, Sender};
use warp::Filter;
use wgpu::{Device, Instance, Queue, Surface, SurfaceConfiguration};
use winit::dpi;

#[derive(Deserialize)]
struct JsonMessage {
    url: String,
    // Add fields as needed
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

async fn websocket_server(tx: Sender<String>, mut rx: Receiver<String>) {
    let addr = SocketAddr::from(([127, 0, 0, 1], 31753));

    // WebSocket upgrade
    let ws_route = warp::path::end()
        .and(warp::ws())
        .map(move |ws: warp::ws::Ws| {
            let tx = tx.clone();
            ws.on_upgrade(move |websocket| async move {
                let (mut ws_tx, mut ws_rx) = websocket.split();

                // Forward messages to the sender
                while let Some(result) = ws_rx.next().await {
                    if let Ok(msg) = result {
                        if let Ok(text) = msg.to_str() {
                            println!("Received WebSocket message: {}", text);
                            if tx.send(text.to_string()).await.is_err() {
                                eprintln!("Failed to send message to channel");
                                break;
                            }
                        }
                    }
                }
            })
        });

    let routes = ws_route;

    // Spawn HTTP server
    tokio::spawn(warp::serve(routes).run(addr));
    println!("WebSocket server running on ws://{}", addr);

    // Process messages from the receiver
    while let Some(message) = rx.recv().await {
        println!("Processing message: {}", message);
        // Handle messages as needed
    }
}

// Struct to manage the WGPU rendering context
pub struct WgpuOverlay {
    instance: Arc<Instance>,
    surface: Surface<'static>,
    device: Arc<Device>,
    queue: Arc<Queue>,
    config: SurfaceConfiguration,
}

impl WgpuOverlay {
    pub fn new<R: Runtime>(window: Arc<Window<R>>) -> Result<Self, Box<dyn std::error::Error>> {
        // Initialize WGPU instance
        // let instance = Arc::new(Instance::new(wgpu::InstanceDescriptor {
        //     backends: wgpu::Backends::VULKAN | wgpu::Backends::DX12,
        //     ..Default::default()
        // }));
        let instance = Arc::new(Instance::new(wgpu::InstanceDescriptor {
            // Configure instance creation as needed
            ..Default::default()
        }));

        let raw_window = Arc::into_raw(window.clone());

        // Create surface from the Tauri window
        let surface = unsafe {
            instance.create_surface(&*raw_window)?
            // instance.create_surface_from_window(window)?
        };

        let _ = unsafe { Arc::from_raw(raw_window) };

        // Select the GPU adapter
        let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::default(),
            compatible_surface: Some(&surface),
            force_fallback_adapter: false,
        }))
        .expect("Failed to find an appropriate adapter");

        // Create device and queue
        let (device, queue) = pollster::block_on(adapter.request_device(
            &wgpu::DeviceDescriptor {
                label: None,
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::default(),
                ..Default::default()
            },
            None,
        ))?;

        let device = Arc::new(device);
        let queue = Arc::new(queue);

        // Get window size
        let size = window.inner_size()?;
        let capabilities = surface.get_capabilities(&adapter);
        let mut supported_formats = capabilities.formats.clone();
        let format = supported_formats
            .pop()
            .unwrap_or(wgpu::TextureFormat::Rgba8Unorm);

        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            width: size.width,
            height: size.height,
            present_mode: wgpu::PresentMode::Fifo,
            desired_maximum_frame_latency: 2,
            view_formats: vec![format],
            alpha_mode: wgpu::CompositeAlphaMode::Opaque,
        };

        surface.configure(&device, &config);

        Ok(Self {
            instance,
            surface,
            device,
            queue,
            config,
        })
    }

    // Method to render a frame
    pub fn render(&mut self) -> Result<(), wgpu::SurfaceError> {
        println!("--- Rendering Frame ---");
        // Get the current texture from the surface
        let output = self.surface.get_current_texture()?;
        let view = output
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());

        // Create a command encoder for rendering
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("Render Encoder"),
            });

        // Begin a render pass with a solid color
        {
            encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Render Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::RED), // Solid red background
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                occlusion_query_set: None,
                timestamp_writes: None,
            });
        }

        // Submit the command encoder's commands to the GPU
        self.queue.submit(std::iter::once(encoder.finish()));

        // Present the frame
        output.present();
        println!("--- Frame Rendered ---");
        Ok(())
    }

    // Method to resize the surface when window is resized
    pub fn resize(&mut self, new_size: dpi::PhysicalSize<u32>) {
        if new_size.width > 0 && new_size.height > 0 {
            self.config.width = new_size.width;
            self.config.height = new_size.height;
            self.surface.configure(&self.device, &self.config);
        }
    }
}

// Example of how to use in a Tauri command or setup
fn setup_wgpu_overlay<R: Runtime>(
    app: &mut tauri::App<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    println!("Webgpu rendering");

    let window = app.get_webview_window("main").unwrap();
    let size = window.inner_size()?;

    let instance = wgpu::Instance::default();

    let surface = instance.create_surface(window).unwrap();
    let adapter = block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
        power_preference: wgpu::PowerPreference::default(),
        force_fallback_adapter: false,
        // Request an adapter which can render to our surface
        compatible_surface: Some(&surface),
    }))
    .expect("Failed to find an appropriate adapter");

    // Create the logical device and command queue
    let (device, queue) = block_on(adapter.request_device(
        &wgpu::DeviceDescriptor {
            label: None,
            required_features: wgpu::Features::empty(),
            // Make sure we use the texture resolution limits from the adapter, so we can support images the size of the swapchain.
            required_limits:
                wgpu::Limits::downlevel_webgl2_defaults().using_resolution(adapter.limits()),
            ..Default::default()
        },
        None,
    ))
    .expect("Failed to create device");

    // Load the shaders from disk
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: None,
        source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(
            r#"
@vertex
fn vs_main(@builtin(vertex_index) in_vertex_index: u32) -> @builtin(position) vec4<f32> {
let x = f32(i32(in_vertex_index) - 1);
let y = f32(i32(in_vertex_index & 1u) * 2 - 1);
return vec4<f32>(x, y, 0.0, 1.0);
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
    return vec4<f32>(1.0, 0.0, 0.0, 0.5); // Red with 50% transparency
}
"#,
        )),
    });

    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: None,
        bind_group_layouts: &[],
        push_constant_ranges: &[],
    });

    let swapchain_capabilities = surface.get_capabilities(&adapter);
    let swapchain_format = swapchain_capabilities.formats[0];

    let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: None,
        layout: Some(&pipeline_layout),
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: "vs_main",
            buffers: &[],
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: "fs_main",
            targets: &[Some(swapchain_format.into())],
        }),
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
    });

    println!("alpha {:?}", swapchain_capabilities.alpha_modes[0]);

    let config = wgpu::SurfaceConfiguration {
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
        format: swapchain_format,
        width: size.width,
        height: size.height,
        present_mode: wgpu::PresentMode::Fifo,
        alpha_mode: swapchain_capabilities.alpha_modes[0],
        view_formats: vec![],
        desired_maximum_frame_latency: 2,
    };

    surface.configure(&device, &config);

    app.manage(surface);
    app.manage(render_pipeline);
    app.manage(device);
    app.manage(queue);
    app.manage(Mutex::new(config));

    Ok(())
}

async fn setup_app<'a>(app: &'a mut tauri::App) -> Result<(), Box<dyn Error>> {
    // Setup HTTP + WebSocket server
    let (tx, rx) = tokio::sync::mpsc::channel::<String>(32);

    tokio::spawn(async move {
        websocket_server(tx, rx).await;
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // let path = env::current_dir();
    // println!("The current directory is {}", path.display());

    let file_name = "steam_appid.txt";
    /** Local file */

    // let contents = fs::read_to_string(file_name)?;

    // // Print the file contents
    // println!("File contents:\n{}", contents);
    /** Local file */

    /** Embedded file */
    // let resource_path = app.path().resolve(file_name, BaseDirectory::Resource)?;

    // let mut file = std::fs::File::open(&resource_path).unwrap();
    // let mut buffer = String::new();
    // let contents2 = file.read_to_string(&mut buffer)?;

    // // This will print 'Guten Tag!' to the terminal
    // println!("File contents 2: \n{}", contents2);
    /** Embedded file */
    let (client, single) = Client::init_app(480).unwrap();

    let _cb = client.register_callback(|p: PersonaStateChange| {
        println!("Got callback: {:?}", p);
    });

    let utils = client.utils();
    println!("Utils:");
    println!("AppId: {:?}", utils.app_id());
    println!("UI Language: {}", utils.ui_language());

    let apps = client.apps();
    println!("Apps");
    println!("IsInstalled(480): {}", apps.is_app_installed(AppId(480)));
    println!("InstallDir(480): {}", apps.app_install_dir(AppId(480)));
    println!("BuildId: {}", apps.app_build_id());
    println!("AppOwner: {:?}", apps.app_owner());
    println!("Langs: {:?}", apps.available_game_languages());
    println!("Lang: {}", apps.current_game_language());
    println!("Beta: {:?}", apps.current_beta_name());

    let friends = client.friends();
    println!("Friends");
    let list = friends.get_friends(FriendFlags::IMMEDIATE);
    println!("{:?}", list);
    for f in &list {
        println!("Friend: {:?} - {}({:?})", f.id(), f.name(), f.state());
        friends.request_user_information(f.id(), true);
    }

    // for _ in 0..50 {
    //     single.run_callbacks();
    //     ::std::thread::sleep(::std::time::Duration::from_millis(100));
    // }

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .setup(move |app| {
            let _ = setup_wgpu_overlay(app);

            ::std::thread::sleep(::std::time::Duration::from_millis(2000));
            println!("wait is over");

            client.friends().activate_game_overlay("hey");
            println!("showing overlay");

            // client.input()

            setup_app(app);
            Ok(())
        })
        // .plugin(tauri_plugin_devtools::init())
        .invoke_handler(tauri::generate_handler![greet])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            match event {
                RunEvent::WindowEvent {
                    label: _,
                    event: WindowEvent::Resized(size),
                    ..
                } => {
                    let config = app_handle.state::<Mutex<wgpu::SurfaceConfiguration>>();
                    let surface = app_handle.state::<wgpu::Surface>();
                    let device = app_handle.state::<wgpu::Device>();

                    let mut config = config.lock().unwrap();
                    config.width = if size.width > 0 { size.width } else { 1 };
                    config.height = if size.height > 0 { size.height } else { 1 };
                    surface.configure(&device, &config)

                    // TODO: Request redraw on macos (not exposed in tauri yet).
                }
                RunEvent::MainEventsCleared => {
                    println!("MainEventsCleared");

                    let surface = app_handle.state::<wgpu::Surface>();
                    let render_pipeline = app_handle.state::<wgpu::RenderPipeline>();
                    let device = app_handle.state::<wgpu::Device>();
                    let queue = app_handle.state::<wgpu::Queue>();

                    let frame = surface
                        .get_current_texture()
                        .expect("Failed to acquire next swap chain texture");
                    let view = frame
                        .texture
                        .create_view(&wgpu::TextureViewDescriptor::default());
                    let mut encoder = device
                        .create_command_encoder(&wgpu::CommandEncoderDescriptor { label: None });
                    {
                        let mut rpass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                            label: None,
                            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                                view: &view,
                                resolve_target: None,
                                ops: wgpu::Operations {
                                    load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                                    store: wgpu::StoreOp::Store,
                                },
                            })],
                            depth_stencil_attachment: None,
                            timestamp_writes: None,
                            occlusion_query_set: None,
                        });
                        rpass.set_pipeline(&render_pipeline);
                        rpass.draw(0..3, 0..1);
                    }

                    queue.submit(Some(encoder.finish()));
                    frame.present();
                }
                _ => (),
            }
        });
}
