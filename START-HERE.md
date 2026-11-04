# Start a new wireframe with AI

Keep this repository as your starter. For each client, create a separate repository from the committed source files. Do not copy `.wireframe/`, `.env.sync`, `dist/`, or `.wrangler/` into the new project; the setup can configure its private credentials separately. Improvements to this starter apply to future copies, while existing client repositories stay independent.

Open this project in an AI coding tool and send this message:

> Set up and deploy this as a new wireframe. Follow AGENTS.md, ask me for the project details you need, reuse the shared Cloudflare resources, and explain any action I must take in plain language.

The AI should first ask for the project display name. You can optionally provide a project ID and hostname; otherwise it will suggest them automatically.

For example, if you answer **Britannia**, the normal defaults are:

- Display name: `Britannia`
- Permanent project ID: `britannia-wireframe`
- Worker name: `britannia-wireframe`
- Address: `britannia-wireframe.stagingcloud.dev`
- Starting versions: `v1` only

The AI then configures the project, builds it, checks its Cloudflare bindings, and deploys it. It should reuse the existing D1 database, R2 bucket, global administrators, and Access service token.

You may still need to complete a Cloudflare login, authorize a command, or confirm that the new hostname is included in Cloudflare Access. The AI should guide those actions one at a time. Never paste a sync token, Access Client Secret, API token, or password into chat.

After deployment, the AI should report the live address, permanent project ID, deployed version, and any remaining Cloudflare Access action. It must not call the setup complete until the site is both reachable and protected.

## What the wireframe builder says

Once the prepared project has been handed to the person building it, they can use normal language. For example:

> Build the wireframe from these screenshots and this website. Follow these additional instructions: …

The AI should inspect the references, build the latest snapshot, make suitable client content editable, preserve the viewer and comments, and test the result. The builder does not need to mention HTML, editable keys, versions, D1, R2, or commands.

When it is approved for release, they can say any clear equivalent of:

> Put it live.

> Deploy the wireframe.

> Make this live.

The AI should then build, validate, deploy, and verify the live protected address. It should ask the builder to intervene only if Cloudflare needs a login, command approval, or secure credential entry.
