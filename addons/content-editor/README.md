# Optional content editor add-on

This optional add-on lets invited reviewers edit allowed content and leave positioned comments on the latest wireframe snapshot. Older snapshots remain read-only, while a new version inherits saved content from earlier versions until a field is overridden.

It includes editable text and button labels, searchable internal link destinations, custom URLs, navigation/footer link lists, global-versus-card-only content, repeatable accordions, form labels, image uploads, comment threads, and a page-wide comment list.

## Changes and replies

Administrators can select **Changes** in the review toolbar to see who changed what and when, across all registered versions. Filter by version or by content/conversations, expand an entry for full before-and-after text, link destinations and order, accordion answers, or image previews. **Load older changes** continues through the entire history; **Refresh** fetches new changes. Login and page-visit activity is not recorded here. Existing saved content history and surviving comments appear automatically; comments permanently deleted before this upgrade cannot be recovered.

Use **Reply** beneath a comment or reply. Every reply is indented only once, with a “Replying to…” label identifying its parent. Opening a thread refreshes its comments; **Refresh comments** checks again without discarding your draft. Archived versions allow reading conversations but remain read-only. No email is sent.

Only a comment's author may delete it. Deletion leaves a placeholder and preserves replies. The original body and deletion time remain available to administrators in Changes and in the private sync export. Local pulls preserve reply relationships, deletion markers, and historical images.

