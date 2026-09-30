GOAL

Rework the current commercial into a simple, premium product story that a game developer understands on the first watch, even muted.

The central idea must be obvious:

Your Game → choose destinations → Pipelab figures out what each destination needs → Web Build + Electron/Windows → Ship → successful deliveries.

Do not add more concepts. Do not make the animation more spectacular. Make it clearer, more stable, better composed, and better sounded.

Target roughly 35–40 seconds. Prefer removing unnecessary states over stretching the video to 45 seconds.

☐ 1. SIMPLIFY THE STORY AND MAKE THE INTRO EXPLAIN THE PROBLEM

The beginning and ending should share the same polished, branded visual language.

☐ Start immediately with the Pipelab logo/wordmark and a clear story:
“Your game is ready.”
Then introduce:
“Now it has to reach every platform.”

☐ Introduce one generic hero object:
Your Game
Web project
Construct 3
Never use Moonbreak or another fictional game name.

☐ Introduce Poki, Steam and itch.io progressively as the problem:
one game,
multiple destinations,
different requirements.
Do not introduce unnecessary concepts like “desktop build” before the viewer needs them.

☐ Keep large explanatory captions at the bottom of the screen.
Use one short sentence at a time, approximately 4–9 words.
Examples:
“Choose where you want to ship.”
“Pipelab prepares what each destination needs.”
“Everything is ready.”
“Build and publish in one run.”

☐ Remove dead opening pauses.
Something meaningful should progress continuously:
brand → game → destinations → Pipelab solution.
This does not mean constant motion; it means there should not be empty time where nothing new is communicated.

Guidance:
The first 7–8 seconds should tell a small story, not behave like an animated title sequence.

☐ 2. CREATE ONE STABLE RELEASE MAP AND STOP MOVING THINGS UNNECESSARILY

After the destinations are selected, establish one strong composition and keep it for most of the commercial.

☐ Use one stable visual geography:

                 Web Build → Poki
                /
 Your Game → Build Profile
                \
                 Electron · Windows x64
                       ↘ Steam
                       ↘ itch.io

 Adjust the exact geometry for clarity, but preserve the meaning.

☐ Build Profile must initially be ONE unresolved decision.
Show:
“Build profile”
→ “Resolving…”
→ split/resolve into BOTH:
“Web Build”
and
“Electron · Windows x64”

 This should visually communicate:
 Pipelab figured out which outputs are needed from the selected destinations.

☐ Web Build must clearly lead to Poki.
Electron · Windows x64 must clearly lead to Steam and itch.io.
The two branches should be visually distinct enough to understand instantly.

☐ Once an object reaches its correct location, KEEP IT THERE.
Do not reposition cards simply because the video enters another phase.
If an element's meaning/relationship has not changed, it should not move.

☐ Remove the separate execution-grid and result-grid reorganizations where possible.
Execution and success should happen inside the same release map through:
progress states,
borders,
connectors,
status changes,
subtle local emphasis.

Guidance:
The viewer should learn the spatial layout once and retain that mental model for the rest of the film.

☐ 3. MAKE MOTION COMMUNICATE STATE, NOT DECORATION

Review every movement in the timeline and require a narrative reason for it.

☐ Remove remaining global camera zooms and unnecessary drifting.
Keep camera scale at approximately 1 for the entire commercial.
No “breathing” zooms between sections.

☐ Replace global movement with local emphasis:
active card scale 1 → 1.03 → 1,
border/glow,
connector drawing,
progress animation,
state label transitions.

☐ During build resolution, make this the hero motion moment:
Build Profile
→ Resolving…
→ Web Build + Electron · Windows x64.
Let the resolution land before drawing destination routes.

☐ During Ship, keep the release map stable.
Sequentially activate:
Prepare source
→ Web Build
→ Electron
→ Poki
→ Steam
→ itch.io.
Routes can illuminate as each operation runs.

☐ Fix all remaining placement/alignment problems with one authoritative geometry system.
Derive connector endpoints from actual card bounds.
Use consistent anchors, gaps, baselines and card dimensions.
Do not patch visual errors using random x/y offsets.

Guidance:
Movement should answer one of three questions:
“What changed?”
“What is active?”
“Where is this going?”
If it answers none of them, remove it.

☐ 4. REDESIGN THE AUDIO AND REMOVE THE CURRENT MUSIC

Replace the current music rather than trying to improve it incrementally.

☐ Use a restrained product-film soundtrack:
minimal electronic ambience,
subtle pulse,
very little melody,
modern and premium,
no generic AI-corporate/electronic feel.

☐ Treat sound design as more important than the song:
destination selection clicks,
subtle connector whooshes,
build-resolution rise,
clear Ship click,
restrained completion pings.

☐ Synchronize only important moments:
destination selection,
Build Profile resolution,
Ship,
successful deliveries.
Do not rhythmically sync every UI animation.

☐ Give the build resolution the strongest audio cue.
A restrained rising tone should resolve exactly when Web Build + Electron become clear.

☐ Let the final seconds become calmer.
Reduce rhythmic elements as the result appears and resolve into one warm/simple final tone under the Pipelab end card.

Guidance:
A nearly ambient track with excellent UI sound design is preferable to noticeable mediocre music.

☐ 5. SIMPLIFY SHIP, RESULTS AND THE ENDING

The final third should reuse the established release map instead of teaching another interface layout.

☐ “Ready to ship” should appear without moving all existing cards.
Emphasize the existing Ship button.
Hold briefly.
Click.

☐ Run progress directly in the established composition.
Example:
Your Game        ✓ Prepared
Web Build        Building…
Electron         Waiting
Poki             Waiting
Steam            Waiting
itch.io          Waiting

 Then advance sequentially.

☐ After execution, convert states in place into the result:
Web Build ✓
Windows x64 ✓
Poki ✓ Delivered
Steam ✓ Delivered
itch.io ✓ Delivered

 Only introduce the word “Artifacts” here if useful.
 Never insert an Artifacts block into the release route itself.

☐ Use:
“One release.”
“Every destination.”
as the result message.
Give this state a real hold because this is useful breathing time.

☐ Transition continuously into the end card.
Do not blackout.
Do not mutate result text into end text.
Let cards quietly disappear/simplify while the existing Pipelab identity remains and settles centrally.

 Final:
 Pipelab
 “Ship games, not release scripts.”

 Keep this nearly static and hold for approximately 2 seconds.

FINAL VALIDATION

Before rendering the final version, perform these tests:

Muted test:
A person unfamiliar with Pipelab must understand:

Your Game
→ choose Poki / Steam / itch.io
→ Pipelab figures out the required outputs
→ Web Build goes to Poki
→ Electron Windows build goes to Steam / itch.io
→ Ship
→ work executes
→ every destination succeeds.

Freeze-frame test:
At every key moment, there must be one obvious focal point and no element that looks accidentally misplaced.

Movement test:
For every transform in the GSAP timeline, ask:
“Why is this object moving?”
If the answer is only “because we're entering a new section”, remove the movement.

Timing test:
Remove pauses where nothing new is being communicated.
Keep pauses only when the viewer genuinely needs time to understand an important resolved state.

Audio test:
Watch once without music but with SFX.
If the commercial already feels satisfying, the soundtrack is doing the correct secondary job.

FINAL GOAL

The finished commercial should communicate one simple idea:

“I give Pipelab my game and tell it where I want to ship. Pipelab figures out the builds, creates the right outputs, and delivers them.”

Clarity over complexity.
Stable composition over constant movement.
Product story over motion-design tricks.
