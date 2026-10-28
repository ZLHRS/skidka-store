import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createVpsServer,configFromEnv} from '../server.mjs';
import {backupDatabase} from '../backup.mjs';

test('VPS: public HTTPS origin, secure login, persistent accounts and verified backup',async()=>{
 const base=resolve(tmpdir()),folder=await mkdtemp(join(base,'po-skidke-vps-test-')),dbPath=join(folder,'accounts.sqlite');let server;
 const start=async()=>{server=createVpsServer({origin:'https://example.test',dbPath});await new Promise(r=>server.listen(0,'127.0.0.1',r));return 'http://127.0.0.1:'+server.address().port;};
 const stop=()=>new Promise(r=>{server.close(r);server.closeAllConnections();});
 try{
  const address=await start(),registered=await fetch(address+'/api/auth/register',{method:'POST',headers:{Origin:'https://example.test','Content-Type':'application/json','CF-Connecting-IP':'198.51.100.99'},body:JSON.stringify({username:'vps_test',password:'temporary-vps-test-password'})});
  assert.equal(registered.status,200);assert.match(registered.headers.get('set-cookie'),/Secure/);const cookie=registered.headers.get('set-cookie').split(';')[0];
  const prefs=await fetch(address+'/api/preferences',{method:'PUT',headers:{Origin:'https://example.test','Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({city:'petropavlovsk',categories:['sweets','drinks']})});assert.equal(prefs.status,200);
  const blocked=await fetch(address+'/api/preferences',{method:'PUT',headers:{Origin:'https://evil.test','Content-Type':'application/json',Cookie:cookie},body:'{}'});assert.equal(blocked.status,403);
  const manifest=await(await fetch(address+'/manifest.webmanifest')).json();assert.equal(manifest.related_applications[0].url,'https://example.test/manifest.webmanifest?v=2');
  const backup=await backupDatabase(dbPath,join(folder,'backups')),copy=new DatabaseSync(backup,{readOnly:true});assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM accounts').get().n,1);copy.close();
  await stop();const restarted=await start(),profile=await(await fetch(restarted+'/api/profile',{headers:{Cookie:cookie}})).json();assert.equal(profile.user.username,'vps_test');assert.deepEqual(profile.preferences.categories,['sweets','drinks']);assert.equal(profile.preferences.city,'petropavlovsk');
 }finally{if(server?.listening)await stop();if(dirname(folder)===base&&basename(folder).startsWith('po-skidke-vps-test-'))await rm(folder,{recursive:true,force:true});}
});
test('VPS config requires an HTTPS domain without paths or credentials',()=>{
 assert.equal(configFromEnv({PUBLIC_ORIGIN:'https://example.test',DB_PATH:'test.sqlite'}).port,4173);
 for(const value of ['http://example.test','https://example.test/app','https://user:pass@example.test'])assert.throws(()=>configFromEnv({PUBLIC_ORIGIN:value}));
});
