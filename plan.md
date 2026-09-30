GOAL

Turn the current version into a clear, polished product story — not just a nice animation.

The video should explain, visually and with minimal copy:

Your Game → Pipelab → Web Build + Electron Build → Poki / Steam / itch.io → Ship → Success.

Keep the existing continuous-motion approach, but tighten timing, layout, and narrative clarity.

☐ 1. REBUILD THE OPENING AS A REAL STORY

The beginning should feel as intentional and branded as the ending.

- ☐ Start immediately with the Pipelab identity: logo + Pipelab, then introduce the problem instead of beginning on an empty frame.
- ☐ Replace the current intro copy with something clearer, e.g.:
  “Your game is ready.”
  “Now you have to ship it.”
- ☐ Introduce “Your Game” as the hero object, then progressively reveal the release problem: Web, desktop, Steam, itch.io, Poki.
- ☐ Avoid dead pauses in the first 7–8 seconds. There should always be meaningful progression: text appears → game appears → destinations appear → Pipelab organizes them.
- ☐ Make the transition into the Pipelab workspace calm and deliberate: the elements align into the interface rather than dramatically collapsing/zooming.

Guidance: the beginning and ending should feel like parts of the same film — strong logo presence, large clean typography, simple explanations, confident pacing.

☐ 2. MAKE CAPTIONS LARGE, CONSISTENT, AND BOTTOM-ANCHORED

Captions should explicitly explain what the viewer is seeing without competing with the UI.

- ☐ Put explanatory captions consistently near the bottom of the frame, inside a safe bottom margin.
- ☐ Increase their size substantially. They should be readable instantly at normal video size, not behave like UI microcopy.
- ☐ Keep captions to one short sentence, ideally 4–8 words:
  “Choose where you want to ship.”
  “Pipelab prepares every required build.”
  “One release. Multiple outputs.”
  “Everything is ready to ship.”
- ☐ Only change caption when the visual meaning changes. Avoid text transitions occurring independently from the action.
- ☐ Animate captions simply: small y-offset + opacity. No text morphing, aggressive scaling, or horizontal flying.

Guidance: UI shows WHAT is happening. Caption explains WHY it matters.

☐ 3. FIX THE CORE RELEASE LOGIC: ONE BUILD PROFILE → WEB + ELECTRON

The current build-resolution section should become the main product explanation.

- ☐ Begin with a single generic “Build profile” state after destinations are selected.
- ☐ Resolve that build profile into TWO outputs:
  Web Build
  Electron · Windows x64
- ☐ Make the routing visually explicit:
  Your Game → Web Build → Poki
  Your Game → Web Build → Electron · Windows x64 → Steam + itch.io
- ☐ Do not put an “Artifacts” block inside this route. Artifacts are outputs/results, not a routing step.
- ☐ Hold the fully resolved routing state long enough to understand it before transitioning to Ship.

Guidance: this is the hero moment. Slow it down. The viewer should understand that Pipelab automatically prepares different outputs for different destinations.

☐ 4. REMOVE DEAD TIME, WEIRD ZOOMS, AND REMAINING MISALIGNMENTS

The film should constantly progress without constantly moving.

- ☐ Review every pause longer than ~0.5–1s. If nothing new is being understood, shorten it. Keep breathing room only after important reveals such as Web + Electron resolution or final success.
- ☐ Keep the global camera essentially fixed at scale 1. Remove remaining unnecessary zoom-in / zoom-out behavior.
- ☐ Use local emphasis instead: slightly enlarge/glow the active card, animate its connector, then settle it back.
- ☐ Correct remaining layout issues so all settled states use the same anchors, spacing system, baselines, and card alignment. In particular, ensure Web Build, Electron, Poki, Steam, and itch.io form an intentionally balanced composition rather than floating around available space.
- ☐ During the execution phase, prefer semantic layout over equal spacing. The two branches should remain visually understandable:
  Web → Poki
  Web → Electron → Steam / itch.io

Guidance: no element should move just to make the screen feel alive. Motion must communicate progression.

☐ 5. POLISH SHIP → RESULTS → END CARD AS ONE CONTINUOUS PAYOFF

The final third should be the simplest and most satisfying part.

- ☐ After “Ready to ship”, focus clearly on Ship, then execute sequentially:
  Prepare source → Web Build → Electron → Poki → Steam → itch.io.
- ☐ Introduce Artifacts only after execution succeeds:
  Web Build ✓
  Windows x64 ✓
  Then show Poki / Steam / itch.io as successful deliveries.
- ☐ Use a clear result message such as:
  “One release.”
  “Every destination.”
  Hold it long enough to land.
- ☐ Remove any blackout/reset between results and branding. Keep one persistent element — preferably the Pipelab logo — and let the result composition simplify around it.
- ☐ End on a separate, stable end card:
  [Pipelab logo]
  Pipelab
  “Ship games, not release scripts.”
  Use only a subtle fade/vertical settle and hold for ~2 seconds.

FINAL VALIDATION

Watch the finished video muted.

A first-time viewer should understand:

Pipelab starts with my game → I choose Poki, Steam and itch.io → Pipelab determines that I need a Web Build and an Electron Windows build → each output is routed to the correct destination → I press Ship → everything runs → my artifacts and deliveries succeed.

If that story isn't obvious without reading tiny UI text, simplify the visuals rather than adding more animation.

FINAL GOAL

Make the commercial feel less like “look at this animated interface” and more like:

“Here is the release problem game developers have. Here is how Pipelab solves it.”
