# Pipelab — Continuous Motion Storyboard

## Creative premise

One continuous camera move follows release work physically becoming a release. A single dark graphite world, one Pipelab-blue route accent, and persistent source/provider objects carry the story. There are no replacement screens, crossfades, or scene resets. Existing objects move into their next roles while one paused, seek-safe GSAP timeline drives the 35-second composition.

## Object ledger

- **Construct 3 project / Moonbreak** — the finished game tile in the opening; remains the source card through destination choice, build resolution, execution, and artifact result.
- **Build / Package / Upload / folder strips** — loose release chores; fold into the Pipelab workspace frame, then become the workflow's execution rails and progress bars.
- **Steam and itch.io marks** — begin separated in the release clutter; travel into destination cards; those exact cards move into execution rows and become success badges.
- **Electron · Windows x64** — begins as an incomplete/recommended build chip hidden among the clutter; grows into the missing middle card in the route; later becomes the completed Windows artifact.
- **Pipelab icon / wordmark** — forms where the messy objects converge, stays attached to the workspace chrome, and becomes the stable center of the final lockup.

## Timecoded choreography (35 seconds)

### 0:00–0:04 — Game finished

“GAME: FINISHED.” fills the left-center. The large Construct 3 project tile anchors the lower-left. Build, Package, Upload, folders, Steam, and itch.io arrive around it in spatially separate positions. They accumulate and orbit closer, but the game tile remains readable and still.

**Carry:** the project tile never disappears; every chore and provider has a distinct starting position and trajectory toward the workspace's eventual origin point.

### 0:04–0:08 — The work pulls together

The chores multiply briefly as duplicates/echo labels, then the original cards and provider marks accelerate inward along curved paths toward one point. The Construct tile leads the move. Their movement draws the app boundary and top chrome; their cards tuck into that structure. Pipelab's mark resolves at the convergence point from the folded folder/route shapes. No object fades out to make room.

**Carry:** the project tile is not swallowed; it exits the gather at large scale and keeps traveling toward its source position in the new workspace.

### 0:08–0:13 — Your game enters Pipelab

The framing follows the Construct tile into a focused workspace. The source card grows to be the clear hero: Construct 3 / Moonbreak / project files. A restrained Pipelab header, “Configuration / Builds / Artifacts / Runs,” and source column assemble around the card from the folded chores. Hold long enough to read “This is my game.”

**Carry:** the large source object stays visible and becomes the fixed left anchor for every later relationship.

### 0:13–0:17 — Choose destinations

Steam travels in from the far right and settles into an upper destination card; itch.io follows and settles beneath it. The source remains anchored on the left. The camera eases out just enough to show the full source-to-destination gap. A user's intent is clear before Pipelab fills in the missing build.

**Carry:** source and destination card positions remain fixed as the gap opens between them.

### 0:17–0:22 — The missing build resolves

A small “Resolving build profile” cue forms in the gap from the earlier Package tile. A prominent Electron · Windows x64 build card grows from that cue and inserts between Construct and the two destinations. A single bright route moves from Construct into Electron, then branches to Steam and itch.io. Both branch endpoints meet their real destination cards. The build card locks into place with a decisive settle. This is the clearest, longest-held proof of Pipelab's value.

**Carry:** the same three object families—source, build, and providers—will become the exact execution rows next.

### 0:22–0:25 — Ready to ship

Without replacing the composition, the camera pulls back. The source, Electron build, Steam, and itch.io cards shrink and slide into a compact release execution surface, each landing in a correspondingly named row. The chore cards have become the row labels/rails. “Ready to ship” and a large Ship button are revealed by the workspace frame opening. Hold for a readable beat; then shift focus to Ship.

**Carry:** the cards are still the same objects, only regrouped and scaled into rows.

### 0:25–0:31 — Ship and execution

A cursor presses Ship. The button becomes the running indicator and a blue pulse travels through the persistent rows in causal order: Source prepares; Electron build progresses and succeeds; Package progresses and succeeds; Steam uploads and succeeds; itch.io uploads and succeeds. Each row begins only after the previous row completes. One moving pulse leads the eye; no simultaneous green-state swap.

**Carry:** completed build/destination rows stay on screen and lift out of the execution layout to become result cards.

### 0:31–0:33 — Result

The successful Electron row expands into a readable “Release 1.0.0 / Windows x64 artifact ✓” card. Steam and itch.io rows lift into two delivery-success cards. “Built once. Delivered.” lands beside the results and holds long enough to read.

**Carry:** the source, package, build, and two destination objects all remain visible as results; none gets replaced by a new page.

### 0:33–0:35 — Result becomes Pipelab

The three result cards and their route lines move inward, compressing into the persistent Pipelab mark and wordmark. The final copy resolves below it: “Ship games, not release scripts.” Hold the logo as the stable end state.

## Visual system

- 1920×1080, dark graphite `#111318`; near-white text; Pipelab blue `#3B82F6`; success green only after each sequential completion.
- One persistent stage and one global camera wrapper. Camera moves track the Construct tile, widen for destination/build relationships, then pull back for execution and results.
- Source/build/destination cards are oversized enough to read at full-frame viewing; avoid microcopy. UI details support recognition only.
- Curved connectors name real anchors and communicate direction. They draw along the same physical routes the cards travel; no abstract floating lines.
- Motion uses shared-element travel, anchor-preserving card scale, path travel, and sequential state changes. Fast chaos gives way to a confident pace; the build insertion is the motion peak; success and final lockup breathe.

## Acceptance checks

- A single 35-second graphic clip owns the whole visual timeline; no scene crossfades/cuts/reset points.
- At the frozen keyframes, the current focal object is identifiable within one second.
- Muted playback reads: finished game → enters Pipelab → chooses destinations → build inserted → Ship → sequential progress → successful artifact and deliveries → Pipelab.
- Every major change repositions, resizes, groups, or reuses existing visual objects; no complete UI replacement.

## Alignment system — layout pass

All settled interface states share one 1,804 × 830 app frame at x=58/y=126, with 44px internal frame padding. The header items share a y=188 optical centerline; the left brand lockup and right primary action sit on matching frame insets. The content frame uses a 190px left anchor and an 1,818px right anchor.

- **Workspace / build resolution:** the Construct source and Electron build share a y=412 top edge and 490/485px widths, with the same 110px gap. Steam and itch.io use equal 330 × 184px cards, x=1,395, with 30px vertical breathing room; their combined stack centers on the source/build midline. Route endpoints meet the actual card edges and centerlines.
- **Execution:** all five cards use the same 300px width and 169–171px rendered height, y=400, on x anchors 104/455/806/1,157/1,508. Each step advances by 351px, giving a fixed 51px gap. The final card ends at x=1,808, preserving the right inset. Status labels and progress rails share the same internal bottom alignment.
- **Result:** the 485 × 276px artifact sits at x=775/y=405. The two equal destination receipts sit at x=1,295/y=345 and y=555, creating an even 26px stack gap; the stack and artifact share a centerline. The source ghost is removed as the results resolve.
- **End lockup:** the headline is centered on the same composition axis as the Pipelab identity; result title left edge is aligned to the artifact composition rather than floating independently.

The route geometry, card anchors, execution pulse centers, and final title positions are derived from these settled coordinates so cards land on-grid when each continuous transition finishes.
