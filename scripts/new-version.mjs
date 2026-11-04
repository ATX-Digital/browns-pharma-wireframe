import { copyFile, writeFile, constants } from 'node:fs/promises';
import { readProject, serializeProject, validVersion, compareVersions } from './project.mjs';
const root=new URL('../',import.meta.url);
const [id,...words]=process.argv.slice(2);
try{
 if(!id||!validVersion(id))throw new Error('Usage: npm run version:new -- v1.1 "Description" (v1, v2.4 and v3.2.2 are supported)');
 const data=await readProject(root);
 const latest=[...data.versions].sort((a,b)=>compareVersions(a.id,b.id)).at(-1);
 if(compareVersions(id,latest.id)<=0)throw new Error('Choose a version greater than '+latest.id+'. Existing versions are never overwritten.');
 const file=`versions/${id}.html`;
 await copyFile(new URL(latest.file,root),new URL(file,root),constants.COPYFILE_EXCL);
 data.versions.push({id,label:words.join(' ')||'New revision',file,date:new Date().toISOString().slice(0,10)});
 await writeFile(new URL('project.js',root),serializeProject(data));
 console.log(`Created ${file} as a complete copy of ${latest.file}. Edit the new HTML snapshot. The root viewer now defaults to ${id}.`);
}catch(e){console.error(e.message);process.exitCode=1;}
