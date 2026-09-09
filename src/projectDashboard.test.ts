import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {readProjectDashboard} from './projectDashboard.js';
test('a project may declare a local dashboard without adding domain code to the app',()=>{
 const path=mkdtempSync(join(tmpdir(),'project-dashboard-'));assert.equal(readProjectDashboard(path),null);
 writeFileSync(join(path,'agent-room.project.json'),JSON.stringify({dashboard:{label:'Research',url:'http://127.0.0.1:4318'}}));assert.equal(readProjectDashboard(path)?.label,'Research');
});
test('rejects remote, credential-bearing and non-http dashboard targets',()=>{
 const path=mkdtempSync(join(tmpdir(),'project-dashboard-'));
 for(const url of ['https://example.com','javascript:alert(1)','file:///C:/secret','http://a:b@127.0.0.1:4318']){writeFileSync(join(path,'agent-room.project.json'),JSON.stringify({dashboard:{label:'Test',url}}));assert.throws(()=>readProjectDashboard(path));}
});
