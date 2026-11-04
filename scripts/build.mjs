import { mkdir, copyFile, cp, readFile, rm, lstat, writeFile } from 'node:fs/promises';
import { readProject, serializeProject } from './project.mjs';
const root=new URL('../',import.meta.url),dist=new URL('dist/',root);
const data=await readProject(root);
for(const v of data.versions){const html=await readFile(new URL(v.file,root),'utf8');if(!html.includes('wf:ready')||!html.includes('Wireframe, not final design.'))throw new Error('Incomplete snapshot: '+v.file);}
// Only this project's generated dist directory is replaced. Source and snapshots are untouched.
try{if((await lstat(dist)).isSymbolicLink())throw new Error('Refusing to build into a symlink.');await rm(dist,{recursive:true});}catch(e){if(e.code!=='ENOENT')throw e;}
await mkdir(new URL('versions/',dist),{recursive:true});
for(const f of ['index.html','_headers','robots.txt'])await copyFile(new URL(f,root),new URL(f,dist));
await writeFile(new URL('project.js',dist),serializeProject(data));
await cp(new URL('assets/',root),new URL('assets/',dist),{recursive:true});
await cp(new URL('addons/content-editor/client/',root),new URL('editor/',dist),{recursive:true});
// Pages advanced mode uses dist/_worker.js. Workers Static Assets uses the same source via wrangler.jsonc.
await copyFile(new URL('addons/content-editor/worker/index.js',root),new URL('_worker.js',dist));
await copyFile(new URL('.assetsignore',root),new URL('.assetsignore',dist));
for(const v of data.versions)await copyFile(new URL(v.file,root),new URL(v.file,dist));
console.log(`Built ${data.name}: ${data.versions.length} independent snapshot(s) in dist/.`);
