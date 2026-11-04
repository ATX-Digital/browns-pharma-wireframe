import { access, readFile } from 'node:fs/promises';
export const validVersion = id => /^v(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){0,2}$/.test(id);
export function compareVersions(a,b){const x=a.replace(/^v/,'').split('.').map(Number),y=b.replace(/^v/,'').split('.').map(Number);for(let i=0;i<Math.max(x.length,y.length);i++){const d=(x[i]||0)-(y[i]||0);if(d)return d;}return 0;}
export async function readProject(root){
  const src=await readFile(new URL('project.js',root),'utf8');
  const match=src.match(/^window\.WIREFRAME_PROJECT\s*=\s*([\s\S]*?);?\s*$/);
  if(!match)throw new Error('project.js must contain only window.WIREFRAME_PROJECT = { ...JSON... };');
  const data=JSON.parse(match[1].replace(/;\s*$/,''));
  if(!data.name||!data.versions?.length)throw new Error('Project name and versions are required.');
  const seen=[];
  for(const v of data.versions){
    if(!validVersion(v.id))throw new Error('Invalid version: '+v.id);
    if(seen.some(id=>compareVersions(id,v.id)===0))throw new Error('Duplicate numeric version: '+v.id);
    seen.push(v.id);
    if(v.file!==`versions/${v.id}.html`)throw new Error('Snapshot filename must match its version: '+v.id);
  }
  const existing=[];
  for(const version of data.versions){
    try{
      await access(new URL(version.file,root));
      existing.push(version);
    }catch(error){
      if(error.code!=='ENOENT')throw error;
    }
  }
  if(!existing.length)throw new Error('No version snapshot files exist. Add a versions/vX.html snapshot.');
  data.versions=existing;
  return data;
}
export const serializeProject = data => 'window.WIREFRAME_PROJECT = '+JSON.stringify(data,null,2)+';\n';
