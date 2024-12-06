use bytemuck;
use futures_util::StreamExt;
use serde::Deserialize;
use std::env;
use std::error::Error;
use std::net::SocketAddr;
use std::sync::Arc;
use std::{borrow::Cow, sync::Mutex, time::Instant};
use steamworks::AppId;
use steamworks::Client;
use steamworks::FriendFlags;
use steamworks::PersonaStateChange;
use tauri::async_runtime;
use tauri::EventLoopMessage;
use tauri::Runtime;
use tauri::WebviewWindow;
use tauri::{async_runtime::block_on, Manager, RunEvent, WindowEvent};
use tokio::sync::mpsc::{Receiver, Sender};
use warp::Filter;
use wgpu::util::DeviceExt;

pub struct WgpuState<'win> {
    pub queue: wgpu::Queue,
    pub device: wgpu::Device,
    pub sampler: wgpu::Sampler,
    pub surface: wgpu::Surface<'win>,
    pub render_pipeline: wgpu::RenderPipeline,
    pub bind_group_layout: wgpu::BindGroupLayout,
    pub config: Mutex<wgpu::SurfaceConfiguration>,
}

impl WgpuState<'_> {
    pub async fn new(window: WebviewWindow) -> Self {
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
    return vec4<f32>(0.0, 1.0, 0.0, 1.0); // Green
}

    "#,
            )),
        });

        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Nearest,
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            ..Default::default()
        });

        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            entries: &[],
            label: Some("bind_group_layout"),
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: None,
            push_constant_ranges: &[],
            // bind_group_layouts: &[&bind_group_layout],
            bind_group_layouts: &[],
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
                // targets: &[Some(swapchain_format.into())],
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
        });

        let config = wgpu::SurfaceConfiguration {
            width: size.width,
            height: size.height,
            format: swapchain_format,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            present_mode: wgpu::PresentMode::Fifo,
            alpha_mode: swapchain_capabilities.alpha_modes[0],
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
            sampler,
            bind_group_layout,
        }
    }
}

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

