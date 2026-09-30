# Pipelab Commercial — Continuous Motion Storyboard

## Story strategy

This video tells indie game developers that Pipelab turns one game project into the web and desktop artifacts its chosen destinations need, then ships them in one release.

## Object ledger

- **Your Game / Construct 3** remains the source from the first frame through execution.
- **Web build → Web artifact** is the direct playable web output and stays visible as a distinct artifact family.
- **Steam, itch.io, and Poki** are persistent destination cards. They first appear as release choices, then become route endpoints, execution steps, and delivery receipts.
- **Build profile → Resolving… → Electron · Windows x64** is one persistent card. It resolves in place and routes the desktop artifact to Steam and itch.io.
- **Pipelab frame, mark, and header** settle around the same objects; Configuration, Builds, Artifacts, Runs, and Ship stay anchored to one header grid.
- **Web build and Windows x64 artifact** become result cards only after execution. Artifacts are outputs, never a release-route stage.

## Timecoded choreography

| Time | Beat | What happens | Continuity and purpose |
| --- | --- | --- | --- |
| 0–3s | Your game is ready | Large “Your game is ready.” copy; one readable card: YOUR GAME / Web project / Construct 3. | Establishes the viewer and their game first. |
| 3–7s | The release problem | “Now it needs to reach every platform.” Web build and Desktop build appear one at a time, then Steam, itch.io, and Poki. | The game card holds its anchor; destination cards reveal why one project faces different requirements. No chaos burst. |
| 7–12s | Pipelab organizes it | A thin Pipelab frame draws around the composition. The logo and aligned header settle in; the existing cards move onto the shared app grid. Copy: “One release. Multiple destinations.” | The app forms around the same source and provider objects. No portal pull, replacement screen, or floating utility card. |
| 12–17s | Choose destinations | The three provider cards settle into a clear selection column and select in sequence. Copy: “Choose where you want to ship.” | Your Game stays visible on the left; the viewer can read the actual destination choices. |
| 17–25s | Pipelab resolves the routes | Your Game connects to WEB ARTIFACT. The web card branches directly to Poki and to a generic Build profile. That same profile reads “Resolving…” and then “Electron · Windows x64.” The Electron card routes to Steam and itch.io. Copy: “Pipelab prepares what each destination needs.” | This is the hero proof. Anchors are derived from card bounds. Hold the fully resolved source → web artifact → Poki / Electron → Steam + itch.io map for at least 2 seconds. No graph-editor styling. |
| 25–29s | Ready to ship | Existing source, artifact, build, and provider cards regroup into two related rows of three execution cards. Header action is Ship. Copy: “Everything is ready.” | Same objects change roles and remain large; no five-card strip or tiny labels. Hold the ready state before the click. |
| 29–37s | Execution | Ship presses. One traveling focus advances sequentially: Prepare source → Web artifact → Poki delivery, then Electron · Windows x64 → Steam delivery → itch.io delivery. Each card shows its current action, progress, then success before the next begins. Copy: “Build and publish in one run.” | The upper row completes the direct web route; the lower row completes the desktop route. No simultaneous status changes. |
| 37–41s | Results | The web and Electron cards become **ARTIFACTS**: Web build ✓ Ready; Windows x64 ✓ Ready. Poki, Steam, and itch.io become **DELIVERIES** receipts with ✓ Delivered. Copy: “One release. Every destination.” | Outputs are visually grouped by what Pipelab produced and where it delivered them. Hold this result. |
| 41–45s | Brand ending | Result cards and frame simplify and fade. After they settle, the centered Pipelab mark, wordmark, and “Ship games, not release scripts.” appear with a small opacity/y rise only. | Separate end-card copy; no text morph, large travel, or scale-from-zero. Hold the final state at least 2 seconds. |

## Layout system

- Single 1920×1080, 45-second stage; one paused GSAP timeline.
- Shared app frame: consistent 58px outer x margin, 126px top, 44px internal inset. Header uses one y-centerline and matched left/right padding.
- Route state uses a left source anchor, central web artifact, an upper direct Poki branch, and a lower desktop build profile that branches to a right-side Steam/itch.io stack.
- Execution uses a 3×2 grid with the same card width, height, status baseline, and measured spacing. Top row: source, web artifact, Poki. Bottom row: Electron build, Steam, itch.io. The active focus moves left-to-right across each row.
- Result state pairs two readable artifact cards with a three-card delivery stack, sharing one optical centerline.
- Route geometry comes from each settled card's measured box, not independent hardcoded line coordinates.

## Motion system

- Default camera scale is exactly 1; do not use section-based zoom choreography. Any proof push stays within 0.98–1.02 and returns to 1.
- The introduction uses deliberate sequential arrivals, not orbiting or collisions.
- The app surface draws in with a restrained border/rule reveal; cards settle with short, smooth transform moves.
- Path strokes are drawn from card edges to card edges. During execution a single pulse moves between measured card centers.
- The Build profile card stays in place as its generic, resolving, and resolved text layers change visibility.
- Text messages are separate elements, timed to their own visual action. No `textContent` replacement during movement.
- No crossfades between complete UI screens, camera reset, giant portal, arbitrary extra features, or animated end-card stunt.

## Muted playback acceptance

At normal playback size, without sound or reliance on tiny labels, a first-time viewer understands: one game is ready; destinations need different outputs; Pipelab organizes the release; the web artifact goes directly to Poki; Pipelab resolves Electron Windows x64 for Steam and itch.io; the user presses Ship; work runs sequentially; web/desktop artifacts and all three deliveries succeed.
