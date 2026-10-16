---
"@pipelab/providers": patch
"@pipelab/shared": patch
---

Make local release builds and history more reliable: inspect Construct profiles from metadata without dropping valid custom profiles, wait for exports to finish preparing before downloading, and treat unmeasured artifact sizes as unknown instead of 0 B. Include useful status and screenshot details when an export stalls.
