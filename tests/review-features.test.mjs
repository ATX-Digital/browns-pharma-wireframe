import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import worker from '../addons/content-editor/worker/index.js';
import {handleEditorRequest} from '../addons/content-editor/local-api.mjs';

const project = {name:'Review test', slug:'review-test', editor:{enabled:true, projectId:'review-test', localUser:'admin@example.test'}, versions:[{id:'v1', file:'versions/v1.html'}, {id:'v2', file:'versions/v2.html'}]};
const snapshot = 'const EDITABLE_FIELDS=["home.title","nav.items","home.image","faq.accordions"];';
const source = value => `window.WIREFRAME_PROJECT = ${JSON.stringify(value)};`;

async function makeWorker() {
  const db = new DatabaseSync(':memory:');
  for (const name of ['0001_content.sql', '0002_access.sql']) db.exec(await readFile(new URL(`../addons/content-editor/migrations/${name}`, import.meta.url), 'utf8'));
  db.prepare('INSERT INTO wf_comments(project_id, version_id, route, target_key, body, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('review-test', 'v1', 'home', 'home.pin', 'Legacy comment', 'client@example.test', '2026-01-01T00:00:00.000Z');
  db.exec(await readFile(new URL('../addons/content-editor/migrations/0003_comment_replies.sql', import.meta.url), 'utf8'));
  db.prepare('INSERT INTO wf_project_members VALUES (?, ?, ?, ?)').run('review-test', 'client@example.test', 'admin@example.test', '2026-01-01');
  db.prepare('INSERT INTO wf_comments(project_id, version_id, route, target_key, body, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('another-project', 'v2', 'private', 'private.pin', 'Private comment', 'client@example.test', '2026-01-01T00:00:00.000Z');
  const foreignId = 2;
  const adapter = {
    prepare(sql) {
      const statement = db.prepare(sql);
      const prepared = params => ({
        bind(...values) { return prepared(values); },
        async first() { return statement.get(...params) || null; },
        async all() { return {results:statement.all(...params)}; },
        async run() { return statement.run(...params); }
      });
      return prepared([]);
    },
    async batch(statements) {
      db.exec('BEGIN');
      try { const results = []; for (const statement of statements) results.push(await statement.all()); db.exec('COMMIT'); return results; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    }
  };
  const objects = new Map();
  const env = {WIREFRAME_CONTENT:adapter, WIREFRAME_BOOTSTRAP_ADMINS:'admin@example.test', WIREFRAME_SYNC_TOKEN:'test-only-sync-token-with-at-least-32-characters',
    WIREFRAME_MEDIA:{async put(key, value) { objects.set(key, value); }, async get(key) { const body = objects.get(key); return body ? {body, httpMetadata:{contentType:'image/png'}} : null; }},
    ASSETS:{async fetch(url) { return new Response(new URL(url).pathname === '/project.js' ? source(project) : snapshot); }}
  };
  return {foreignId, async call(endpoint, method = 'GET', body, user = 'admin@example.test', headers = {}) {
    const response = await worker.fetch(new Request(`https://review.test/api/editor/${endpoint}`, {method, headers:{'content-type':'application/json', ...(user ? {'cf-access-authenticated-user-email':user} : {}), ...headers}, ...(body === undefined ? {} : {body:JSON.stringify(body)})}), env, {access:{async getIdentity(){return user ? {email:user} : null;}}});
    return {status:response.status, data:await response.json()};
  }, async close() { db.close(); }};
}

async function makeLocal() {
  const root = await mkdtemp(path.join(tmpdir(), 'wireframe-review-test-'));
  await mkdir(path.join(root, 'versions'));
  await mkdir(path.join(root, '.wireframe'));
  await writeFile(path.join(root, 'project.js'), source(project));
  for (const version of project.versions) await writeFile(path.join(root, version.file), snapshot);
  await writeFile(path.join(root, '.wireframe/editor-data.json'), JSON.stringify({values:{}, history:[], comments:[
    {id:1, projectId:'review-test', version_id:'v1', route:'home', target_key:'home.pin', body:'Legacy comment', changed_by:'client@example.test', changed_at:'2026-01-01T00:00:00.000Z'},
    {id:2, projectId:'another-project', version_id:'v2', route:'private', target_key:'private.pin', body:'Private comment', changed_by:'client@example.test', changed_at:'2026-01-01T00:00:00.000Z'}
  ], nextCommentId:3, nextHistoryId:1}));
  const server = http.createServer((request, response) => handleEditorRequest(request, response, root));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {foreignId:2, async call(endpoint, method = 'GET', body, user = 'admin@example.test') {
    await writeFile(path.join(root, 'project.js'), source({...project, editor:{...project.editor, localUser:user, localRole:user === 'admin@example.test' ? 'admin' : 'client'}}));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/editor/${endpoint}`, {method, headers:{'content-type':'application/json'}, ...(body === undefined ? {} : {body:JSON.stringify(body)})});
    return {status:response.status, data:await response.json()};
  }, async close() { await new Promise(resolve => server.close(resolve)); await rm(root, {recursive:true, force:true}); }};
}

for (const [name, factory] of [['Worker with real SQLite', makeWorker], ['Local preview', makeLocal]]) {
  test(`${name}: review history, replies, isolation and pagination`, async () => {
    const api = await factory();
    const client = 'client@example.test';
    try {
      assert.equal((await api.call('content?version=v1')).data.comments[0].body, 'Legacy comment');
      assert.equal((await api.call('activity', 'GET', undefined, client)).status, 403);
      const change = {version:'v2', key:'home.title', value:'New title', baseValue:'Original title'};
      assert.equal((await api.call('content', 'PUT', change, client)).status, 200);
      assert.equal((await api.call('content', 'PUT', {...change, value:'Conflict'}, client)).status, 409);
      assert.equal((await api.call('content', 'PUT', {...change, baseValue:'New title'}, client)).data.unchanged, true);
      const beforeLinks = JSON.stringify([{label:'Home', url:'#home'}, {label:'Services', url:'#services'}]);
      const afterLinks = JSON.stringify([{label:'Services', url:'#services'}, {label:'Home', url:'#home'}]);
      assert.equal((await api.call('content', 'PUT', {version:'v2', key:'nav.items', baseValue:beforeLinks, value:afterLinks}, client)).status, 200);
      const image = await api.call('media', 'POST', {version:'v2', key:'home.image', type:'image/png', data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=', name:'test.png', alt:'Test image'}, client);
      assert.equal(image.status, 201);
      assert.equal((await api.call('content', 'PUT', {version:'v2', key:'home.image', baseValue:image.data.value, value:''}, client)).status, 200);
      const note = {version:'v2', key:'home.pin', route:'home', body:'Please update this section.'};
      const root = (await api.call('comments', 'POST', note, client)).data.comment;
      assert.ok(root.id);
      const reply = (await api.call('comments', 'POST', {...note, key:'wrong.pin', route:'wrong', parentId:root.id, body:'Yes, which part?'})).data.comment;
      assert.equal(reply.parent_id, root.id);
      assert.equal(reply.target_key, root.target_key);
      assert.equal(reply.route, root.route);
      const nested = (await api.call('comments', 'POST', {...note, parentId:reply.id, body:'The heading.'}, client)).data.comment;
      assert.equal(nested.parent_id, reply.id);
      assert.equal((await api.call('comments', 'POST', {...note, parentId:api.foreignId})).status, 404);
      assert.equal((await api.call('comments', 'POST', {...note, parentId:1})).status, 404);
      assert.equal((await api.call('comments', 'POST', {...note, parentId:'3'})).status, 400);
      assert.equal((await api.call('comments', 'POST', {...note, version:'v1'})).status, 400);
      assert.equal((await api.call(`comments/${root.id}`, 'DELETE')).status, 403);
      const deleted = await api.call(`comments/${root.id}`, 'DELETE', undefined, client);
      assert.equal(deleted.status, 200);
      assert.equal((await api.call(`comments/${root.id}`, 'DELETE', undefined, client)).data.deletedAt, deleted.data.deletedAt);
      const comments = (await api.call('content?version=v2')).data.comments;
      assert.equal(comments.find(item => item.id === root.id).body, '');
      assert.equal(comments.find(item => item.id === nested.id).body, 'The heading.');
      const activity = (await api.call('activity')).data.entries;
      assert.ok(!JSON.stringify(activity).includes('Private comment'));
      assert.equal(activity.find(item => item.event_id === `d:${root.id}`).old_value, note.body);
      assert.equal(activity.find(item => item.event_id === `c:${root.id}`).new_value, note.body);
      assert.equal(activity.filter(item => item.kind === 'deleted').length, 1);
      const text = activity.find(item => item.target_key === 'home.title');
      assert.equal(text.old_value, 'Original title'); assert.equal(text.new_value, 'New title'); assert.equal(text.changed_by, client);
      const list = activity.find(item => item.target_key === 'nav.items');
      assert.equal(list.old_value, beforeLinks); assert.equal(list.new_value, afterLinks);
      assert.equal(activity.filter(item => item.target_key === 'home.image').length, 2);
      assert.ok((await api.call('activity?kind=comments')).data.entries.every(item => item.kind !== 'content'));
      assert.equal((await api.call('activity?version=v1')).data.entries.length, 1);
      assert.equal((await api.call('activity?version=unknown')).status, 400);
      assert.equal((await api.call('activity?before=bad')).status, 400);
      assert.equal((await api.call('activity?before=%7B%7D')).status, 400);
      for (let i = 0; i < 55; i++) assert.equal((await api.call('comments', 'POST', {...note, body:`Pagination ${i}`})).status, 201);
      const first = (await api.call('activity')).data;
      assert.equal(first.entries.length, 50); assert.ok(first.nextCursor);
      await api.call('comments', 'POST', {...note, body:'Inserted between pages'});
      const second = (await api.call(`activity?before=${encodeURIComponent(first.nextCursor)}`)).data;
      const ids = [...first.entries, ...second.entries].map(item => item.event_id);
      assert.equal(new Set(ids).size, ids.length);
      assert.equal(ids.length, activity.length + 55);
      assert.equal(second.nextCursor, null);
      if (name.startsWith('Worker')) {
        assert.equal((await api.call('activity', 'GET', undefined, '')).status, 401);
        assert.equal((await api.call('activity', 'GET', undefined, 'outsider@example.test')).status, 403);
        assert.equal((await api.call('sync/export')).status, 401);
        const exported = await api.call('sync/export', 'GET', undefined, '', {authorization:'Bearer test-only-sync-token-with-at-least-32-characters'});
        assert.equal(exported.status, 200);
        assert.equal(exported.data.comments.find(item => item.id === nested.id).parent_id, reply.id);
        assert.equal(exported.data.comments.find(item => item.id === root.id).body, note.body);
        assert.ok(exported.data.comments.find(item => item.id === root.id).deleted_at);
        assert.ok(!JSON.stringify(exported.data).includes('Private comment'));
      }
    } finally { await api.close(); }
  });
}


test('Worker refuses public assets when storage, login or project membership is missing', async () => {
  const emptyDatabase={prepare(){return {bind(){return this;},async first(){return null;}};}};
  const env={ASSETS:{async fetch(url){return new Response(new URL(url instanceof Request?url.url:url).pathname==='/project.js'?source(project):'PRIVATE ASSET');}}};
  for(const pathname of ['/', '/index.html', '/versions/v1.html', '/versions/v1', '/project.js', '/assets/viewer.js']){
    const request=new Request('https://review.test'+pathname);
    assert.equal((await worker.fetch(request,env,{})).status,503);
    assert.equal((await worker.fetch(request,{...env,WIREFRAME_CONTENT:emptyDatabase},{})).status,401);
    const unlisted=new Request(request,{headers:{'cf-access-authenticated-user-email':'unlisted@example.test'}});
    assert.equal((await worker.fetch(unlisted,{...env,WIREFRAME_CONTENT:emptyDatabase},{access:{async getIdentity(){return {email:'unlisted@example.test'};}}})).status,403);
  }
});


test('Worker validates signed Access identity and rejects spoofed email headers', async () => {
  const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='access-test-key';
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>{assert.equal(url,'https://wireframe-test.cloudflareaccess.com/cdn-cgi/access/certs');return Response.json({keys:[jwk]});};
  const env={WIREFRAME_ACCESS_TEAM_DOMAIN:'wireframe-test.cloudflareaccess.com',WIREFRAME_ACCESS_AUD:'test-audience',WIREFRAME_BOOTSTRAP_ADMINS:'admin@example.test',WIREFRAME_CONTENT:{},ASSETS:{async fetch(url){return new Response(new URL(url instanceof Request?url.url:url).pathname==='/project.js'?source(project):'PRIVATE ASSET');}}};
  const claims={email:'admin@example.test',iss:'https://wireframe-test.cloudflareaccess.com',aud:['test-audience'],exp:Math.floor(Date.now()/1000)+300};
  const encoded=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  async function signed(payload){const content=encoded({alg:'RS256',kid:jwk.kid})+'.'+encoded(payload);const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(content));return content+'.'+Buffer.from(signature).toString('base64url');}
  async function call(token,settings=env){return worker.fetch(new Request('https://review.test/versions/v1',{headers:{'cf-access-authenticated-user-email':'admin@example.test',...(token?{'cf-access-jwt-assertion':token}:{})}}),settings,{});}
  try{
    assert.equal((await call()).status,401);
    const token=await signed(claims);
    assert.equal((await call(token)).status,200);
    assert.equal((await call(token,{...env,WIREFRAME_ACCESS_AUD:''})).status,401);
    assert.equal((await call(await signed({...claims,aud:['another-project']}))).status,401);
    assert.equal((await call(await signed({...claims,exp:1}))).status,401);
    assert.equal((await call(token.slice(0,-10)+'invalidsig')).status,401);
  }finally{globalThis.fetch=originalFetch;}
});
