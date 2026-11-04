# Deploying a wireframe (simple guide)

For the shortest AI-guided route, use the prompt in [`START-HERE.md`](START-HERE.md). You only need to provide the project name unless you want a custom ID or hostname.

The person building the wireframe can give the AI references plus ordinary design instructions, then say “put it live” or “deploy the wireframe.” Those phrases trigger the full validation, deployment and live verification workflow described in `AGENTS.md`; no technical command wording is required.

There are two kinds of setup:

- **One-time shared setup:** the D1 database, R2 bucket, database migrations, global admins, and Access service token. These are reused.
- **Per-wireframe setup:** a unique project ID, Worker name, domain, Worker sync secret, and protection for the new hostname.

The simplest mental model is: Cloudflare Access confirms a person’s email, D1 decides which wireframe that email can use, and R2 stores uploaded images.

## Create a new wireframe

Copy the starter directory, open a terminal in the copied directory, and run:

```sh
npm run project:configure -- --name "Britannia" --id britannia-wireframe --host britannia-wireframe.stagingcloud.dev
```

Use a different permanent `--id` and hostname for every project. The command keeps the existing shared database and media bucket and starts the new project with one clean registered version: `v1`. Old unregistered snapshot files are ignored and are not deployed.

Check the project before deploying:

```sh
npm run deploy:check
npm run build
```

For the first deployment of this Worker, add the remote pull secret:

```sh
npx wrangler secret put WIREFRAME_SYNC_TOKEN
```

Paste the long sync value when Wrangler asks. Then deploy:

```sh
npm run deploy
```

In Cloudflare Zero Trust, make sure the new Worker/hostname is covered by:

1. A human **Allow** policy using **One-time PIN** (clients do not need Cloudflare accounts).
2. A **Service Auth** policy containing the existing local-sync service token.

Adding a client inside the wireframe grants project permission in D1; it does not edit the separate Cloudflare Access policy.

## Upgrade change history and comment replies

This release adds an admin **Changes** view and replies within comment threads. Local preview works immediately. Before publishing the updated Worker, inspect the existing shared database once:

```sh
npx wrangler d1 execute wireframe-starter --remote --command="PRAGMA table_info(wf_comments)"
```

Use the database name already configured in `wrangler.jsonc` if it differs. If both `parent_id` and `deleted_at` are absent, apply the additive upgrade:

```sh
npx wrangler d1 execute wireframe-starter --remote --file=addons/content-editor/migrations/0003_comment_replies.sql
```

If both columns already exist, skip the upgrade. If only one exists, inspect and repair the partial upgrade before deploying; do not rerun the whole file. This is a shared database upgrade, not a per-project operation. It keeps existing content and comments and does not create or replace storage. Leave the added columns in place if rolling the application code back; do not delete review data to undo a UI change.

Then follow the normal build, deployment check, deployment and Access verification workflow. The upgrade has no effect on Cloudflare Access or account permissions.

## Set up local pulling

Copy `.env.example` to `.env.sync`. Change the URL for this wireframe. The other three values may be reused from another project if the same service token and sync token are being used. Never commit this file.

Load it and pull:

```sh
set -a
source .env.sync
set +a
npm run editor:pull
```

The pull updates only the private local `.wireframe/` working data. It does not overwrite HTML or send anything back to the live site.

## Create and deploy a revision

```sh
npm run version:new -- v2.1 "Client review"
npm run dev
```

After reviewing the new version locally:

```sh
npm run build
npm run deploy
```

Old versions remain frozen. The new version inherits saved client content when its editable field keys stay the same.

## What to tell an AI assistant

Say: “Follow `AGENTS.md` and deploy this as a new wireframe named Britannia, with project ID `britannia-wireframe` and hostname `britannia-wireframe.stagingcloud.dev`. Reuse the existing D1, R2, admins, and Access service token. Explain any action I must take in plain language and never display secrets.”
