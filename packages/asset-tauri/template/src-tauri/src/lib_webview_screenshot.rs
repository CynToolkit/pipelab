use futures_util::StreamExt;
use std::env;
use std::error::Error;
use std::net::SocketAddr;
use std::sync::Arc;
use std::{borrow::Cow, sync::Mutex, time::Instant};
use steamworks::AppId;
use steamworks::Client;
use steamworks::FriendFlags;
use steamworks::PersonaStateChange;
use tauri::Window;
use tauri::{
    async_runtime, LogicalPosition, LogicalSize, Manager, RunEvent, WebviewUrl, WindowEvent,
};
use tokio::sync::mpsc::{Receiver, Sender};
use warp::Filter;
use image::{ImageBuffer, Rgba};


pub struct WgpuState<'win> {
    pub queue: wgpu::Queue,
    pub device: wgpu::Device,
    pub surface: wgpu::Surface<'win>,
    pub render_pipeline: wgpu::RenderPipeline,
    pub config: Mutex<wgpu::SurfaceConfiguration>,
    pub webview_texture: Option<wgpu::Texture>, // Add this field

}

impl<'win> WgpuState<'win> {
    pub async fn new(window: Window) -> Self {
        let size = window.inner_size().unwrap();
        let instance = wgpu::Instance::default();
        let surface = instance.create_surface(window).unwrap();

        let adapters = instance.enumerate_adapters(wgpu::Backends::all()); // Enumerate all backends

        println!("Available wgpu backends:");
        for adapter in adapters {
            let info = adapter.get_info();
            println!("- {:?}: {:?}", info.backend, info.name);
        }

        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::default(),
                force_fallback_adapter: false,
                compatible_surface: Some(&surface),
            })
            .await
            .expect("Failed to find an appropriate adapter");

        let (device, queue) = adapter
            .request_device(
                &wgpu::DeviceDescriptor {
                    label: None,
                    required_features: wgpu::Features::empty(),
                    required_limits: wgpu::Limits::downlevel_webgl2_defaults()
                        .using_resolution(adapter.limits()),
                },
                None,
            )
            .await
            .expect("Failed to create device");

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: None,
            source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(
                r#"
@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> @builtin(position) vec4<f32> {
    var position: vec4<f32>;
    switch (vertex_index) {
        case 0u: {
            position = vec4<f32>(-1.0, -1.0, 0.0, 1.0); // Bottom-left
        }
        case 1u: {
            position = vec4<f32>( 1.0, -1.0, 0.0, 1.0); // Bottom-right
        }
        case 2u: {
            position = vec4<f32>( 0.0,  1.0, 0.0, 1.0); // Top-center
        }
        default: {
            position = vec4<f32>(0.0, 0.0, 0.0, 1.0); // Default case (should not be reached)
        }
    }
    return position;
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
    // Output a solid color
    return vec4<f32>(0.0, 0.0, 0.0, 0.0); // Green
}

    "#,
            )),
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: None,
            push_constant_ranges: &[],
            bind_group_layouts: &[],
        });

        let swapchain_capabilities = surface.get_capabilities(&adapter);
        println!("swapchain_capabilities {:?}", swapchain_capabilities);
        let swapchain_format = swapchain_capabilities.formats[0];

        let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: None,
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: "vs_main",
                buffers: &[],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: "fs_main",
                targets: &[Some(wgpu::ColorTargetState {
                    format: swapchain_format,
                    blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
        });

        if swapchain_capabilities
            .alpha_modes
            .contains(&wgpu::CompositeAlphaMode::PreMultiplied)
        {
            println!("PreMultiplied alpha mode is supported!");
        } else if swapchain_capabilities
            .alpha_modes
            .contains(&wgpu::CompositeAlphaMode::Opaque)
        {
            println!("Only Opaque alpha mode is supported. Transparency will not work.");
        } else {
            println!("No known alpha modes are supported.");
        }

        let alpha_mode = if swapchain_capabilities
            .alpha_modes
            .contains(&wgpu::CompositeAlphaMode::PreMultiplied)
        {
            wgpu::CompositeAlphaMode::PreMultiplied
        } else {
            swapchain_capabilities.alpha_modes[0]
        };

        let config = wgpu::SurfaceConfiguration {
            width: size.width,
            height: size.height,
            format: swapchain_format,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            present_mode: wgpu::PresentMode::Fifo,
            alpha_mode,
            view_formats: vec![],
            desired_maximum_frame_latency: 2,
        };

        surface.configure(&device, &config);

        Self {
            device,
            queue,
            surface,
            render_pipeline,
            config: Mutex::new(config),
            webview_texture: None, // Initialize as None
        }
    }
}

