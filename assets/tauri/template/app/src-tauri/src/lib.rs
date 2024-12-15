use futures_util::StreamExt;
use wgpu::rwh::HasWindowHandle;
use std::env;
use std::error::Error;
use std::net::SocketAddr;
use std::sync::Arc;
use std::{borrow::Cow, sync::Mutex, time::Instant};
use steamworks::AppId;
use steamworks::Client;
use steamworks::FriendFlags;
use steamworks::PersonaStateChange;
use tauri::{WebviewWindow, Window};
use tauri::{
    async_runtime, Emitter, LogicalPosition, LogicalSize, Manager, RunEvent, WebviewUrl,
    WindowEvent,
};
use tokio::sync::mpsc::{Receiver, Sender};
use tokio::sync::oneshot;
use warp::Filter;
use wgpu::SurfaceTarget;

pub struct WgpuState<'win> {
    pub queue: wgpu::Queue,
    pub device: wgpu::Device,
    pub surface: wgpu::Surface<'win>,
    pub render_pipeline: wgpu::RenderPipeline,
    pub config: Mutex<wgpu::SurfaceConfiguration>,
}

impl WgpuState<'_> {
    pub async fn new(window: Window) -> Self
    {
        let size = window.inner_size().unwrap();
        let instance = wgpu::Instance::default();
        let surface = instance.create_surface(window).unwrap();
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
    return vec4<f32>(1.0, 1.0, 1.0, 0.1); // Green
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
        }
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
        LogicalSize::new(800.0, 580.0),
    )?;
    // let _webview2 = _window.add_child(
    //     tauri::webview::WebviewBuilder::new("main2", WebviewUrl::App(Default::default()))
    //         .auto_resize()
    //         .transparent(true),
    //     LogicalPosition::new(0., 800.0 / 2.),
    //     LogicalSize::new(800.0, 800.0 / 2.),
    // )?;

    // Create a WgpuState (containing the device, instance, adapter etc.)
    // And store it in the state
    let wgpu_state = async_runtime::block_on(WgpuState::new(_window));
    app.manage(Arc::new(wgpu_state));

    let app_handle = app.app_handle().clone();

    async_runtime::spawn(async move {
        let wgpu_state = app_handle.state::<Arc<WgpuState>>();

        while true {
            let t = Instant::now();

            let output = match wgpu_state.surface.get_current_texture() {
                Ok(output) => output,
                Err(wgpu::SurfaceError::Lost) => {
                    println!("Surface lost, recreating surface...");
                    continue;
                }
                Err(wgpu::SurfaceError::OutOfMemory) => {
                    eprintln!("Out of memory error");
                    continue;
                }
                Err(e) => {
                    eprintln!("Failed to acquire next swap chain texture: {:?}", e);
                    continue;
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
                            load: wgpu::LoadOp::Clear(wgpu::Color::RED),
                            store: wgpu::StoreOp::Store,
                        },
                    })],
                    depth_stencil_attachment: None,
                    timestamp_writes: None,
                    occlusion_query_set: None,
                });
                rpass.set_pipeline(&wgpu_state.render_pipeline);
                rpass.draw(0..3, 0..1);
            }

            wgpu_state.queue.submit(Some(encoder.finish()));

            // Read the texture data before calling present
            let width = output.texture.size().width as usize;
            let height = output.texture.size().height as usize;
            let bytes_per_pixel = 4; // RGBA8 format
            let unaligned_bytes_per_row = width * bytes_per_pixel;
            let aligned_bytes_per_row = ((unaligned_bytes_per_row + 255) / 256) * 256;
            let buffer_size = aligned_bytes_per_row * output.texture.size().height as usize;

            println!(
                "Texture size: width={}, height={}",
                output.texture.size().width,
                output.texture.size().height
            );

            let buffer_desc = wgpu::BufferDescriptor {
                label: Some("Staging Buffer"),
                size: buffer_size as wgpu::BufferAddress,
                usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            };
            let staging_buffer = wgpu_state.device.create_buffer(&buffer_desc);

            let mut encoder = wgpu_state
                .device
                .create_command_encoder(&wgpu::CommandEncoderDescriptor { label: None });
            encoder.copy_texture_to_buffer(
                wgpu::ImageCopyTexture {
                    texture: &output.texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                },
                wgpu::ImageCopyBuffer {
                    buffer: &staging_buffer,
                    layout: wgpu::ImageDataLayout {
                        offset: 0,
                        bytes_per_row: Some(aligned_bytes_per_row as u32),
                        rows_per_image: Some(output.texture.size().height),
                    },
                },
                wgpu::Extent3d {
                    width: output.texture.size().width,
                    height: output.texture.size().height,
                    depth_or_array_layers: 1,
                },
            );
            wgpu_state.queue.submit(Some(encoder.finish()));

            let unaligned_width = output.texture.size().width as usize;
            let height = output.texture.size().height as usize;

            // present first, so steam can hook into it and put his data
            output.present();

            /** Export frame */
            // Map the buffer to read the data
            // println!("buffer {:?}", staging_buffer);

            // Map the staging buffer to read the data
            let buffer_slice = staging_buffer.slice(..);
            let (sender, receiver) = futures::channel::oneshot::channel();
            buffer_slice.map_async(wgpu::MapMode::Read, move |result| {
                sender.send(result).unwrap();
            });
            wgpu_state.device.poll(wgpu::Maintain::Wait);

            receiver.await;

            let data = buffer_slice.get_mapped_range();
            let image_data = data.to_vec(); // Copy buffer data to a Vec<u8>.
            drop(data); // Release the buffer mapping.

            // println!("image_data {:?}", image_data);

            let mut reconstructed_data = Vec::with_capacity(unaligned_bytes_per_row * height);

            for row in 0..height {
                let start = row * aligned_bytes_per_row;
                let end = start + unaligned_bytes_per_row; // Only take the valid portion
                reconstructed_data.extend_from_slice(&image_data[start..end]);
            }

            assert_eq!(reconstructed_data.len(), unaligned_bytes_per_row * height);
            println!("Reconstructed data size: {}", reconstructed_data.len());

            // println!(
            //     "image_data {:?}, expected {:?}",
            //     image_data.len(),
            //     aligned_bytes_per_row * height
            // );
            // println!(
            //     "reconstructed_data {:?}, expected {:?}",
            //     reconstructed_data.len(),
            //     aligned_bytes_per_row * height
            // );
            // println!("Expected 1920000");

            // Send the data to the webview
            let window = app_handle.get_window("main").unwrap();
            if let Err(e) = window.emit("frame-data", reconstructed_data) {
                eprintln!("Failed to emit data: {:?}", e);
            }

            /** End */
            // Now call present
            // output.present();

            println!("Frame rendered in: {}ms", t.elapsed().as_millis());
        }
    });

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
                //
            }
            RunEvent::MainEventsCleared => {}
            _ => (),
        });
}
