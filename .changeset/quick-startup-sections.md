---
"@pipelab/ui": patch
---

Show navigation immediately while the agent connects, load screen data concurrently with local loading and retry states, and check subscriptions in the background.
Show a themed wordmark while interface files download, mount persistent navigation before the current screen loads, and defer closed dialogs. Load fonts without delaying the first paint and expose subscription lookup errors with a retry action.
Allow config requests to recover after an unavailable first attempt, preserve concurrent request deduplication, and offer retry when reconnecting an open workflow fails without discarding its unsaved draft.
