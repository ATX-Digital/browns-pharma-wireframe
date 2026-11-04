import {readFile, writeFile} from 'node:fs/promises';
import {readProject, serializeProject} from './project.mjs';
import {parseJsonc} from './jsonc.mjs';

const root = new URL('../', import.meta.url);
const usage = `Configure a copied wireframe project safely.

Usage:
  npm run project:configure -- --name "Britannia" --id britannia-wireframe --host britannia-wireframe.stagingcloud.dev

This changes only the project identity, npm package name, Worker name and custom
domain. When the project ID changes, the new project starts with only v1 registered.
Pass --keep-versions only when intentionally cloning the existing version history.
The shared D1 database and R2 bucket bindings are always preserved.`;

function argumentsFrom(items) {
  const values = {};
  for (let index = 0; index < items.length; index += 1) {
    const argument = items[index];
    if (argument === '--help' || argument === '-h') return {help:true};
    if (argument === '--keep-versions') {
      values.keepVersions = true;
      continue;
    }
    if (!['--name', '--id', '--host'].includes(argument)) throw new Error(`Unknown option: ${argument}\n\n${usage}`);
    const value = items[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.\n\n${usage}`);
    values[argument.slice(2)] = value.trim();
    index += 1;
  }
  return values;
}

const options = argumentsFrom(process.argv.slice(2));
if (options.help) {
  console.log(usage);
  process.exit(0);
}
for (const required of ['name', 'id', 'host']) {
  if (!options[required]) throw new Error(`Missing --${required}.\n\n${usage}`);
}
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.id)) throw new Error('--id must contain only lowercase letters, numbers and single hyphens (for example britannia-wireframe).');
if (options.id.length > 63) throw new Error('--id must be 63 characters or fewer.');
if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(options.host)) throw new Error('--host must be a hostname without https:// or a path (for example britannia-wireframe.stagingcloud.dev).');

const packageUrl = new URL('package.json', root);
const wranglerUrl = new URL('wrangler.jsonc', root);
const [project, packageSource, wranglerSource] = await Promise.all([
  readProject(root),
  readFile(packageUrl, 'utf8'),
  readFile(wranglerUrl, 'utf8')
]);
const packageData = JSON.parse(packageSource);
const wrangler = parseJsonc(wranglerSource, 'wrangler.jsonc');
const previousProjectId = project.editor?.projectId || project.slug;
const startsFresh = previousProjectId !== options.id && !options.keepVersions;

if (startsFresh) {
  const firstVersion = project.versions.find(version => version.id === 'v1');
  if (!firstVersion) throw new Error('A fresh project requires the starter snapshot versions/v1.html. Configuration stopped without writing files.');
  project.versions = [firstVersion];
}

project.name = options.name;
project.slug = options.id;
project.editor ||= {};
project.editor.projectId = options.id;
packageData.name = options.id;
wrangler.name = options.id;
wrangler.keep_vars = true;
wrangler.workers_dev = false;
wrangler.preview_urls = false;
wrangler.routes = [{pattern:options.host, custom_domain:true}];
wrangler.assets ||= {};
wrangler.assets.run_worker_first = true;

if (!wrangler.d1_databases?.some(item => item.binding === 'WIREFRAME_CONTENT')) throw new Error('The shared WIREFRAME_CONTENT D1 binding is missing; configuration stopped without writing files.');
if (!wrangler.r2_buckets?.some(item => item.binding === 'WIREFRAME_MEDIA')) throw new Error('The shared WIREFRAME_MEDIA R2 binding is missing; configuration stopped without writing files.');

await Promise.all([
  writeFile(new URL('project.js', root), serializeProject(project)),
  writeFile(packageUrl, `${JSON.stringify(packageData, null, 2)}\n`),
  writeFile(wranglerUrl, `${JSON.stringify(wrangler, null, 2)}\n`)
]);

console.log(`Configured ${options.name}.`);
console.log(`Project ID: ${options.id} (keep this permanent)`);
console.log(`Worker: ${options.id}`);
console.log(`URL: https://${options.host}`);
console.log('Shared D1 and R2 bindings were preserved.');
console.log(startsFresh ? 'Versions: v1 only (fresh project)' : `Versions: ${project.versions.map(version => version.id).join(', ')}`);
console.log('Next: npm run deploy:check');
