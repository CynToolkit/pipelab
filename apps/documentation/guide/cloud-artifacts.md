# Pipelab Cloud artifacts

Pipelab Cloud stores selected Release workflow build outputs in private object
storage. Desktop and an interactive local CLI can upload artifacts from a
signed-in Pipelab account. CI uploads and CI tokens are deferred.

## Add Cloud as a Release Destination

In the Release workflow editor, add **Pipelab Cloud** under **Destinations**
and select the Build Profile outputs to upload. A produced file is uploaded
unchanged. A produced directory is zipped before upload. Uploads start after the
selected output is built and complete; the latest pin changes only after the
object has been verified in storage.

An active paid Pipelab Cloud plan is required. The Cloud Files page shows the
stored artifacts, pooled storage use, latest pins, history, and share links.
Download URLs are short-lived. The object storage key is kept on the server.

For local CLI use, sign in once with an interactive terminal:

```sh
pipelab settings cloud login
pipelab settings cloud status
pipelab settings cloud logout
```

The CLI stores this Cloud session in the operating system credential store. It
does not accept or print a CI access token. Run the upload workflow on the
machine where you signed in. CI uploads and token authentication are not
available.

## Pins, history, and quota

The latest successful upload is pinned for each project, Build Profile, and
target. The pinned artifact stays available while the account is active or in
its grace period. A new successful upload replaces that pin; the old artifact
becomes history and expires according to the account's configured retention.
Deleting a Build Profile does not remove its pinned artifact.

Pinned artifacts and history share the plan's storage allowance. An internal
four-target Electron sample produced ZIPs totaling 575,081,265 bytes and
supports a provisional Basic quota candidate of 1 GiB (1,073,741,824 bytes).
The sample has little game-specific payload, so this is not an approved Basic
limit. Measure representative large game builds and approve the recommendation
before configuring a Basic product row. Uploads are rejected when the object
and active upload reservations would exceed the allowance. Pipelab Cloud does
not silently evict artifacts or allow overage. The Basic history period is 30
days. Plan limits and retention are configured by product ID on the server; an
account without a configured plan row fails closed. Higher-tier numeric
allowances remain unset.

## Share and delete

Each artifact can have one active, immutable share link. Anyone with that link
can download the artifact. The owner can revoke the link or delete the artifact
from **Cloud files**. Share downloads use short-lived signed URLs behind the
link, and the stored share token is encrypted at rest.

If a paid period ends, new uploads and share links stop. Existing artifacts and
links remain available until 30 days after the actual paid-through date. Seven
days before that deadline, Pipelab shows an in-app notice and sends an email
with the deletion date and the option to renew or download the artifacts. At
the end of the grace period, the artifacts and links are revoked and the
objects are automatically deleted. An expired unpinned history artifact is
deleted according to its retention date.

## Transfer limits

- Files are uploaded as-is; directories are compressed into ZIP files.
- Production accepts artifacts up to 5 TiB and uses multipart upload above
  5 GiB. Local development storage supports single-part uploads up to 5 GiB.
- Upload URLs last 15 minutes. Download URLs last 60 seconds.
- Uploads require a signed-in, non-anonymous Pipelab account and an active paid
  plan.

See [Contributor architecture](/contributing/architecture) and
[`supabase/README.md`](https://github.com/CynToolkit/pipelab/blob/develop/supabase/README.md)
for service and deployment details.
