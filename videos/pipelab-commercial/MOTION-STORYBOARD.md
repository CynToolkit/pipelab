# Pipelab Commercial — Continuous Motion Storyboard

## Story spine

Pipelab opens with its identity, then reveals the developer’s game and the work needed to reach different platforms. That one project settles into a release workspace. The Web Build route serves Poki directly; a generic Build profile resolves in place to Electron · Windows x64 for Steam and itch.io. The user presses Ship, follows the sequential run, and sees successful artifacts and delivery receipts.

## Persistent object ledger

- **Pipelab logo + wordmark:** visible on the first frame; moves from an opening lockup to the shared workspace header, remains during results, then centers for the end card.
- **Your Game / Construct 3:** introduced as the hero object, retained through the workspace and execution.
- **Web Build:** remains a distinct output card; its execution success becomes the Web Build artifact.
- **Build profile → Resolving… → Electron · Windows x64:** one card changes state in place; its execution success becomes the Windows x64 artifact.
- **Poki, Steam, itch.io:** cards appear as real destination choices, become route endpoints, then sequential delivery tasks and result receipts.
- **Pipelab frame and header:** draw around the same objects and dissolve only after the successful result has landed.

## Timecoded choreography

| Time | Beat | Choreography |
| --- | --- | --- |
| 0–3s | Brand → game | Pipelab mark and wordmark open centered near the top. “Your game is ready.” appears. Your Game / Web project / Construct 3 enters below. |
| 3–7s | Release problem | Bottom caption changes to “Now you have to ship it.” Web Build, Desktop build, Steam, itch.io, and Poki enter one at a time around Your Game. |
| 7–11s | Organize | The frame draws in. The same mark and wordmark settle into the header; the cards align to workspace anchors. Caption: “Pipelab organizes the release.” |
| 11–15s | Choose destinations | Steam, itch.io, and Poki receive selection marks in sequence while Your Game and the output cards remain visible. Caption: “Choose where you want to ship.” |
| 15–23s | Resolve routes | Measured route strokes connect Your Game → Web Build. The web output routes to Poki and to the generic Build profile. That same profile resolves into Electron · Windows x64, then connects to Steam and itch.io. Caption: “Pipelab prepares every required build.” Hold the complete map before moving on. |
| 23–27s | Ready | The same objects move into aligned, semantically grouped execution positions. “Ready to ship” and “Everything is ready to ship.” land. The Ship control is emphasized, then clicked. |
| 27–36s | Execute | One pulse advances in order: Prepare source → Web Build → Electron · Windows x64 → Poki delivery → Steam delivery → itch.io delivery. Each task activates, progresses, and succeeds before the pulse moves. Caption: “Build and publish in one run.” |
| 36–41s | Results | The completed Web Build and Electron task cards become the Web Build and Windows x64 artifacts. Poki, Steam, and itch.io become delivery receipts. Caption: “One release. Every destination.” The result holds while the frame and cards simplify around the persistent Pipelab mark. |
| 41–45s | End card | The mark finishes centered over the separate end-card headline, “Ship games, not release scripts.” Use opacity plus a 12px vertical settle only; hold the final state. |

## Grid and composition

- Fixed 1920×1080 frame; no section zoom. Caption baseline stays centered near the bottom safe margin, outside the main card area.
- Workspace routes use the source at left, Web Build center-left, the direct Poki destination above, and the Build profile/Electron card between Web Build and the right-side Steam/itch.io destinations. Connector endpoints derive from card bounds.
- Execution cards use two related rows. The upper route reads source → Web Build → Electron; the lower route holds Poki, Steam, and itch.io as delivery work. Cards share a readable status baseline and consistent size. The traveling focus follows the required execution order.
- Results align two artifact outputs together and three delivery receipts together. Section labels sit above, not over, their cards. The large result caption anchors below them.
- The final identity uses the already-visible logo rather than a new logo object or a blackout.

## Motion and typography

- Caption changes follow the corresponding visual action and use a small vertical settle with opacity only.
- Card motion preserves edge alignment and spacing anchors. Local scale/glow is reserved for the active build profile and Ship control.
- Route strokes grow from card edges, and the pulse follows the same geometry.
- Results and end-card messages are separate DOM elements. No mutating text, full-screen reset, dissolve between complete interfaces, or zoom for section changes.

## Muted acceptance check

At normal size, a viewer can follow: Pipelab → Your Game → selected Poki/Steam/itch.io → Web Build and Electron Windows x64 → Ship → sequential work → two artifacts and three successful deliveries. Small UI labels add precision but are not required to understand the flow.
