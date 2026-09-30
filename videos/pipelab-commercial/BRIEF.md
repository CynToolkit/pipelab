---
workflow: product-launch-video
flow: automation
storyboard: yes
message: "Pipelab takes one game project, prepares the web and desktop artifacts its chosen destinations require, then ships them in one release."
destination: website
aspect: 1920x1080
language: en
length: 45s
angle: calm-continuous-product-story
---

## Intent

A premium, motion-first product commercial for indie game developers and small studios. The viewer should understand on the first watch that one game project can produce different outputs for different destinations, and that Pipelab organizes the release and runs the work when the user presses Ship.

## Product truth

- This is a designed, simplified view of the current Pipelab Release workflow, not a screenshot and not the legacy graph pipeline editor.
- Represent one generic **Your Game** Construct 3 web project; never name the game Moonbreak.
- Construct 3 is the source. Show a **Web artifact** as an output from the source.
- Poki accepts the web application directory directly.
- Electron can produce a Windows x64 desktop application artifact for Steam and itch.io.
- Keep the build profile generic until Pipelab resolves the desktop route to Electron · Windows x64. Keep that same card in place through the resolve.
- Show Artifacts as produced outputs after execution, never as a stage between source and destinations.
- Use the real terms Configuration, Builds, Artifacts, Runs, Ready to ship, Ship, and Deliveries. Inside Pipelab, the action is Ship, not Upload.
- The workflow runs when the user presses Ship. Do not imply automatic or scheduled deployment.

## Story and copy

The story is one continuous 45-second composition. Start with the game, let destination complexity register, then let the existing project and provider cards settle into a Pipelab frame. The route proof is the hero: Your Game → Web artifact → Poki directly, and Web artifact → resolving Build profile → Electron · Windows x64 → Steam + itch.io. After Ship, execute six steps sequentially and transform the successful outputs into two artifact cards and three delivery receipts.

Use one short caption at a time, directly tied to the visible action:

- “Your game is ready.”
- “Now it needs to reach every platform.”
- “One release. Multiple destinations.”
- “Choose where you want to ship.”
- “Pipelab prepares what each destination needs.”
- “Everything is ready.”
- “Build and publish in one run.”
- “One release. Every destination.”

End on the Pipelab logo and wordmark with “Ship games, not release scripts.” Keep result copy and end-card copy in separate DOM elements.

## Visual and motion constraints

- Dark graphite, Pipelab blue, restrained green only for completed states; large readable typography and a stable shared app-frame grid.
- Keep one continuous camera at scale 1. Camera zoom variation is limited to 0.98–1.02 and only used with narrative purpose; prefer object motion and focus styling.
- Cards move between meaningful grid anchors. Draw route connectors from measured card bounds and centerlines.
- Introduce release entities sequentially and calmly. The Pipelab frame draws around the persistent objects; do not pull them into a tiny point or burst the app outward.
- Show Steam, itch.io, and Poki as real destination entities. Use cards and spatial routes, never draggable or generic graph nodes.
- Preserve one traveling progress focus during execution. Use two related rows of three cards for readable statuses.
- Keep final typography separate and the final end card nearly static for at least 2 seconds.
- No paragraphs, tiny status copy, unrelated marketing text, floating Artifacts block, abrupt text mutation, or unnecessary zoom choreography.

## Audio

Keep the existing restrained electronic MusicGen score and tactile UI sounds. Retiming may slow the existing bed to match the longer edit while preserving pitch; no new feature beats or louder effects.
