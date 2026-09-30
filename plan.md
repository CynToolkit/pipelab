GOAL

Rework the current Pipelab commercial into a slower, clearer 40–45 second product showcase where someone unfamiliar with Pipelab can understand, on the first watch:

Your Game → web artifact → choose destinations → Pipelab determines what each destination needs → direct web delivery to Poki + Electron desktop build for Steam / itch.io → Ship → execution → artifacts and successful deliveries.

The commercial must feel like one continuous piece of motion, not a succession of screens.

Do not add more visual complexity. Improve clarity, pacing, hierarchy and product accuracy.

☐ 1. REPLACE THE INTRO COMPLETELY

Do not use:

“GAME: FINISHED.”

It feels abrupt and does not explain enough about the situation.

Use a calmer opening that establishes the problem.

Suggested structure:

0–3s

Large text:

“Your game is ready.”

Show a generic project card:

YOUR GAME
Web game
Construct 3

Do not call the game Moonbreak.

Always use:

“Your Game”

3–7s

Release-related elements gradually appear around it:

Web build
Desktop build
Steam
itch.io
Poki

Small supporting text:

“Now it needs to reach every platform.”

The elements should not explode onto screen.

Introduce them sequentially and give the viewer time to understand each one.

The point of the intro should be:

“I have one game, but different destinations expect different things.”

Do not immediately explain Pipelab.

Let the problem exist for a moment first.

☐ 2. SLOW THE GLOBAL PACING

Increase the commercial from 35 seconds to approximately 40–45 seconds.

Do NOT use the additional time for more features.

Use it to let existing concepts breathe.

Important states should remain readable for at least 2–3 seconds after their animation finishes.

Recommended pacing:

0–7s
Establish Your Game and the release problem.

7–12s
Pipelab organizes the release.

12–17s
Choose destinations.

17–25s
Pipelab resolves the required release paths.

25–29s
Ready to ship.

29–37s
Execution.

37–41s
Results.

41–45s
Brand ending.

Avoid having a major new concept every 2 seconds.

☐ 3. ADD SHORT DESCRIPTIVE COPY

The video currently relies too heavily on the viewer understanding the UI.

Add very short contextual text explaining what is currently happening.

Do not add paragraphs.

One short sentence at a time.

Examples:

Opening:
“Your game is ready.”

Then:
“Now it needs to reach every platform.”

When Pipelab appears:
“One release. Multiple destinations.”

When destinations appear:
“Choose where you want to ship.”

When Pipelab determines the routes:
“Pipelab prepares what each destination needs.”

Before execution:
“Everything is ready.”

During execution:
“Build and publish in one run.”

Result:
“Built once. Delivered everywhere.”

The descriptive copy must support what is visibly happening at that exact moment.

Never display marketing copy unrelated to the current visual action.

☐ 4. USE “YOUR GAME” EVERYWHERE

Remove:

Moonbreak

Replace it with:

Your Game

The source card should be generic enough that any game developer can mentally substitute their project.

Suggested source card:

YOUR GAME

Web project

Construct 3

The commercial should demonstrate Pipelab rather than advertise a fictional game.

☐ 5. KEEP “BUILD PROFILE” GENERIC FIRST

Do not show Electron immediately.

This is an important part of the story.

When destinations are initially selected, show a generic middle block:

Build profile

or:

Desktop build

The viewer should understand:

“There is a build step, but Pipelab hasn't resolved exactly what it needs yet.”

Then animate Pipelab resolving it.

Example:

Build profile

↓

Resolving…

↓

Electron
Windows x64

This transformation should be one of the hero moments of the commercial.

The Build Profile card itself should remain in place and transform into the Electron configuration.

Do not replace it with an unrelated new card.

☐ 6. ADD THE MISSING WEB ARTIFACT PATH

The current commercial incorrectly makes Electron look like the only output.

Pipelab needs to visually show two artifact families.

The source is a web game.

From “Your Game”, there should first be a clear:

WEB ARTIFACT

This web artifact has two possible roles:

A. It can go directly to compatible web destinations such as Poki.

B. It can be used as input for Electron, which creates a Windows desktop artifact for desktop destinations.

The central product visualization should therefore eventually communicate:

                         → Poki
                        /
Your Game → Web artifact

                         → Electron → Windows x64 → Steam
                                                   → itch.io

Do NOT make this look like the legacy graph editor.

It is a conceptual release route visualization inside the commercial.

Use cards and spatial relationships, not graph-editor nodes.

☐ 7. ADD POKI AS A DESTINATION

Poki is currently missing and this makes the release story incomplete.

Destination selection should show:

Steam
itch.io
Poki

Their relationship should then explain why Pipelab is useful.

Poki:

receives the web artifact.

Steam / itch.io:

receive the appropriate desktop artifact generated through Electron.

This visually demonstrates that one project can require different release paths depending on the destination.

