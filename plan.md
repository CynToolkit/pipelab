* [x] **Fix resolver-generated Build Profiles:** `resolveReleaseDefaults()` must create the full target list for the selected engine/type, enabling only preferred targets. Use a normal opaque `nanoid()` ID, not `release-build-*`. Add a regression test against the actual resolver output, not just `createBuildProfile()`.
* [x] **Complete exact provider validation paths:** update real provider validators so field errors map to UI fields instead of only cards. Cover at least Construct source path, Godot source path, Steam account/App ID/depot, and filesystem destination paths. Preserve planner index normalization for target/slot IDs.
* [x] **Make producer inspection self-sufficient for Godot:** `release:producer:inspect` must return Godot target preset options/values/issues without relying on source inspection state. Pass whatever source context is needed generically, and add an integration test proving Build Settings receives preset options.
* [x] **Finish preference → fallback behavior:** if the preferred engine exists but is planner-incompatible/unusable, try the central deterministic fallback for the same build type before leaving the destination unresolved. Never fall back to catalog order. Add a test for “preferred engine exists but is incompatible”.
* [x] **Keep the already-correct behavior unchanged:** preserve planner-authoritative “Create compatible build”, compact cards, CLI-first tests, Electron test restrictions, source-direct routing, no duplicate builds, and fresh connection reload behavior.
* [x] **Verify the real paths:** add focused resolver/provider/Godot integration regressions for the fixes above, then run shared/UI/CLI tests and full CI. Do not mark this complete based only on helper-unit tests.
* [x] Steam validation uses the deployment name instead of an opaque slot ID.
* [x] Ship button should be disabled when the release cannot run.
* [x] Needs attention buttons should be orange and consistently styled
* [x] Needs attention is available directly on deployment cards.
* [x] Steam validation uses the deployment name instead of a numeric slot label.
