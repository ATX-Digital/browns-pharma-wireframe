# Base wireframe starter

A portable, dependency-free wireframe review system derived from the IDEA Care viewer: version selector, desktop/mobile preview, page navigation and self-contained HTML content. This starter is independent of SiDROC and contains generic pages and reusable templates.

**Using this mainly with AI?** Open [`START-HERE.md`](START-HERE.md). The intended workflow is to ask the AI to set up and deploy a new wireframe; it will request the project name, generate sensible identifiers, reuse the shared Cloudflare resources, and perform the technical checks.

The persistent bottom note is intentional: **“Wireframe, not final design. This shows the architecture, content hierarchy and feel of the site.”** It appears both in the viewer and in standalone snapshots.

## Preview

Open `index.html` in a browser, or use Node 20+:

```sh
npm run dev
```

Visit `http://127.0.0.1:4173`. No package installation is required. A different port can be supplied with `npm run dev -- 4174`.

The local server also enables the optional content editor. Select **Edit content**, then click an outlined field, image, navigation/footer list, or accordion group. Triple-click anywhere to leave a positioned comment, or use **Add comment** and click a point on the page. Trial data is stored in the git-ignored `.wireframe/` directory and can be exported with `npm run editor:export`.

The desktop preview uses a true 1280px canvas fitted to the available space. Mobile uses a responsive phone canvas, approximately 376px on a wide screen, shrinking to fit smaller devices. Toggling devices does not reload the snapshot or clear cart/form state. Pages and templates have separate navigation groups; a dropdown replaces the tabs on small screens.

“Page notes” explains each page's role, expected WordPress template and behaviour. “Share view” copies a link containing the exact version, route, device and notes state. File links work locally; use a hosted URL to share with other people.

## Project files

```text
index.html                 Review shell
project.js                 Project identity and version registry (JSON assignment)
assets/viewer.css          Review shell styling
assets/viewer.js           Review shell behaviour
versions/v1.html           Complete editable HTML snapshot: CSS, pages, JS and notes
scripts/new-version.mjs    Copies a complete snapshot and registers the new version
scripts/build.mjs          Builds deployable static files into dist/
scripts/serve.mjs          Local preview server
addons/content-editor/     Optional local + Cloudflare D1/R2 editing module
wrangler.jsonc             Cloudflare Workers static-assets configuration
```

## Start another wireframe

1. Create a separate repository from this starter's committed source files. Leave behind private/generated `.wireframe/`, `.env.sync`, `dist/`, and `.wrangler/` files. Each client copy stays independent; future starter improvements apply to new copies.
2. Configure all project identities with one command:

   ```sh
   npm run project:configure -- --name "Britannia" --id britannia-wireframe --host britannia-wireframe.stagingcloud.dev
   ```

   The ID is the project's permanent data key. It must be unique and must not change after client data exists. When the ID changes, the command starts the copied project with only `v1` registered and preserves the shared D1 and R2 bindings. Unregistered snapshot files are not built or deployed. Use `--keep-versions` only when deliberately cloning the old review history.
3. Run `npm run deploy:check` to catch missing bindings or unsafe hosting settings.
4. Edit `versions/v1.html`: replace the generic project identity, content, page inventory and reviewer notes.
5. Keep `PAGES` and `renderers` in agreement. Every page has an `id`, `label`, `kind` (`page` or `template`), `wp`, `description` and `notes`.
6. Link between pages with `href="#page-id"`. Context can be carried as `href="#detail?item=one"`.

For the complete non-developer workflow, see [`DEPLOYMENT.md`](DEPLOYMENT.md). AI assistants should follow [`AGENTS.md`](AGENTS.md), which records the architecture, reusable resources, security rules and exact deployment sequence.

Included starting pages: Home, About, Services, Contact and Site architecture. Included templates: Listing, Detail, Information page and Components. Site architecture and Components are review references, not mandatory production pages.

## New versions

```sh
npm run version:new -- v1.1 "Client feedback"
npm run version:new -- v2 "Revised architecture"
npm run version:new -- v3.2.2 "Navigation refinement"
```

Each command copies the highest existing version's **entire HTML file**, creates a new file and updates the version registry. Edit the new file after creating it. Earlier snapshots are not rebuilt, patched or overwritten. The command rejects duplicate versions and numbers that are not greater than the current latest. Numeric equivalents such as `v1` and `v1.0` cannot coexist.

When the content editor is enabled, only the latest version accepts edits. A new version inherits all saved copy from its predecessors through stable `data-wf-content` keys. Earlier versions remain readable and locked. Moving a field without changing its key keeps the content; a new key starts with its HTML fallback.

Versions sort numerically (`v10` follows `v3.2.2`). Opening the bare root URL selects the latest version automatically. A shared URL containing `version=v1` intentionally stays on that version. Page inventories and notes belong to their snapshots, so pages can be added or removed between versions. If a page is absent in a selected version, that snapshot returns to Home.

The review shell is shared across versions. All prototype content, styles, behaviour and notes are frozen inside each version HTML. If a future snapshot needs assets, give it its own version-specific asset directory and extend the build script to copy it; do not overwrite assets referenced by older snapshots.

## Build and Cloudflare hosting

```sh
npm run build
```

This refreshes only the generated `dist/` directory. It validates the manifest and registered HTML snapshots, then copies the static deliverables. It never rebuilds or edits version snapshots. There are no runtime dependencies, server functions, external fonts or external assets.

For **Cloudflare Workers with Static Assets**, the included `wrangler.jsonc` points to `dist` and automatically runs `node scripts/build.mjs` before deployment. Use `npm run deploy`; it validates the project before calling Wrangler. For **Cloudflare Pages**, use `npm run build` with `dist` as the output directory; the build supplies an advanced-mode `_worker.js` for the editor API.

To enable hosted editing on a new shared database, apply the content, access, and reply migrations (`0001`, `0002`, `0003`) once, add the `WIREFRAME_CONTENT` and `WIREFRAME_MEDIA` bindings, and protect the deployment with Cloudflare Access. Reuse the existing D1 database and R2 bucket for copied projects; do not create storage or rerun migrations per client. Exact setup commands are in [`addons/content-editor/README.md`](addons/content-editor/README.md), and existing deployments should follow the [reply upgrade instructions](DEPLOYMENT.md#upgrade-change-history-and-comment-replies). Every copied project needs a unique, permanent `editor.projectId`.

After a client review, pull the deployed values, history, comments and referenced images into the local preview before creating the next version:

```sh
WIREFRAME_REMOTE_URL=https://review.example.com \
WIREFRAME_SYNC_TOKEN=your-long-secret \
npm run editor:pull
```

The pull updates only the git-ignored `.wireframe/` review overlay and backs up existing local review data. It never edits snapshots or pushes local trial changes to production. Create the next snapshot with `npm run version:new`, make structural changes locally, then build and deploy normally. Stable editable keys inherit the client's deployed values in the new version.

Cloudflare Pages Functions and Workers Static Assets can both bind D1 and R2; this starter supports either deployment style.

The files use relative asset paths and query-string review routes, so they work at a root domain or a subdirectory without an SPA rewrite. `robots.txt`, HTML metadata and `_headers` request no indexing. They do not provide access control; configure Cloudflare Access separately if needed.

References: [Cloudflare Pages static HTML](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/) and [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/).

## WordPress handoff

This is a static architecture prototype, not a theme. Page notes map layouts to WordPress pages, archives, single templates and reusable patterns. Forms only demonstrate validation and confirmation states; they send nothing and do not store personal data. Build the eventual theme and integrations separately after the architecture is approved.