#[tauri::command]
fn hideOverlay() {
    println!("Hiding overlay");
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

// Example of how to use in a Tauri command or setup
fn setup_wgpu_overlay(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    println!("Webgpu rendering");

    let window = app.get_webview_window("main").unwrap();
    let size = window.inner_size()?;

    // Create a WgpuState (containing the device, instance, adapter etc.)
    // And store it in the state
    let wgpu_state = async_runtime::block_on(WgpuState::new(window));
    app.manage(Arc::new(wgpu_state));

    let app_handle = app.app_handle().clone();

    async_runtime::spawn(async move {
        let wgpu_state = app_handle.state::<Arc<WgpuState>>();

        while true {
            let t = Instant::now();

            println!("Decoding took: {}ms", t.elapsed().as_millis());

            let output = wgpu_state
                .surface
                .get_current_texture()
                .expect("Failed to acquire next swap chain texture");
            let view = output
                .texture
                .create_view(&wgpu::TextureViewDescriptor::default());

            let bind_group = wgpu_state
                .device
                .create_bind_group(&wgpu::BindGroupDescriptor {
                    layout: &wgpu_state.bind_group_layout,
                    entries: &[
                        // wgpu::BindGroupEntry {
                        //     binding: 0,
                        //     resource: wgpu::BindingResource::TextureView(&texture_view),
                        // },
                        // wgpu::BindGroupEntry {
                        //     binding: 1,
                        //     resource: wgpu::BindingResource::Sampler(&wgpu_state.sampler),
                        // },
                    ],
                    label: None,
                });

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
                            load: wgpu::LoadOp::Clear(wgpu::Color::GREEN),
                            store: wgpu::StoreOp::Store,
                        },
                    })],
                    depth_stencil_attachment: None,
                    timestamp_writes: None,
                    occlusion_query_set: None,
                });
                rpass.set_pipeline(&wgpu_state.render_pipeline);
                // rpass.set_bind_group(0, &bind_group, &[]);
                rpass.draw(0..3, 0..1);
            }

            wgpu_state.queue.submit(Some(encoder.finish()));
            output.present();

            println!("Frame rendered in: {}ms", t.elapsed().as_millis());
        }
    });

        //     app.manage(center_buffer); // Manage the uniform buffer

        // app.manage(surface);
        // app.manage(render_pipeline);
        // app.manage(device);
        // app.manage(queue);
        // app.manage(Mutex::new(config));
        // app.manage(bind_group_layout); // Manage the bind group layout
        // app.manage(Instant::now()); // Manage the Instant

    Ok(())

    //     let instance = wgpu::Instance::default();

    //     let surface = instance.create_surface(window).unwrap();
    //     let adapter = block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
    //         power_preference: wgpu::PowerPreference::default(),
    //         force_fallback_adapter: false,
    //         // Request an adapter which can render to our surface
    //         compatible_surface: Some(&surface),
    //     }))
    //     .expect("Failed to find an appropriate adapter");

    //     // Create the logical device and command queue
    //     let (device, queue) = block_on(adapter.request_device(
    //         &wgpu::DeviceDescriptor {
    //             label: None,
    //             required_features: wgpu::Features::empty(),
    //             // Make sure we use the texture resolution limits from the adapter, so we can support images the size of the swapchain.
    //             required_limits:
    //                 wgpu::Limits::downlevel_webgl2_defaults().using_resolution(adapter.limits()),
    //             ..Default::default()
    //         },
    //         None,
    //     ))
    //     .expect("Failed to create device");

    //     // Load the shaders from disk
    //     let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
    //         label: None,
    //         source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(
    //             r#"
    // struct Uniforms {
    //     center: vec2<f32>,
    // };

    // @group(0) @binding(0) var<uniform> uniforms: Uniforms;

    // struct VertexOutput {
    //     @builtin(position) position: vec4<f32>,
    //     @location(0) frag_coord: vec4<f32>,
    // };

    // @vertex
    // fn vs_main(@builtin(vertex_index) in_vertex_index: u32) -> VertexOutput {
    //     let x = f32(i32(in_vertex_index) - 1);
    //     let y = f32(i32(in_vertex_index & 1u) * 2 - 1);
    //     let position = vec4<f32>(x, y, 0.0, 1.0);
    //     return VertexOutput(position, position);
    // }

    // @fragment
    // fn fs_main(@location(0) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
    //     return vec4<f32>(uniforms.center.x, uniforms.center.y, 0.0, 1.0); // Use center uniform
    // }

    // "#,
    //         )),
    //     });

    //     let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
    //         label: Some("Bind Group Layout"),
    //         entries: &[wgpu::BindGroupLayoutEntry {
    //             binding: 0,
    //             visibility: wgpu::ShaderStages::FRAGMENT,
    //             ty: wgpu::BindingType::Buffer {
    //                 ty: wgpu::BufferBindingType::Uniform,
    //                 has_dynamic_offset: false,
    //                 min_binding_size: None,
    //             },
    //             count: None,
    //         }],
    //     });

    //     let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
    //         label: None,
    //         bind_group_layouts: &[&bind_group_layout],
    //         push_constant_ranges: &[],
    //     });

    //     let swapchain_capabilities = surface.get_capabilities(&adapter);
    //     let swapchain_format = swapchain_capabilities.formats[0];

    //     let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
    //         label: None,
    //         layout: Some(&pipeline_layout),
    //         vertex: wgpu::VertexState {
    //             module: &shader,
    //             entry_point: "vs_main",
    //             buffers: &[],
    //         },
    //         fragment: Some(wgpu::FragmentState {
    //             module: &shader,
    //             entry_point: "fs_main",
    //             targets: &[Some(wgpu::ColorTargetState {
    //                 format: swapchain_format,
    //                 blend: Some(wgpu::BlendState::ALPHA_BLENDING),
    //                 write_mask: wgpu::ColorWrites::ALL,
    //             })],
    //             // targets: &[Some(swapchain_format.into())],
    //         }),
    //         primitive: wgpu::PrimitiveState::default(),
    //         depth_stencil: None,
    //         multisample: wgpu::MultisampleState::default(),
    //         multiview: None,
    //     });

    //     println!("alpha {:?}", swapchain_capabilities.alpha_modes[0]);

    //     let config = wgpu::SurfaceConfiguration {
    //         usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
    //         format: swapchain_format,
    //         width: size.width,
    //         height: size.height,
    //         present_mode: wgpu::PresentMode::Fifo,
    //         alpha_mode: swapchain_capabilities.alpha_modes[0],
    //         view_formats: vec![],
    //         desired_maximum_frame_latency: 2,
    //     };

    //     surface.configure(&device, &config);

    //     // Create the uniform buffer and manage it
    //     #[repr(C)]
    //     #[derive(Debug, Copy, Clone, bytemuck::Zeroable, bytemuck::Pod)]
    //     struct Uniforms {
    //         center: [f32; 2],
    //     }

    //     let center_data = Uniforms { center: [0.0, 0.0] };
    //     let center_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
    //         label: Some("center_buffer"),
    //         contents: bytemuck::cast_slice(&[center_data]),
    //         usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
    //     });

    //     println!("MainEventsCleared");

    //     // let surface = app_handle.state::<wgpu::Surface>();
    //     // let render_pipeline = app_handle.state::<wgpu::RenderPipeline>();
    //     // let device = app_handle.state::<wgpu::Device>();
    //     // let queue = app_handle.state::<wgpu::Queue>();
    //     // let bind_group_layout = app_handle.state::<wgpu::BindGroupLayout>(); // Retrieve the bind group layout
    //     // let center_buffer = app_handle.state::<wgpu::Buffer>(); // Retrieve the uniform buffer
    //     // let start_time = app_handle.state::<Instant>(); // Retrieve the Instant

    //     // Get the current time and calculate the circle's new center
    //     let time = Instant::now().elapsed().as_secs_f32();
    //     let center = [0.5 * (time.sin() + 1.0), 0.5 * (time.cos() + 1.0)]; // Animate the circle in a circular path

    //     // Create the bind group for passing the uniform to the shader
    //     let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
    //         label: Some("Bind Group"),
    //         layout: &bind_group_layout,
    //         entries: &[wgpu::BindGroupEntry {
    //             binding: 0,
    //             resource: center_buffer.as_entire_binding(),
    //         }],
    //     });

    //     queue.write_buffer(&center_buffer, 0, bytemuck::cast_slice(&center));

    //     let frame = surface
    //         .get_current_texture()
    //         .expect("Failed to acquire next swap chain texture");

    //     let view = frame
    //         .texture
    //         .create_view(&wgpu::TextureViewDescriptor::default());

    //     let mut encoder =
    //         device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: None });

    //     {
    //         let mut rpass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
    //             label: None,
    //             color_attachments: &[Some(wgpu::RenderPassColorAttachment {
    //                 view: &view,
    //                 resolve_target: None,
    //                 ops: wgpu::Operations {
    //                     load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
    //                     store: wgpu::StoreOp::Store,
    //                 },
    //             })],
    //             depth_stencil_attachment: None,
    //             timestamp_writes: None,
    //             occlusion_query_set: None,
    //         });
    //         rpass.set_pipeline(&render_pipeline);
    //         rpass.set_bind_group(0, &bind_group, &[]);
    //         rpass.draw(0..3, 0..1);
    //     }

    //     queue.submit(Some(encoder.finish()));
    //     frame.present();

    //     app.manage(center_buffer); // Manage the uniform buffer

    //     app.manage(surface);
    //     app.manage(render_pipeline);
    //     app.manage(device);
    //     app.manage(queue);
    //     app.manage(Mutex::new(config));
    //     app.manage(bind_group_layout); // Manage the bind group layout
    //     app.manage(Instant::now()); // Manage the Instant

    //     Ok(())
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

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .setup(move |app| {
            let _ = setup_wgpu_overlay(app);
            setup_app(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, showOverlay, hideOverlay])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| match event {
            RunEvent::WindowEvent {
                label: _,
                event: WindowEvent::Resized(size),
                ..
            } => {
                // let config = app_handle.state::<Mutex<wgpu::SurfaceConfiguration>>();
                // let surface = app_handle.state::<wgpu::Surface>();
                // let device = app_handle.state::<wgpu::Device>();

                // let mut config = config.lock().unwrap();
                // config.width = if size.width > 0 { size.width } else { 1 };
                // config.height = if size.height > 0 { size.height } else { 1 };
                // surface.configure(&device, &config)

                let wgpu_state = app_handle.state::<Arc<WgpuState>>();

                let mut config = wgpu_state.config.lock().unwrap();
                config.width = size.width.max(1);
                config.height = size.height.max(1);
                wgpu_state.surface.configure(&wgpu_state.device, &config);
            }
            RunEvent::MainEventsCleared => {}
            _ => (),
        });
}