That is a much stronger product story than:

Your Game → Electron → everything.

☐ 8. MAKE THE RELEASE ROUTES THE HERO MOMENT

Around 17–25 seconds, hold the composition long enough for the user to understand it.

Start with:

Your Game

Then reveal:

Web artifact

Then destinations.

Poki attaches directly to Web artifact.

Steam and itch.io cannot use that same route in this example.

Show the generic:

Build profile

between the Web artifact and the desktop destinations.

Then:

Build profile
→ Resolving…
→ Electron · Windows x64

The final composition should clearly read visually as:

Your Game
    ↓
Web artifact
   ↙     ↘
Poki    Electron · Windows x64
              ↓
         Steam + itch.io

Hold this final resolved state.

Do not immediately move into the next sequence.

Give the viewer approximately 2 seconds to absorb it.

☐ 9. REMOVE THE ARTIFACTS BLOCK FROM THE ROUTE GRAPH

The current animation moves the Package/Artifacts card into the main route visualization.

Remove this.

There is no clear reason for an “Artifacts” UI block to be floating between the source/build/destinations.

Artifacts are OUTPUTS.

They should not behave like another stage in the release routing graph.

During release configuration, only visually represent:

Source
Artifact type / build output
Build profile when required
Destinations

Artifacts should become prominent AFTER execution.

For example:

Windows x64 build ✓
Web build ✓

Then later, in the result:

Artifacts

Web build
Windows x64 build

Do not put an “Artifacts” navigation-style card in the middle of the release path.

☐ 10. REMOVE THE WEIRD CAMERA ZOOMS

The current camera regularly scales between roughly 0.94, 1.00, 1.035, 1.07 and 1.11.

This creates unnecessary breathing/zooming and makes the composition feel unstable.

Remove almost all camera scaling.

Default camera:

scale: 1

Prefer moving objects instead of moving the camera.

Allowed camera movement:

very subtle horizontal/vertical tracking when necessary.

Maximum recommended zoom variation:

0.98–1.02

Only use a stronger zoom if it has a clear narrative purpose.

For example:

A very subtle push toward the Build Profile while it resolves into Electron.

Then return smoothly to scale 1.

Do not zoom simply because the timeline enters a new section.

The interface should feel physically stable.

☐ 11. MAKE THE PIPELАB REVEAL CALMER

The current “everything gets sucked into a tiny point and the app explodes outward” idea is visually clever but too aggressive.

Keep object continuity but simplify it.

Instead:

release elements begin around Your Game.

they gradually align.

a subtle Pipelab frame draws itself around them.

the Pipelab logo/header appears.

the existing elements simply settle into their proper positions.

The message becomes:

“Pipelab organizes the release.”

Not:

“Everything was swallowed by a portal.”

Prefer choreography over spectacle.

☐ 12. CLEAN UP THE HEADER

Once inside Pipelab:

Pipelab logo

Configuration
Builds
Artifacts
Runs

Ship

Nothing else should float inside the header.

Remove the temporary floating Artifacts card.

Do not show Upload once Pipelab has been introduced.

Manual “Upload” can exist in the chaotic intro as a problem.

Inside Pipelab the action is:

Ship

Use the real Pipelab terminology consistently.

☐ 13. REWORK READY TO SHIP

After the release paths are resolved, the objects should smoothly reorganize into an execution view.

Use:

Your Game
Web
Electron
Poki
Steam
itch.io

But make the execution structure correspond to actual work.

Do not invent arbitrary stages simply because five equal cards look visually nice.

Example execution sequence:

Prepare source

Web artifact

Electron · Windows x64

Poki delivery

Steam delivery

itch.io delivery

If the number of cards makes the horizontal row too dense, use two visually related rows rather than shrinking everything.

Readability is more important than mathematical symmetry.

☐ 14. KEEP EXECUTION SEQUENTIAL AND SLOW

This part of the current version works conceptually.

Keep the single travelling progress logic.

But slow it slightly.

Example:

Prepare source
→ success

Web artifact
→ success

Electron · Windows x64
→ build
→ success

Poki
→ uploading
→ success

Steam
→ uploading
→ success

itch.io
→ uploading
→ success

Do not run multiple states simultaneously.

The viewer's eye should follow one operation at a time.

Status text must remain readable.

Avoid tiny Waiting / Building / Succeeded labels.

☐ 15. MAKE ARTIFACTS APPEAR WHERE THEY ACTUALLY MATTER

After the run completes:

THEN introduce the Artifacts concept.

Transform the successful output states into:

ARTIFACTS

Web build
✓ Ready

Windows x64
✓ Ready

Then show delivery receipts:

Poki
✓ Delivered

Steam
✓ Delivered

itch.io
✓ Delivered

This gives Artifacts an understandable role:

“They are the things Pipelab produced.”

Rather than:

“Artifacts is another mysterious node in my release.”