fn render_webview(
  render_pass: &mut wgpu::RenderPass,
  window: &tauri::Window,
  device: &wgpu::Device,
  queue: &wgpu::Queue,
  wgpu_state: &mut WgpuState,
) {
  if let Ok(png) = window.get_webview("main1").unwrap().capture(). {
      let image = image::load_from_memory(&png).unwrap();
      let rgba = image.to_rgba8();
      let (width, height) = rgba.dimensions();
      let texture_size = wgpu::Extent3d {
          width,
          height,
          depth_or_array_layers: 1,
      };
      let texture = device.create_texture(&wgpu::TextureDescriptor {
          size: texture_size,
          mip_level_count: 1,
          sample_count: 1,
          dimension: wgpu::TextureDimension::D2,
          format: wgpu::TextureFormat::Rgba8UnormSrgb,
          usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
          label: Some("webview_texture"),
          view_formats: &[],
      });
      queue.write_texture(
          wgpu::ImageCopyTexture {
              texture: &texture,
              mip_level: 0,
              origin: wgpu::Origin3d::ZERO,
              aspect: wgpu::TextureAspect::All,
          },
          &rgba,
          wgpu::ImageDataLayout {
              offset: 0,
              bytes_per_row: Some(4 * width),
              rows_per_image: Some(height),
          },
          texture_size,
      );
      wgpu_state.webview_texture = Some(texture); // Update the texture
  }
}

#[tauri::command]
fn showOverlay() {
    println!("Showing overlay");
    match Client::init_app(480) {
        Ok((client, _single)) => {
            println!("Client created");
            client.friends().activate_game_overlay("hey");
            println!("Overlay shown");
        }
        Err(e) => eprintln!("Failed to initialize Steam client: {:?}", e),
    }
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

fn setup_wgpu_overlay(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    println!("Webgpu rendering");

    // let window = app.get_webview_window("main").unwrap();
    let _window = tauri::window::WindowBuilder::new(app, "main")
        .inner_size(800.0, 600.0)
        .transparent(true)
        .build()?;

    let _webview1 = _window.add_child(
        tauri::webview::WebviewBuilder::new("main1", WebviewUrl::App(Default::default()))
            .transparent(true)
            .auto_resize(),
        LogicalPosition::new(0., 0.),
        LogicalSize::new(800.0, 600.0),
    )?;

    let wgpu_state = async_runtime::block_on(WgpuState::new(_window));
    let wgpu_state = Arc::new(wgpu_state); // Make wgpu_state Arc<T>
    app.manage(wgpu_state.clone()); // Store a clone in app state

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
    let init = match Client::init_app(480) {
        Ok(val) => {
            let (client, single) = val;
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
        }
        Err(err) => {
            println!("Error {}", err);
        }
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .setup(move |app| {
            println!("setup");
            let _ = setup_wgpu_overlay(app);
            setup_app(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![showOverlay])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| match event {
            RunEvent::WindowEvent {
                label: _,
                event: WindowEvent::Resized(size),
                ..
            } => {
                let wgpu_state = app_handle.state::<Arc<WgpuState>>();
                let mut config = wgpu_state.config.lock().unwrap();
                config.width = size.width;
                config.height = size.height;
                wgpu_state.surface.configure(&wgpu_state.device, &config);
            }
            RunEvent::MainEventsCleared => {
                let wgpu_state = app_handle.state::<Arc<WgpuState>>();
                let _window = app_handle.get_window("main").unwrap();

                let t = Instant::now();

                let output = match wgpu_state.surface.get_current_texture() {
                    Ok(output) => output,
                    Err(wgpu::SurfaceError::Lost) => {
                        eprintln!("Surface lost, recreating surface...");
                        return ();
                    }
                    Err(wgpu::SurfaceError::OutOfMemory) => {
                        eprintln!("Out of memory error");
                        return ();
                    }
                    Err(e) => {
                        eprintln!("Failed to acquire next swap chain texture: {:?}", e);
                        return ();
                    }
                };
                let view = output
                    .texture
                    .create_view(&wgpu::TextureViewDescriptor::default());

                let mut encoder = wgpu_state
                    .device
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
                    render_webview(&mut rpass, &_window, &wgpu_state.device, &wgpu_state.queue, wgpu_state);
                    rpass.set_pipeline(&wgpu_state.render_pipeline);
                    rpass.draw(0..3, 0..1);
                }

                wgpu_state.queue.submit(Some(encoder.finish()));
                // output.present();

                println!("Frame rendered in: {}ms", t.elapsed().as_millis());
            }
            _ => (),
        });
}
