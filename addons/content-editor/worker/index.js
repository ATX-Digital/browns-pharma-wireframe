const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {'content-type':'application/json; charset=utf-8', 'cache-control':'no-store'}
});

const validId = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(value);
const normalizeEmail = value => String(value || '').trim().toLowerCase();
const validEmail = value => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validLink = value => value === '' || /^(?:#[a-zA-Z0-9][^\s]*|\/[^\s]*|https?:\/\/[^\s]+|mailto:[^\s]+|tel:[+0-9(). -]+)$/.test(value);
const validCollection = change => {
  if (!change.key.endsWith('.items') && !change.key.endsWith('.accordions')) return true;
  try {
    const items = JSON.parse(change.value);
    if (!Array.isArray(items) || items.length > 30) return false;
    return change.key.endsWith('.items')
      ? items.every(item => item && typeof item.label === 'string' && item.label.length <= 200 && typeof item.url === 'string' && validLink(item.url))
      : items.every(item => item && typeof item.question === 'string' && item.question.length <= 300 && typeof item.answer === 'string' && item.answer.length <= 3000);
  } catch { return false; }
};
const editableFields = source => [...source.matchAll(/const EDITABLE(?:_[A-Z]+)?_FIELDS=(\[[^;]+\]);/g)].flatMap(match => JSON.parse(match[1]));

async function validSyncToken(request, env) {
  const expected = typeof env.WIREFRAME_SYNC_TOKEN === 'string' ? env.WIREFRAME_SYNC_TOKEN : '';
  const authorization = request.headers.get('authorization') || '';
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (expected.length < 32 || supplied.length !== expected.length) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
    crypto.subtle.digest('SHA-256', encoder.encode(supplied))
  ]);
  const a = new Uint8Array(left), b = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