☐ 16. REWORK THE RESULT MESSAGE

Potential result copy:

“Built once.”
“Delivered everywhere.”

However, be careful because technically multiple outputs may be generated.

Alternative stronger wording:

“One release.”
“Every destination.”

or:

“From one project.”
“To every destination.”

Choose the wording that best matches the final visual composition.

Do not force “Built once” if the visualization explicitly demonstrates both a web artifact and an Electron desktop build.

☐ 17. COMPLETELY FIX THE FINAL TEXT TRANSITION

The current ending changes textContent inside the existing headline while it is moving/scaling.

This makes the transition feel mechanically strange.

Do not mutate:

“Built once. Delivered.”

into:

“Ship games, not release scripts.”

inside the same DOM text object.

They are two different pieces of communication.

Use separate elements.

RESULT COPY

holds in place:

“One release.
Every destination.”

Then it gently fades/moves away while the resulting cards converge or simplify.

Only after the visual result has settled should the end card appear.

END CARD

Pipelab logo

Pipelab

“Ship games, not release scripts.”

Keep the final end card almost static.

Use a simple opacity + very small vertical movement:

y: 12 → 0
opacity: 0 → 1

No scaling from tiny objects.

No text morph.

No large horizontal movement.

No changing textContent while animated.

Hold the final frame for at least 2 seconds.

☐ 18. KEEP THE FINAL BRAND MOMENT SIMPLE

The commercial spends 40+ seconds explaining the product.

The ending does not need another animation trick.

Dark background.

Pipelab logo.

Pipelab.

Ship games, not release scripts.

Optional small supporting line:

Build. Package. Ship.

Nothing else.

Let it breathe.

☐ 19. TECHNICAL CLEANUP OF THE EXISTING IMPLEMENTATION

Do not rebuild the project architecture.

Keep:

one continuous.html composition

one GSAP timeline

shared persistent objects

grid-based coordinates

current HyperFrames setup

But refactor the timeline so sections are easier to reason about.

Create explicit phases:

intro
organize
destinations
resolveRoutes
ready
execution
results
end

Avoid repeatedly overwriting textContent on the same visual elements.

Create dedicated DOM elements for:

intro headline
context caption
workspace title
result headline
end-card headline

This will make transitions much cleaner.

☐ 20. REMOVE CAMERA MAGIC NUMBERS

The current timeline contains camera states such as:

1.045
1.11
1.07
1.035
0.94

Remove this zoom choreography.

Keep the camera near:

scale: 1

If a focus move is needed, move the world by a few pixels or emphasize the target object with:

border
glow
route animation
scale around 1.03–1.05 on the OBJECT itself

Do not make the entire application breathe in and out.

☐ 21. DERIVE ROUTES FROM CARD GEOMETRY

Do not keep hardcoded connector coordinates that become wrong when the layout changes.

Derive the visual anchors from the settled layout:

source → web artifact

web artifact → Poki

web artifact → Electron

Electron → Steam

Electron → itch.io

Connectors should start/end at actual card boundaries and vertical centerlines.

When a layout coordinate changes, the routes should stay aligned automatically.

☐ 22. UPDATE THE DOCUMENTATION BEFORE RENDERING

Update BRIEF.md and MOTION-STORYBOARD.md so Codex/HyperFrames are not working from contradictory requirements.

BRIEF.md should say:

40–45 seconds

Your Game, not Moonbreak

Poki included

web artifact included

Electron only resolves when a desktop build is required

no floating Artifacts block

minimal camera zoom

separate result/end-card typography

Remove the obsolete:

“Aim for 25 seconds”

and any storyboard instructions that no longer match the final concept.

☐ 23. FINAL MUTED-PLAYBACK TEST

Before considering the commercial finished, watch it with no sound.

Without reading tiny UI labels, it must communicate:

Your game is ready.

Different destinations need different outputs.

Pipelab organizes the release.

The original web artifact can go to Poki.

Pipelab resolves an Electron Windows build for desktop destinations.

Everything is ready.

Ship.

Pipelab performs the work sequentially.

Web and desktop artifacts are created.

Poki, Steam and itch.io receive their releases.

Done.

If any of those ideas are unclear without sound, refine that section before adding more visual effects.

☐ 24. FINAL POLISH TEST

Check every frozen keyframe for:

consistent alignment

no floating unexplained elements

no tiny status text

no unnecessary zoom

no abrupt text mutation

no overlapping copy

one obvious focal point

sufficient reading time

consistent Pipelab terminology

product behavior matching the current develop branch

FINAL GOAL

Produce a calm, premium Pipelab commercial that tells one simple story:

“Start with Your Game. Choose where it should go. Pipelab figures out what needs to be built, creates the right web and desktop artifacts, and ships them to Poki, Steam and itch.io.”

The viewer should understand Pipelab before they are impressed by the motion design.

Clarity first.
Continuity second.
Polish third.
