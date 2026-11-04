import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {readProject} from '../../../scripts/project.mjs';

const root = new URL('../../../', import.meta.url);
const project = await readProject(root);
const source = new URL('.wireframe/editor-data.json', root);
let store;
try {
  store = JSON.parse(await readFile(source, 'utf8'));
} catch (error) {
  if (error.code === 'ENOENT') throw new Error('There is no local editor content to export yet.');
  throw error;
}

const projectId = project.editor?.projectId || project.slug;
const output = new URL(`exports/${projectId}-content.json`, root);
await mkdir(new URL('exports/', root), {recursive:true});
await writeFile(output, `${JSON.stringify({
  exportedAt:new Date().toISOString(),
  project:{id:projectId, name:project.name, versions:project.versions},
  values:store.values?.[projectId] || {},
  history:(store.history || []).filter(item => item.projectId === projectId),
  comments:(store.comments || []).filter(item => item.projectId === projectId)
}, null, 2)}\n`);
console.log(`Exported local content to ${output.pathname}`);
