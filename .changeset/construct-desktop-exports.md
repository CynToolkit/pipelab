---
"@pipelab/shared": patch
"@pipelab/core-node": patch
"@pipelab/providers": patch
---

Construct is now a project source with its own build engine, like Godot. The web export is a Construct build that Electron, Tauri and Poki consume, and Pipelab adds it automatically with the packager when a destination needs it. Defaults pick the web engine that accepts the source. Construct's own Windows (WebView2), macOS (WKWebView) and Linux (CEF) exports are declared but unavailable for now.