Existing deployments need the one-time `0003_comment_replies.sql` upgrade on their shared D1 database **before** deploying this code. See [the deployment guide](../../DEPLOYMENT.md#upgrade-change-history-and-comment-replies). Do not apply it again for each copied project.

Run `npm run test:review` with Node 22.13 or newer to test both the Worker against an isolated SQLite database and the local API against temporary files. This does not contact Cloudflare or change project review data.

## Local trial

Run the normal preview server:

```sh
npm run dev
```

Open `http://127.0.0.1:4173`, select **Edit content**, and click any outlined field. Buttons and links are paused while edit mode is active. Local edits, comments, and trial images are stored in `.wireframe/`, which is intentionally ignored by Git.

To comment, triple-click anywhere in the wireframe, or select **Add comment** and click the exact position. Pins use a page region plus normalized X/Y coordinates, so their placement scales when the reviewer switches between desktop and mobile.

Export the local trial before deleting it:

```sh
npm run editor:export
```

The export is written to `exports/<project-id>-content.json` and includes values, change history, and comments.

## Pull a deployed review locally

The remote-to-local sync is intentionally one-way. It downloads a deployed project's content values, history, comments and referenced images into `.wireframe/` so the local preview matches the client's review. It does not edit version snapshots, upload local trial data or modify the server.

Configure a separate secret of at least 32 characters on the deployed Worker:

```sh
npx wrangler secret put WIREFRAME_SYNC_TOKEN
```

For Cloudflare Pages, add `WIREFRAME_SYNC_TOKEN` as an encrypted production environment variable in the project settings. Use the same value only in the shell where the pull runs; do not commit it.

Then pull before creating the next version:

```sh
WIREFRAME_REMOTE_URL=https://review.example.com \
WIREFRAME_SYNC_TOKEN=the-same-long-secret \
npm run editor:pull
```

The URL can instead be passed as an argument:

```sh
WIREFRAME_SYNC_TOKEN=the-same-long-secret \
npm run editor:pull -- https://review.example.com
```

If Cloudflare Access protects the hostname, create an Access service token allowed by the application's policy and provide it during the pull:

```sh
WIREFRAME_REMOTE_URL=https://review.example.com \
WIREFRAME_SYNC_TOKEN=the-same-long-secret \
WIREFRAME_ACCESS_CLIENT_ID=service-token-id \
WIREFRAME_ACCESS_CLIENT_SECRET=service-token-secret \
npm run editor:pull
```

Each pull saves the raw server export to `.wireframe/last-remote-export.json`. If local editor data already exists, it is first copied to `.wireframe/backups/`. Only records for this project's `editor.projectId` are replaced; other project records are preserved.

Recommended revision cycle:

1. Let the client edit and comment on the latest deployed version.
2. Run `npm run editor:pull` to reproduce that state locally.
3. Run `npm run version:new -- v1.2 "Client review"`.
4. Add pages or change layouts in the new snapshot while retaining stable editable keys.
5. Preview locally, build and deploy.

The deployed D1 database remains the production source of content. After deployment, the new version inherits earlier values through stable keys. Pulled local data is a working copy for previewing and implementing feedback, not a replacement for D1.

## Marking editable text

Only allow-listed elements are editable:

```html
<h1 data-wf-content="home.hero.heading" data-wf-label="Home hero heading" data-wf-maxlength="120">Fallback heading</h1>
```

Use stable keys when moving a field in a later layout version. A new key starts with its HTML fallback. Removing a field from the HTML hides it without deleting its historical value.

Editable CTA links use a paired `.label` and `.url` key. The provided `editableLink(...)` helper renders both fields and the editor saves them together. Link destinations accept internal `/paths`, `#prototype-routes`, `https://`, `mailto:` and `tel:` values; unsafe script URLs are rejected by the local and D1 APIs.

The starter also contains examples for:

- `data-wf-global` plus `data-wf-local` to ask whether a service change applies everywhere or only on one card.
- `data-wf-collection="..."` with `links` or `accordions` for repeatable items.
- `data-wf-image="..."` for an R2-backed editable image.

All keys must be present in the snapshot's `EDITABLE_FIELDS` allow-list. Internal keys are stable IDs and stay hidden from clients.

## Create and connect Cloudflare D1

Install Wrangler for this project when you are ready to deploy:

```sh
npm install --save-dev wrangler
npx wrangler login
npx wrangler d1 create wireframe-content
npx wrangler r2 bucket create wireframe-media
```

Cloudflare prints a `database_id`. Add the following top-level property to `wrangler.jsonc`:

```jsonc
"d1_databases": [
  {
    "binding": "WIREFRAME_CONTENT",
    "database_name": "wireframe-content",
    "database_id": "PASTE_THE_DATABASE_ID_HERE"
  }
]
```

Apply the schema remotely:

```sh
npx wrangler d1 execute wireframe-content --remote --file=addons/content-editor/migrations/0001_content.sql
npx wrangler d1 execute wireframe-content --remote --file=addons/content-editor/migrations/0002_access.sql
npx wrangler d1 execute wireframe-content --remote --file=addons/content-editor/migrations/0003_comment_replies.sql
```

Add the R2 binding as another top-level property when deploying with Workers Static Assets:

```jsonc
"r2_buckets": [
  {
    "binding": "WIREFRAME_MEDIA",
    "bucket_name": "wireframe-media"
  }
]
```

Then build and deploy:

```sh
npm run build
npx wrangler deploy
```

The same D1 database and R2 bucket can be bound to every wireframe deployment. Each copied starter must have a unique `editor.projectId` in `project.js`; records and object keys are separated by that ID.

## Deploy as a Cloudflare Pages project

This is an alternative setup for other installations. **Browns uses the Worker deployment in `DEPLOYMENT.md`; do not publish this repository as a static Pages site.** A source-directory upload without the built `_worker.js` bypasses the application entirely and cannot provide editing or authorization.

The build writes `dist/_worker.js`, using Pages Functions advanced mode, alongside the static files.

1. Create or open the Pages project and use `npm run build` as the build command and `dist` as the output directory.
2. In **Settings → Bindings**, add a D1 binding named `WIREFRAME_CONTENT` and select the database created above.
3. Add an R2 binding named `WIREFRAME_MEDIA` and select `wireframe-media`.
4. Configure Cloudflare Access for the Pages hostname, then redeploy so the bindings are available.

For a CLI deployment, build first and then run `npx wrangler pages deploy dist --project-name YOUR_PROJECT_NAME`. Dashboard bindings remain the least error-prone option because preview and production bindings can be selected separately.

## Authentication

Cloudflare Access authenticates the email address; the shared D1 database then authorizes that email as either a global administrator or a client of this specific wireframe. All HTML snapshots, content, comments and media are denied when the authenticated email has no matching access record.

Configure `WIREFRAME_ACCESS_TEAM_DOMAIN` (for example `your-team.cloudflareaccess.com`) and `WIREFRAME_ACCESS_AUD` (the application's Audience tag) on the Worker. These public identifiers let it verify Access tokens against the team's signing keys, expected issuer, audience and expiry. It does not trust an email header on its own. Missing configuration or storage fails closed. Sync uses its separate secret and the Access Service Auth policy.

For a brand-new shared database with no administrators, a temporary Worker environment variable named `WIREFRAME_BOOTSTRAP_ADMINS` can contain the first administrator email. Browns already has shared D1 administrators and does not need this variable. Multiple bootstrap addresses may be comma-separated; these accounts cannot be removed in the UI. Remove the variable after creating the intended D1 administrators.

After applying `0002_access.sql`, adding the environment variable and redeploying, sign in with a bootstrap administrator. The **Manage access** button lists all global administrators and the clients assigned to the current `editor.projectId`. Administrators added in the UI are stored in D1 and are available across all wireframes using that database. Clients are stored against only the current project ID.

If Cloudflare Access is configured with an exact email allow-list, adding an account in the wireframe does not automatically update that separate Access policy. Either update both lists, or configure Access to authenticate the intended pool of users and let the D1 access records provide project authorization. Protect every production hostname, including the default Pages hostname if it remains enabled.

Do not add an unauthenticated production bypass. Local development is handled by `scripts/serve.mjs` and does not weaken the deployed Worker.

## Images

Images are stored under `<project-id>/<version>/<uuid>` in R2 and are never overwritten, so archived versions keep their original assets. JPEG, PNG, WebP, and GIF files up to 5 MB are accepted. Alternative text is stored in the versioned content record. Local preview uses `.wireframe/media/` instead of R2.
