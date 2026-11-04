import {readFile} from 'node:fs/promises';
import {readProject} from './project.mjs';
import {parseJsonc} from './jsonc.mjs';

const root = new URL('../', import.meta.url);
const [project, wranglerSource] = await Promise.all([
  readProject(root),
  readFile(new URL('wrangler.jsonc', root), 'utf8')
]);
const wrangler = parseJsonc(wranglerSource, 'wrangler.jsonc');
const errors = [];
const warnings = [];
const projectId = project.editor?.projectId || '';
const route = wrangler.routes?.find(item => item.custom_domain)?.pattern || '';
const database = wrangler.d1_databases?.find(item => item.binding === 'WIREFRAME_CONTENT');
const bucket = wrangler.r2_buckets?.find(item => item.binding === 'WIREFRAME_MEDIA');

if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(projectId)) errors.push('project.js editor.projectId must be a permanent lowercase kebab-case ID.');
if (!wrangler.name) errors.push('wrangler.jsonc is missing the Worker name.');
if (!route) errors.push('wrangler.jsonc needs a custom-domain route.');
if (route.includes('://') || route.includes('/')) errors.push('The custom-domain route must be a hostname only.');
if (wrangler.assets?.binding !== 'ASSETS') errors.push('The ASSETS binding is missing.');
if (wrangler.assets?.run_worker_first !== true) errors.push('assets.run_worker_first must be true so authentication protects static files.');
if (!database?.database_name || !database?.database_id || /PASTE|YOUR_/i.test(database.database_id)) errors.push('The WIREFRAME_CONTENT D1 binding is incomplete.');
if (!bucket?.bucket_name) errors.push('The WIREFRAME_MEDIA R2 binding is incomplete.');
if (wrangler.workers_dev !== false) warnings.push('workers_dev is not false; the workers.dev address may remain reachable and also needs protection.');
if (wrangler.preview_urls !== false) warnings.push('preview_urls is not false; preview addresses may remain reachable and also need protection.');
if (wrangler.keep_vars !== true) warnings.push('keep_vars is not true; a deploy may remove Dashboard-managed variables.');
if (project.slug !== projectId) warnings.push(`Project slug "${project.slug}" differs from project ID "${projectId}". This is allowed, but new projects normally use the same value.`);
if (wrangler.name !== projectId) warnings.push(`Worker name "${wrangler.name}" differs from project ID "${projectId}". This is allowed for this existing project.`);

if (errors.length) {
  console.error('Deployment check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Deployment configuration is valid for ${project.name}.`);
  console.log(`Project ID: ${projectId}`);
  console.log(`URL: https://${route}`);
  console.log(`D1: ${database.database_name}`);
  console.log(`R2: ${bucket.bucket_name}`);
  console.log(`Versions: ${project.versions.map(item => item.id).join(', ')}`);
}
if (warnings.length) {
  console.warn('Warnings:');
  for (const warning of warnings) console.warn(`- ${warning}`);
}
