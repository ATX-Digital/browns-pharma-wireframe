import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {compareVersions, readProject} from '../../scripts/project.mjs';

const json = (response, status, data) => {
  response.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'});
  response.end(JSON.stringify(data));
};

const validKey = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(value);
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

async function readStore(storeFile) {
  try {
    return JSON.parse(await readFile(storeFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return {values:{}, history:[], comments:[], nextHistoryId:1, nextCommentId:1};
  }
}

async function writeStore(storeFile, data) {
  await mkdir(path.dirname(storeFile), {recursive:true});
  const temporary = `${storeFile}.tmp`;
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, {mode:0o600});
  await rename(temporary, storeFile);
}

function resolveContent(store, projectId, versions, targetVersion) {
  const content = {};
  for (const version of versions.slice(0, versions.indexOf(targetVersion) + 1)) {
    const entries = store.values[projectId]?.[version] || {};
    for (const [key, record] of Object.entries(entries)) content[key] = record.value;
  }
  return content;
}

async function body(request, maximum = 65536) {
  let source = '';
  for await (const chunk of request) {
    source += chunk;
    if (source.length > maximum) throw new Error('Request body is too large.');
  }
  return JSON.parse(source || '{}');
}

export async function handleEditorRequest(request, response, root) {
  const url = new URL(request.url, 'http://127.0.0.1');
  const endpoint = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
  if (!endpoint.startsWith('/api/editor/')) return false;

  try {
    if (endpoint.startsWith('/api/editor/media/') && request.method === 'GET') {
      const id = decodeURIComponent(endpoint.slice('/api/editor/media/'.length));
      if (!/^[a-f0-9-]+\.(?:jpg|png|webp|gif)$/.test(id)) return json(response, 404, {error:'Image not found.'}), true;
      const file = await readFile(path.join(root, '.wireframe', 'media', id));
      const type = id.endsWith('.png')?'image/png':id.endsWith('.webp')?'image/webp':id.endsWith('.gif')?'image/gif':'image/jpeg';
      response.writeHead(200, {'Content-Type':type, 'Cache-Control':'public, max-age=31536000, immutable'}); response.end(file); return true;
    }
    const project = await readProject(new URL(`file://${root}/`));
    if (!project.editor?.enabled) return json(response, 404, {error:'The content editor is disabled.'}), true;
    const projectId = project.editor.projectId || project.slug;
    const localUser = project.editor.localUser || 'local-client@example.test';
    const localRole = project.editor.localRole === 'client' ? 'client' : 'admin';
    const versions = project.versions.map(item => item.id).sort(compareVersions);
    const latest = versions.at(-1);
    const storeFile = path.join(root, '.wireframe', 'editor-data.json');
    const store = await readStore(storeFile);
    store.comments ||= [];
    store.nextHistoryId ||= 1;
    store.nextCommentId ||= 1;
    store.access ||= {admins:[], clients:{}};
    store.access.admins ||= [];
    store.access.clients ||= {};

    if (endpoint === '/api/editor/activity' && request.method === 'GET') {
      if (localRole !== 'admin') return json(response, 403, {error:'Administrator access is required.'}), true;
      const version = url.searchParams.get('version') || '';
      const kind = url.searchParams.get('kind') || '';
      let cursor = null;
      try { cursor = JSON.parse(url.searchParams.get('before') || 'null'); } catch { return json(response, 400, {error:'Invalid activity cursor.'}), true; }
      if ((version && !versions.includes(version)) || !['', 'content', 'comments'].includes(kind) ||
        (cursor !== null && (!Array.isArray(cursor) || cursor.length !== 2 || typeof cursor[0] !== 'string' || !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(cursor[0]) || !/^[hcd]:\d+$/.test(cursor[1])))) return json(response, 400, {error:'Invalid activity request.'}), true;
      const entries = store.history.filter(item => item.projectId === projectId).map(item => ({
        event_id:`h:${item.id}`, version_id:item.version, target_key:item.key, route:'', kind:'content',
        old_value:item.old_value, new_value:item.new_value, changed_by:item.changed_by, changed_at:item.changed_at, parent_id:null
      }));
      for (const item of store.comments.filter(item => item.projectId === projectId)) {
        const event = {event_id:`c:${item.id}`, version_id:item.version_id, target_key:item.target_key, route:item.route,
          kind:item.parent_id ? 'reply' : 'comment', old_value:'', new_value:item.body, changed_by:item.changed_by, changed_at:item.changed_at, parent_id:item.parent_id ?? null};
        entries.push(event);
        if (item.deleted_at) entries.push({...event, event_id:`d:${item.id}`, kind:'deleted', old_value:item.body, new_value:'', changed_at:item.deleted_at});
      }
      const filtered = entries.filter(item => versions.includes(item.version_id) && (!version || item.version_id === version) &&
        (!kind || (kind === 'content' ? item.kind === 'content' : item.kind !== 'content')) &&
        (!cursor || item.changed_at < cursor[0] || (item.changed_at === cursor[0] && item.event_id < cursor[1])))
        .sort((a, b) => a.changed_at !== b.changed_at ? (a.changed_at > b.changed_at ? -1 : 1) : (a.event_id > b.event_id ? -1 : 1));
      const page = filtered.slice(0, 50), last = page.at(-1);
      return json(response, 200, {entries:page, nextCursor:filtered.length > 50 ? JSON.stringify([last.changed_at, last.event_id]) : null}), true;
    }

    if (endpoint === '/api/editor/accounts') {
      if (localRole !== 'admin') return json(response, 403, {error:'Administrator access is required.'}), true;
      if (request.method === 'GET') return json(response, 200, {
        projectId,
        currentUser:localUser,
        admins:[{email:localUser, source:'local', removable:false, created_by:'Local project configuration', created_at:null}, ...store.access.admins.filter(item => item.email !== localUser)],
        clients:store.access.clients[projectId] || []
      }), true;
      const account = await body(request);
      const email = String(account.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !['admin','client'].includes(account.role)) return json(response, 400, {error:'Enter a valid email address and account type.'}), true;
      if (request.method === 'POST') {
        const record = {email, source:'local', removable:true, created_by:localUser, created_at:new Date().toISOString()};
        if (account.role === 'admin') {
          if (email !== localUser && !store.access.admins.some(item => item.email === email)) store.access.admins.push(record);
          store.access.clients[projectId] = (store.access.clients[projectId] || []).filter(item => item.email !== email);
        } else {
          if (email === localUser || store.access.admins.some(item => item.email === email)) return json(response, 409, {error:'This email is already a global administrator.'}), true;
          store.access.clients[projectId] ||= [];
          if (!store.access.clients[projectId].some(item => item.email === email)) store.access.clients[projectId].push(record);
        }
        await writeStore(storeFile, store);
        return json(response, 201, {saved:true, email, role:account.role}), true;
      }
      if (request.method === 'DELETE') {
        if (account.role === 'admin') {
          if (email === localUser) return json(response, 409, {error:'You cannot remove your own administrator account.'}), true;
          store.access.admins = store.access.admins.filter(item => item.email !== email);
        } else store.access.clients[projectId] = (store.access.clients[projectId] || []).filter(item => item.email !== email);
        await writeStore(storeFile, store);
        return json(response, 200, {deleted:true, email, role:account.role}), true;
      }
      return json(response, 405, {error:'Method not allowed.'}), true;
    }

    if (endpoint === '/api/editor/content' && request.method === 'GET') {
      const version = url.searchParams.get('version');
      if (!versions.includes(version)) return json(response, 404, {error:'Unknown wireframe version.'}), true;
      return json(response, 200, {
        project:projectId,
        version,
        latest,
        editable:version === latest,
        user:localUser,
        role:localRole,
        local:true,
        content:resolveContent(store, projectId, versions, version),
        comments:(store.comments || []).filter(item => item.projectId === projectId && item.version_id === version).map(item => ({...item, body:item.deleted_at ? '' : item.body}))
      }), true;
    }

    if (endpoint === '/api/editor/comments' && request.method === 'POST') {
      const note = await body(request);
      if (note.version !== latest || !validKey(note.key) || typeof note.body !== 'string' || !note.body.trim() || note.body.length > 1500) return json(response, 400, {error:'Invalid comment.'}), true;
      let parent = null;
      if (note.parentId != null) {
        if (!Number.isSafeInteger(note.parentId) || note.parentId < 1) return json(response, 400, {error:'Invalid reply.'}), true;
        parent = store.comments.find(item => item.id === note.parentId && item.projectId === projectId && item.version_id === latest);
        if (!parent) return json(response, 404, {error:'The comment you are replying to was not found.'}), true;
      }
      const comment = {id:store.nextCommentId++, projectId, version_id:latest, route:parent?.route ?? String(note.route || 'home').slice(0,300), target_key:parent?.target_key ?? note.key, body:note.body.trim(), changed_by:localUser, changed_at:new Date().toISOString(), parent_id:parent?.id ?? null, deleted_at:null};
      store.comments ||= []; store.comments.push(comment); await writeStore(storeFile, store);
      return json(response, 201, {comment}), true;
    }

    const commentDelete = endpoint.match(/^\/api\/editor\/comments\/(\d+)$/);
    if (commentDelete && request.method === 'DELETE') {
      const id = Number(commentDelete[1]);
      const index = store.comments.findIndex(item => item.projectId === projectId && item.version_id === latest && Number(item.id) === id);
      if (index < 0) return json(response, 404, {error:'Comment not found.'}), true;
      if (store.comments[index].changed_by !== localUser) return json(response, 403, {error:'Only the comment author can delete it.'}), true;
      store.comments[index].deleted_at ||= new Date().toISOString();
      await writeStore(storeFile, store);
      return json(response, 200, {deleted:true, id, deletedAt:store.comments[index].deleted_at}), true;
    }

    if (endpoint === '/api/editor/media' && request.method === 'POST') {
      const upload = await body(request, 8 * 1024 * 1024);
      if (upload.version !== latest) return json(response, 409, {error:'This preview is no longer the latest editable version. Reload it and try again.'}), true;
      if (!validKey(upload.key)) return json(response, 400, {error:'Invalid image field. Reload the preview and try again.'}), true;
      const mime = String(upload.type || '');
      const extensions = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};
      if (!extensions[mime] || typeof upload.data !== 'string') return json(response, 400, {error:'Choose a JPEG, PNG, WebP or GIF image.'}), true;
      const bytes = Buffer.from(upload.data, 'base64');
      if (!bytes.length || bytes.length > 5 * 1024 * 1024) return json(response, 413, {error:'Images must be 5 MB or smaller.'}), true;
      const snapshotFile = project.versions.find(item => item.id === latest)?.file;
      const snapshot = await readFile(path.join(root, snapshotFile), 'utf8');
      if (!editableFields(snapshot).includes(upload.key)) return json(response, 403, {error:'This image is not editable.'}), true;
      const id = `${crypto.randomUUID()}.${extensions[mime]}`;
      await mkdir(path.join(root, '.wireframe', 'media'), {recursive:true});
      await writeFile(path.join(root, '.wireframe', 'media', id), bytes, {mode:0o600});
      const media = JSON.stringify({src:`/api/editor/media/${id}`, alt:String(upload.alt || '').slice(0,300), name:String(upload.name || 'image').slice(0,200)});
      const current = resolveContent(store, projectId, versions, latest);
      const oldValue = current[upload.key] || '';
      const changedAt = new Date().toISOString();
      store.values[projectId] ||= {}; store.values[projectId][latest] ||= {};
      const revision = (store.values[projectId][latest][upload.key]?.revision || 0) + 1;
      store.values[projectId][latest][upload.key] = {value:media, revision, updatedBy:localUser, updatedAt:changedAt};
      store.history.push({id:store.nextHistoryId++, projectId, version:latest, key:upload.key, old_value:oldValue, new_value:media, changed_by:localUser, changed_at:changedAt});
      await writeStore(storeFile, store);
      return json(response, 201, {value:media}), true;
    }

    if (endpoint === '/api/editor/history' && request.method === 'GET') {
      const version = url.searchParams.get('version');
      const key = url.searchParams.get('key');
      if (!versions.includes(version) || !validKey(key)) return json(response, 400, {error:'Invalid history request.'}), true;
      const history = store.history.filter(item => item.projectId === projectId && item.version === version && item.key === key).slice(-50).reverse();
      return json(response, 200, {history}), true;
    }

    if (endpoint === '/api/editor/content' && request.method === 'PUT') {
      const update = await body(request);
      const version = update.version;
      if (version !== latest) return json(response, 409, {error:'Only the latest wireframe version can be edited.'}), true;
      const changes = (Array.isArray(update.changes) ? update.changes : [update]).map(change => ({
        key:change?.key,
        value:typeof change?.value === 'string' ? change.value.replace(/\r\n/g, '\n') : null,
        baseValue:change?.baseValue
      }));
      if (!changes.length || changes.length > 10 || changes.some(change => !validKey(change.key) || change.value === null || change.value.length > 5000)) return json(response, 400, {error:'Invalid content field.'}), true;
      if (changes.some(change => change.key.endsWith('.url') && !validLink(change.value))) return json(response, 400, {error:'Use an internal path, #page, https://, mailto: or tel: link.'}), true;
      if (changes.some(change => !validCollection(change))) return json(response, 400, {error:'A navigation, footer or accordion item is invalid.'}), true;
      const snapshotFile = project.versions.find(item => item.id === version)?.file;
      const snapshot = await readFile(path.join(root, snapshotFile), 'utf8');
      const allowedFields = editableFields(snapshot);
      if (changes.some(change => !allowedFields.includes(change.key))) return json(response, 403, {error:'This field is not editable in the selected snapshot.'}), true;
      const current = resolveContent(store, projectId, versions, version);
      for (const change of changes) {
        change.oldValue = Object.hasOwn(current, change.key) ? current[change.key] : String(change.baseValue ?? '');
        if (typeof change.baseValue === 'string' && change.oldValue !== change.baseValue) {
          return json(response, 409, {error:'This content changed while you were editing it.', currentValue:change.oldValue}), true;
        }
      }
      const changedAt = new Date().toISOString();
      store.values[projectId] ||= {};
      store.values[projectId][version] ||= {};
      const changed = changes.filter(change => change.oldValue !== change.value);
      for (const change of changed) {
        const previousRevision = store.values[projectId][version][change.key]?.revision || 0;
        store.values[projectId][version][change.key] = {value:change.value, revision:previousRevision + 1, updatedBy:localUser, updatedAt:changedAt};
        store.history.push({id:store.nextHistoryId++, projectId, version, key:change.key, old_value:change.oldValue, new_value:change.value, changed_by:localUser, changed_at:changedAt});
      }
      if (!changed.length) return json(response, 200, {unchanged:true}), true;
      await writeStore(storeFile, store);
      return json(response, 200, {values:Object.fromEntries(changed.map(change => [change.key, change.value])), changedBy:localUser, changedAt}), true;
    }

    return json(response, 404, {error:'Editor endpoint not found.'}), true;
  } catch (error) {
    return json(response, 500, {error:error.message || 'Unexpected local editor error.'}), true;
  }
}