function compareVersions(a, b) {
  const left = a.replace(/^v/, '').split('.').map(Number);
  const right = b.replace(/^v/, '').split('.').map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] || 0) - (right[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

async function manifest(request, env) {
  const response = await env.ASSETS.fetch(new URL('/project.js', request.url));
  if (!response.ok) throw new Error('Project manifest is unavailable.');
  const source = await response.text();
  const match = source.match(/^window\.WIREFRAME_PROJECT\s*=\s*([\s\S]*?);?\s*$/);
  if (!match) throw new Error('Project manifest is invalid.');
  return JSON.parse(match[1].replace(/;\s*$/, ''));
}

async function identity(request, context) {
  if (context.access) {
    const found = await context.access.getIdentity();
    if (found?.email) return normalizeEmail(found.email);
  }
  return normalizeEmail(request.headers.get('cf-access-authenticated-user-email'));
}

function bootstrapAdmins(env) {
  return new Set(String(env.WIREFRAME_BOOTSTRAP_ADMINS || '').split(',').map(normalizeEmail).filter(validEmail));
}

async function accessFor(database, env, projectId, email) {
  if (!email) return {authorized:false, role:null, bootstrap:false};
  const bootstrap = bootstrapAdmins(env).has(email);
  if (bootstrap) return {authorized:true, role:'admin', bootstrap:true};
  const admin = await database.prepare('SELECT email FROM wf_admins WHERE email = ? COLLATE NOCASE').bind(email).first();
  if (admin) return {authorized:true, role:'admin', bootstrap:false};
  const member = await database.prepare('SELECT email FROM wf_project_members WHERE project_id = ? AND email = ? COLLATE NOCASE').bind(projectId, email).first();
  return {authorized:Boolean(member), role:member ? 'client' : null, bootstrap:false};
}

function forbiddenPage(email, projectName) {
  const address = email ? `<strong>${email.replace(/[&<>"']/g, '')}</strong>` : 'this account';
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex,nofollow"><title>Access required</title><style>body{margin:0;background:#f3f4ef;color:#252724;font:15px/1.55 Arial,sans-serif;display:grid;min-height:100vh;place-items:center}.card{width:min(520px,calc(100% - 40px));background:white;border:1px solid #d8dbd1;padding:34px;box-shadow:0 18px 60px #20251c18}h1{font-size:26px;margin:0 0 12px}p{color:#62675e;margin:8px 0}strong{color:#252724}</style><main class="card"><h1>Access not granted</h1><p>${address} is authenticated, but does not have access to <strong>${String(projectName || 'this wireframe').replace(/[&<>"']/g, '')}</strong>.</p><p>Ask a wireframe administrator to add this email to the project.</p></main></html>`, {status:403, headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
}

async function accountApi(request, env, user, access, projectId) {
  if (access.role !== 'admin') return json({error:'Administrator access is required.'}, 403);
  if (request.method === 'GET') {
    const [storedAdmins, clients] = await env.WIREFRAME_CONTENT.batch([
      env.WIREFRAME_CONTENT.prepare('SELECT email, created_by, created_at FROM wf_admins ORDER BY email'),
      env.WIREFRAME_CONTENT.prepare('SELECT email, created_by, created_at FROM wf_project_members WHERE project_id = ? ORDER BY email').bind(projectId)
    ]);
    const configured = [...bootstrapAdmins(env)].map(email => ({email, source:'environment', removable:false, created_by:'Environment configuration', created_at:null}));
    const configuredEmails = new Set(configured.map(item => item.email));
    const admins = configured.concat((storedAdmins.results || []).filter(item => !configuredEmails.has(normalizeEmail(item.email))).map(item => ({...item, email:normalizeEmail(item.email), source:'database', removable:normalizeEmail(item.email) !== user})));
    return json({projectId, currentUser:user, admins, clients:(clients.results || []).map(item => ({...item, email:normalizeEmail(item.email), removable:normalizeEmail(item.email) !== user}))});
  }

  const body = await request.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const role = body?.role;
  if (!validEmail(email) || !['admin','client'].includes(role)) return json({error:'Enter a valid email address and account type.'}, 400);

  if (request.method === 'POST') {
    const now = new Date().toISOString();
    if (role === 'admin') {
      await env.WIREFRAME_CONTENT.batch([
        env.WIREFRAME_CONTENT.prepare('INSERT INTO wf_admins(email, created_by, created_at) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING').bind(email, user, now),
        env.WIREFRAME_CONTENT.prepare('DELETE FROM wf_project_members WHERE project_id = ? AND email = ? COLLATE NOCASE').bind(projectId, email)
      ]);
    } else {
      if (bootstrapAdmins(env).has(email) || await env.WIREFRAME_CONTENT.prepare('SELECT email FROM wf_admins WHERE email = ? COLLATE NOCASE').bind(email).first()) return json({error:'This email is already a global administrator.'}, 409);
      await env.WIREFRAME_CONTENT.prepare('INSERT INTO wf_project_members(project_id, email, created_by, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(project_id, email) DO NOTHING').bind(projectId, email, user, now).run();
    }
    return json({saved:true, email, role}, 201);
  }

  if (request.method === 'DELETE') {
    if (role === 'admin') {
      if (bootstrapAdmins(env).has(email)) return json({error:'This administrator is configured by WIREFRAME_BOOTSTRAP_ADMINS. Remove it from the environment variable instead.'}, 409);
      if (email === user) return json({error:'You cannot remove your own administrator account.'}, 409);
      await env.WIREFRAME_CONTENT.prepare('DELETE FROM wf_admins WHERE email = ? COLLATE NOCASE').bind(email).run();
    } else {
      await env.WIREFRAME_CONTENT.prepare('DELETE FROM wf_project_members WHERE project_id = ? AND email = ? COLLATE NOCASE').bind(projectId, email).run();
    }
    return json({deleted:true, email, role});
  }

  return json({error:'Method not allowed.'}, 405);
}

async function resolvedContent(database, projectId, orderedVersions, targetVersion) {
  const end = orderedVersions.indexOf(targetVersion);
  const chain = orderedVersions.slice(0, end + 1);
  if (!chain.length) return {};
  const placeholders = chain.map(() => '?').join(',');
  const result = await database.prepare(
    `SELECT version_id, content_key, value FROM wf_content_values WHERE project_id = ? AND version_id IN (${placeholders})`
  ).bind(projectId, ...chain).all();
  const order = new Map(chain.map((version, index) => [version, index]));
  const rows = (result.results || []).sort((a, b) => order.get(a.version_id) - order.get(b.version_id));
  return Object.fromEntries(rows.map(row => [row.content_key, row.value]));
}

async function validateField(request, env, project, version, key) {
  const file = project.versions.find(item => item.id === version)?.file;
  if (!file) return false;
  const response = await env.ASSETS.fetch(new URL(`/${file.replace(/^\//, '')}`, request.url));
  if (!response.ok) return false;
  return editableFields(await response.text()).includes(key);
}

async function api(request, env, context) {
  if (!env.WIREFRAME_CONTENT) return json({error:'D1 is not connected yet. Follow addons/content-editor/README.md.'}, 503);
  const project = await manifest(request, env);
  const configuredProjectId = project.editor?.projectId || project.slug;
  const url = new URL(request.url);
  const endpoint = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
  const versions = project.versions.map(item => item.id).sort(compareVersions);
  const latest = versions.at(-1);

  if (endpoint === '/api/editor/sync/export' && request.method === 'GET') {
    if (!env.WIREFRAME_SYNC_TOKEN) return json({error:'Server-to-local sync is not configured.'}, 503);
    if (!await validSyncToken(request, env)) return json({error:'Invalid sync credentials.'}, 401);
    const [values, history, comments] = await env.WIREFRAME_CONTENT.batch([
      env.WIREFRAME_CONTENT.prepare('SELECT version_id, content_key, value, revision, updated_by, updated_at FROM wf_content_values WHERE project_id = ? ORDER BY version_id, content_key').bind(configuredProjectId),
      env.WIREFRAME_CONTENT.prepare('SELECT id, version_id, content_key, old_value, new_value, changed_by, changed_at FROM wf_content_history WHERE project_id = ? ORDER BY id').bind(configuredProjectId),
      env.WIREFRAME_CONTENT.prepare('SELECT id, version_id, route, target_key, body, changed_by, changed_at, parent_id, deleted_at FROM wf_comments WHERE project_id = ? ORDER BY id').bind(configuredProjectId)
    ]);
    return json({
      schemaVersion:1,
      exportedAt:new Date().toISOString(),
      project:{id:configuredProjectId, name:project.name, versions:project.versions},
      values:values.results || [],
      history:history.results || [],
      comments:comments.results || []
    });
  }

  const syncMediaRequest = endpoint.startsWith('/api/editor/media/') && request.method === 'GET' && await validSyncToken(request, env);
  const user = syncMediaRequest ? '' : await identity(request, context);
  const access = syncMediaRequest
    ? {authorized:true, role:'sync', bootstrap:false}
    : (project.editor?.accessControl === false
      ? {authorized:Boolean(user), role:user ? 'client' : null, bootstrap:false}
      : await accessFor(env.WIREFRAME_CONTENT, env, configuredProjectId, user));
  if (!syncMediaRequest && !user) return json({error:'Authentication is required.'}, 401);
  if (!access.authorized) return json({error:'This account does not have access to this wireframe.'}, 403);

  if (endpoint === '/api/editor/accounts') return accountApi(request, env, user, access, configuredProjectId);

  if (endpoint === '/api/editor/activity' && request.method === 'GET') {
    if (access.role !== 'admin') return json({error:'Administrator access is required.'}, 403);
    const version = url.searchParams.get('version') || '';
    const kind = url.searchParams.get('kind') || '';
    let cursor = null;
    try { cursor = JSON.parse(url.searchParams.get('before') || 'null'); } catch { return json({error:'Invalid activity cursor.'}, 400); }
    if ((version && !versions.includes(version)) || !['', 'content', 'comments'].includes(kind) ||
      (cursor !== null && (!Array.isArray(cursor) || cursor.length !== 2 || typeof cursor[0] !== 'string' || !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(cursor[0]) || !/^[hcd]:\d+$/.test(cursor[1])))) return json({error:'Invalid activity request.'}, 400);
    const placeholders = versions.map(() => '?').join(',');
    const result = await env.WIREFRAME_CONTENT.prepare(`
      SELECT * FROM (
        SELECT 'h:' || id AS event_id, version_id, content_key AS target_key, '' AS route,
          'content' AS kind, old_value, new_value, changed_by, changed_at, NULL AS parent_id
          FROM wf_content_history WHERE project_id = ?
        UNION ALL
        SELECT 'c:' || id, version_id, target_key, route,
          CASE WHEN parent_id IS NULL THEN 'comment' ELSE 'reply' END, '', body, changed_by, changed_at, parent_id
          FROM wf_comments WHERE project_id = ?
        UNION ALL
        SELECT 'd:' || id, version_id, target_key, route, 'deleted', body, '', changed_by, deleted_at, parent_id
          FROM wf_comments WHERE project_id = ? AND deleted_at IS NOT NULL
      ) WHERE version_id IN (${placeholders}) AND (? = '' OR version_id = ?)
        AND (? = '' OR (? = 'content' AND kind = 'content') OR (? = 'comments' AND kind != 'content'))
        AND (? IS NULL OR changed_at < ? OR (changed_at = ? AND event_id < ?))
      ORDER BY changed_at DESC, event_id DESC LIMIT 51
    `).bind(configuredProjectId, configuredProjectId, configuredProjectId, ...versions, version, version,
      kind, kind, kind, cursor?.[0] ?? null, cursor?.[0] ?? null, cursor?.[0] ?? null, cursor?.[1] ?? null).all();
    const entries = (result.results || []).slice(0, 50);
    const last = entries.at(-1);
    return json({entries, nextCursor:result.results?.length > 50 ? JSON.stringify([last.changed_at, last.event_id]) : null});
  }

  if (endpoint.startsWith('/api/editor/media/') && request.method === 'GET') {
    if (!env.WIREFRAME_MEDIA) return json({error:'R2 is not connected.'}, 503);
    const parts = endpoint.slice('/api/editor/media/'.length).split('/');
    if (parts.length !== 2 || !versions.includes(parts[0]) || !/^[a-f0-9-]+\.(?:jpg|png|webp|gif)$/.test(parts[1])) return json({error:'Image not found.'}, 404);
    const object = await env.WIREFRAME_MEDIA.get(`${configuredProjectId}/${parts[0]}/${parts[1]}`);
    if (!object) return json({error:'Image not found.'}, 404);
    return new Response(object.body, {headers:{'content-type':object.httpMetadata?.contentType || 'application/octet-stream','cache-control':'public, max-age=31536000, immutable'}});
  }

  if (endpoint === '/api/editor/content' && request.method === 'GET') {
    const version = url.searchParams.get('version');
    if (!versions.includes(version)) return json({error:'Unknown wireframe version.'}, 404);
    const comments = await env.WIREFRAME_CONTENT.prepare("SELECT id, route, target_key, CASE WHEN deleted_at IS NULL THEN body ELSE '' END AS body, changed_by, changed_at, parent_id, deleted_at FROM wf_comments WHERE project_id = ? AND version_id = ? ORDER BY id").bind(configuredProjectId, version).all();
    return json({
      project: configuredProjectId,
      version,
      latest,
      editable: Boolean(user) && version === latest,
      user: user || null,
      role: access.role,
      content: await resolvedContent(env.WIREFRAME_CONTENT, configuredProjectId, versions, version),
      comments:comments.results || []
    });
  }

  if (endpoint === '/api/editor/comments' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (body?.version !== latest || !validId(body?.key) || typeof body?.body !== 'string' || !body.body.trim() || body.body.length > 1500) return json({error:'Invalid comment.'}, 400);
    let parent = null;
    if (body.parentId != null) {
      if (!Number.isSafeInteger(body.parentId) || body.parentId < 1) return json({error:'Invalid reply.'}, 400);
      parent = await env.WIREFRAME_CONTENT.prepare('SELECT id, route, target_key FROM wf_comments WHERE id = ? AND project_id = ? AND version_id = ?').bind(body.parentId, configuredProjectId, latest).first();
      if (!parent) return json({error:'The comment you are replying to was not found.'}, 404);
    }
    const route = parent?.route ?? String(body.route || 'home').slice(0,300);
    const key = parent?.target_key ?? body.key;
    const changedAt = new Date().toISOString();
    const result = await env.WIREFRAME_CONTENT.prepare('INSERT INTO wf_comments(project_id, version_id, route, target_key, body, changed_by, changed_at, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id').bind(configuredProjectId, latest, route, key, body.body.trim(), user, changedAt, parent?.id ?? null).first();
    return json({comment:{id:result?.id, route, target_key:key, body:body.body.trim(), changed_by:user, changed_at:changedAt, parent_id:parent?.id ?? null, deleted_at:null}}, 201);
  }

  const commentDelete = endpoint.match(/^\/api\/editor\/comments\/(\d+)$/);
  if (commentDelete && request.method === 'DELETE') {
    const id = Number(commentDelete[1]);
    const comment = await env.WIREFRAME_CONTENT.prepare('SELECT id, changed_by, deleted_at FROM wf_comments WHERE id = ? AND project_id = ? AND version_id = ?').bind(id, configuredProjectId, latest).first();
    if (!comment) return json({error:'Comment not found.'}, 404);
    if (comment.changed_by !== user) return json({error:'Only the comment author can delete it.'}, 403);
    const deletedAt = comment.deleted_at || new Date().toISOString();
    await env.WIREFRAME_CONTENT.prepare('UPDATE wf_comments SET deleted_at = ? WHERE id = ? AND project_id = ? AND version_id = ? AND changed_by = ? AND deleted_at IS NULL').bind(deletedAt, id, configuredProjectId, latest, user).run();
    return json({deleted:true, id, deletedAt});
  }

  if (endpoint === '/api/editor/media' && request.method === 'POST') {
    if (!env.WIREFRAME_MEDIA) return json({error:'R2 is not connected.'}, 503);
    const body = await request.json().catch(() => null);
    const extensions = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};
    if (body?.version !== latest) return json({error:'This preview is no longer the latest editable version. Reload it and try again.'}, 409);
    if (!validId(body?.key) || !extensions[body?.type] || typeof body?.data !== 'string') return json({error:'Invalid image upload. Reload the preview and try again.'}, 400);
    if (!await validateField(request, env, project, latest, body.key)) return json({error:'This image is not editable.'}, 403);
    const binary = Uint8Array.from(atob(body.data), character => character.charCodeAt(0));
    if (!binary.length || binary.length > 5 * 1024 * 1024) return json({error:'Images must be 5 MB or smaller.'}, 413);
    const id = `${crypto.randomUUID()}.${extensions[body.type]}`;
    await env.WIREFRAME_MEDIA.put(`${configuredProjectId}/${latest}/${id}`, binary, {httpMetadata:{contentType:body.type}});
    const value = JSON.stringify({src:`/api/editor/media/${latest}/${id}`,alt:String(body.alt || '').slice(0,300),name:String(body.name || 'image').slice(0,200)});
    const current = await resolvedContent(env.WIREFRAME_CONTENT, configuredProjectId, versions, latest);
    const oldValue = current[body.key] || '';
    const changedAt = new Date().toISOString();
    await env.WIREFRAME_CONTENT.batch([
      env.WIREFRAME_CONTENT.prepare('INSERT INTO wf_content_history(project_id, version_id, content_key, old_value, new_value, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(configuredProjectId, latest, body.key, oldValue, value, user, changedAt),
      env.WIREFRAME_CONTENT.prepare('INSERT INTO wf_content_values(project_id, version_id, content_key, value, revision, updated_by, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?) ON CONFLICT(project_id, version_id, content_key) DO UPDATE SET value=excluded.value, revision=revision+1, updated_by=excluded.updated_by, updated_at=excluded.updated_at').bind(configuredProjectId, latest, body.key, value, user, changedAt)
    ]);
    return json({value}, 201);
  }

  if (endpoint === '/api/editor/history' && request.method === 'GET') {
    const version = url.searchParams.get('version');
    const key = url.searchParams.get('key');
    if (!versions.includes(version) || !validId(key)) return json({error:'Invalid history request.'}, 400);
    const result = await env.WIREFRAME_CONTENT.prepare(
      'SELECT id, old_value, new_value, changed_by, changed_at FROM wf_content_history WHERE project_id = ? AND version_id = ? AND content_key = ? ORDER BY id DESC LIMIT 50'
    ).bind(configuredProjectId, version, key).all();
    return json({history:result.results || []});
  }

  if (endpoint === '/api/editor/content' && request.method === 'PUT') {
    const body = await request.json().catch(() => null);
    const version = body?.version;
    if (version !== latest) return json({error:'Only the latest wireframe version can be edited.'}, 409);
    const changes = (Array.isArray(body?.changes) ? body.changes : [body]).map(change => ({
      key:change?.key,
      value:typeof change?.value === 'string' ? change.value.replace(/\r\n/g, '\n') : null,
      baseValue:change?.baseValue
    }));
    if (!changes.length || changes.length > 10 || changes.some(change => !validId(change.key) || change.value === null || change.value.length > 5000)) return json({error:'Invalid content field.'}, 400);
    if (changes.some(change => change.key.endsWith('.url') && !validLink(change.value))) return json({error:'Use an internal path, #page, https://, mailto: or tel: link.'}, 400);
    if (changes.some(change => !validCollection(change))) return json({error:'A navigation, footer or accordion item is invalid.'}, 400);
    for (const change of changes) if (!await validateField(request, env, project, version, change.key)) return json({error:'This field is not editable in the selected snapshot.'}, 403);
    const currentContent = await resolvedContent(env.WIREFRAME_CONTENT, configuredProjectId, versions, version);
    for (const change of changes) {
      change.oldValue = Object.hasOwn(currentContent, change.key) ? currentContent[change.key] : String(change.baseValue ?? '');
      if (typeof change.baseValue === 'string' && change.oldValue !== change.baseValue) return json({error:'This content changed while you were editing it.', currentValue:change.oldValue}, 409);
    }
    const changed = changes.filter(change => change.oldValue !== change.value);
    if (!changed.length) return json({unchanged:true});
    const now = new Date().toISOString();
    const statements = [];
    for (const change of changed) statements.push(
      env.WIREFRAME_CONTENT.prepare(
        'INSERT INTO wf_content_history(project_id, version_id, content_key, old_value, new_value, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(configuredProjectId, version, change.key, change.oldValue, change.value, user, now),
      env.WIREFRAME_CONTENT.prepare(
        'INSERT INTO wf_content_values(project_id, version_id, content_key, value, revision, updated_by, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?) ON CONFLICT(project_id, version_id, content_key) DO UPDATE SET value = excluded.value, revision = revision + 1, updated_by = excluded.updated_by, updated_at = excluded.updated_at'
      ).bind(configuredProjectId, version, change.key, change.value, user, now)
    );
    await env.WIREFRAME_CONTENT.batch(statements);
    return json({values:Object.fromEntries(changed.map(change => [change.key, change.value])), changedBy:user, changedAt:now});
  }

  return json({error:'Editor endpoint not found.'}, 404);
}

export default {
  async fetch(request, env, context) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/editor/')) return await api(request, env, context);
      if (env.WIREFRAME_CONTENT && /^(?:\/|\/index\.html|\/project\.js|\/versions\/[^/]+\.html)$/.test(url.pathname)) {
        const project = await manifest(request, env);
        if (project.editor?.enabled && project.editor?.accessControl !== false) {
          const user = await identity(request, context);
          const projectId = project.editor?.projectId || project.slug;
          const access = await accessFor(env.WIREFRAME_CONTENT, env, projectId, user);
          if (!access.authorized) return forbiddenPage(user, project.name);
        }
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      return json({error:error instanceof Error ? error.message : 'Unexpected editor error.'}, 500);
    }
  }
};
