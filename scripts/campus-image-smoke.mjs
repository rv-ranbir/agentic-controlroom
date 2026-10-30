import {_electron as electron} from 'playwright';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const repo=fileURLToPath(new URL('../',import.meta.url));
const {ArtifactStore}=await import(pathToFileURL(join(repo,'dist/workflow/artifacts.js')).href);
import {mkdirSync,writeFileSync,copyFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const root=process.env.CAMPUS_TEST_OUTPUT||tmpdir(),profile=root+'/image-profile-'+Date.now();mkdirSync(profile,{recursive:true});
const project={id:'images',name:'Design studio',path:profile+'/project',backend:'claude',agents:[]};mkdirSync(project.path);writeFileSync(profile+'/projects.json',JSON.stringify([project,{...project,id:'other',name:'Other',path:profile}]));
copyFileSync(join(repo,'src/desktop/renderer/assets/office/living-campus.png'),project.path+'/design.png');
const store=new ArtifactStore(project.path),artifact=store.add({title:'Campus concept',kind:'image',path:'design.png',runId:'test'});
writeFileSync(project.path+'/broken.png','not an image');const broken=store.add({title:'Broken',kind:'image',path:'broken.png',runId:'test'});
const bootstrap=profile+'/bootstrap.mjs';writeFileSync(bootstrap,`import {app} from 'electron';app.setPath('userData',${JSON.stringify(profile)});await import(${JSON.stringify(pathToFileURL(join(repo,'dist/desktop/main.cjs')).href)});`);
const app=await electron.launch({args:[bootstrap]});
try{
 const page=await app.firstWindow();await page.setViewportSize({width:1440,height:1000});
 const result=await page.evaluate(async({id})=>window.api.getArtifactThumbnail('images',id),artifact);
 assert.match(result.dataUrl,/^data:image\/png;base64,/);assert.ok(result.width<=512&&result.height<=512);
 for(const [projectId,id] of [['other',artifact.id],['images',broken.id]])assert.equal(await page.evaluate(async([p,id])=>{try{await window.api.getArtifactThumbnail(p,id);return false;}catch{return true;}},[projectId,id]),true);
 await page.locator('.lnItem').filter({hasText:project.name}).click();await page.getByRole('button',{name:'floor',exact:true}).click();await page.getByRole('button',{name:'3D campus',exact:true}).click();
 await page.locator('.campus3d[data-gallery-images="1"]').waitFor();await page.screenshot({path:root+'/campus3d-images.png'});
 const [preview]=await Promise.all([app.waitForEvent('window'),page.evaluate(id=>window.api.openArtifact('images',id,'app'),artifact.id)]);await preview.waitForLoadState('domcontentloaded');assert.equal(await preview.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0),true);await preview.close();
 console.log(JSON.stringify({thumbnail:true,projectIsolation:true,invalidImage:true,wallImage:true,imagePreview:true,paidCalls:0}));
}finally{await app.close();}
