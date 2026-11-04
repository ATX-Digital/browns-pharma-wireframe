import {access, mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {readProject} from '../../../scripts/project.mjs';

try {
const root = new URL('../../../', import.meta.url);
const project = await readProject(root);
const projectId = project.editor?.projectId || project.slug;
const remoteInput = process.argv[2] || process.env.WIREFRAME_REMOTE_URL || '';
const syncToken = process.env.WIREFRAME_SYNC_TOKEN || '';

if (!remoteInput) throw new Error('Set WIREFRAME_REMOTE_URL or pass the deployed URL: npm run editor:pull -- https://review.example.com');
if (syncToken.length < 32) throw new Error('WIREFRAME_SYNC_TOKEN must match the deployed secret and contain at least 32 characters.');

const remote = new URL(remoteInput);
if (remote.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(remote.hostname)) throw new Error('The deployed wireframe URL must use HTTPS.');
const headers = {authorization:`Bearer ${syncToken}`, accept:'application/json'};
const accessClientId = process.env.WIREFRAME_ACCESS_CLIENT_ID || '';
const accessClientSecret = process.env.WIREFRAME_ACCESS_CLIENT_SECRET || '';
if (Boolean(accessClientId) !== Boolean(accessClientSecret)) throw new Error('Set both WIREFRAME_ACCESS_CLIENT_ID and WIREFRAME_ACCESS_CLIENT_SECRET, or neither.');
if (accessClientId) {
  headers['CF-Access-Client-Id'] = accessClientId;
  headers['CF-Access-Client-Secret'] = accessClientSecret;
}

const apiUrl = new URL('/api/editor/sync/export', remote.origin);
const response = await fetch(apiUrl, {headers, redirect:'follow'});
const responseText = await response.text();
let exported;
try { exported = JSON.parse(responseText); } catch { throw new Error(`Sync endpoint returned ${response.status} instead of JSON. Check the URL and Cloudflare Access credentials.`); }
if (!response.ok) throw new Error(exported.error || `Sync failed with HTTP ${response.status}.`);
if (exported.schemaVersion !== 1 || !exported.project || !Array.isArray(exported.values) || !Array.isArray(exported.history) || !Array.isArray(exported.comments)) throw new Error('The server returned an unsupported sync export.');
if (exported.project.id !== projectId) throw new Error(`Project mismatch: the server returned "${exported.project.id}" but this checkout expects "${projectId}".`);

const localVersions = new Set(project.versions.map(item => item.id));
const remoteVersions = (exported.project.versions || []).map(item => item.id);
const unavailable = remoteVersions.filter(version => !localVersions.has(version));
if (unavailable.length) throw new Error(`This checkout is missing deployed snapshot${unavailable.length === 1 ? '' : 's'} ${unavailable.join(', ')}. Update the local project files before pulling.`);

const wireframeDirectory = new URL('.wireframe/', root);
const mediaDirectory = new URL('media/', wireframeDirectory);
const storeUrl = new URL('editor-data.json', wireframeDirectory);
const rawExportUrl = new URL('last-remote-export.json', wireframeDirectory);
await mkdir(mediaDirectory, {recursive:true});

const downloaded = new Set();
const imagePattern = /^\/api\/editor\/media\/([^/]+)\/([a-f0-9-]+\.(?:jpg|png|webp|gif))$/;
async function localizeValue(value) {
  if (typeof value !== 'string' || !value.startsWith('{')) return value;
  let image;
  try { image = JSON.parse(value); } catch { return value; }
  const match = typeof image?.src === 'string' ? image.src.match(imagePattern) : null;
  if (!match) return value;
  const [, version, filename] = match;
  if (!localVersions.has(version)) return value;
  const destination = new URL(filename, mediaDirectory);
  if (!downloaded.has(filename)) {
    let exists = true;
    try { await access(destination); } catch (error) { if (error.code === 'ENOENT') exists = false; else throw error; }
    if (!exists) {
      const mediaResponse = await fetch(new URL(image.src, remote.origin), {headers, redirect:'follow'});
      if (!mediaResponse.ok) throw new Error(`Could not download ${filename}: HTTP ${mediaResponse.status}.`);
      const bytes = new Uint8Array(await mediaResponse.arrayBuffer());
      if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error(`Remote image ${filename} is empty or larger than 5 MB.`);
      await writeFile(destination, bytes, {mode:0o600});
    }
    downloaded.add(filename);
  }
  image.src = `/api/editor/media/${filename}`;
  return JSON.stringify(image);
}

let store = {values:{}, history:[], comments:[], nextHistoryId:1, nextCommentId:1};
let previousStore = '';
try {
  previousStore = await readFile(storeUrl, 'utf8');
  store = JSON.parse(previousStore);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
store.values ||= {};
store.history ||= [];
store.comments ||= [];

const importedValues = {};
for (const row of exported.values) {
  if (!localVersions.has(row.version_id) || typeof row.content_key !== 'string') continue;
  importedValues[row.version_id] ||= {};
  importedValues[row.version_id][row.content_key] = {
    value:await localizeValue(row.value),
    revision:Number(row.revision) || 1,
    updatedBy:String(row.updated_by || ''),
    updatedAt:String(row.updated_at || '')
  };
}
store.values[projectId] = importedValues;

const retainedHistory = store.history.filter(item => item.projectId !== projectId);
const importedHistory = [];
for (const row of exported.history) {
  if (!localVersions.has(row.version_id)) continue;
  importedHistory.push({
    id:Number(row.id), projectId, version:row.version_id, key:String(row.content_key || ''),
    old_value:await localizeValue(row.old_value), new_value:await localizeValue(row.new_value),
    changed_by:String(row.changed_by || ''), changed_at:String(row.changed_at || '')
  });
}
store.history = [...retainedHistory, ...importedHistory];

const retainedComments = store.comments.filter(item => item.projectId !== projectId);
const importedComments = exported.comments.filter(row => localVersions.has(row.version_id)).map(row => ({
  id:Number(row.id), projectId, version_id:row.version_id, route:String(row.route || 'home'),
  target_key:String(row.target_key || ''), body:String(row.body || ''),
  parent_id:Number(row.parent_id) || null, deleted_at:row.deleted_at || null,
  changed_by:String(row.changed_by || ''), changed_at:String(row.changed_at || '')
}));
store.comments = [...retainedComments, ...importedComments];
store.nextHistoryId = Math.max(0, ...store.history.map(item => Number(item.id) || 0)) + 1;
store.nextCommentId = Math.max(0, ...store.comments.map(item => Number(item.id) || 0)) + 1;

await mkdir(wireframeDirectory, {recursive:true});
let backupUrl = null;
if (previousStore) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDirectory = new URL('backups/', wireframeDirectory);
  await mkdir(backupDirectory, {recursive:true});
  backupUrl = new URL(`editor-data-${stamp}.json`, backupDirectory);
  await writeFile(backupUrl, previousStore, {flag:'wx', mode:0o600});
}
await writeFile(rawExportUrl, `${JSON.stringify(exported, null, 2)}\n`, {mode:0o600});
const temporary = new URL('editor-data.json.tmp', wireframeDirectory);
await writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, {mode:0o600});
await rename(temporary, storeUrl);

const fieldCount = Object.values(importedValues).reduce((total, fields) => total + Object.keys(fields).length, 0);
console.log(`Pulled ${fieldCount} value(s), ${importedHistory.length} history item(s), ${importedComments.length} comment(s) and ${downloaded.size} referenced image(s) for ${projectId}.`);
console.log(`Local preview data: ${storeUrl.pathname}`);
if (backupUrl) console.log(`Previous local data backup: ${backupUrl.pathname}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
