import {mkdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {readSmallOnServer} from './lib/small-server-reader.mjs';
import {restoreSharedSmallState} from './lib/small-service.js';

const file=resolve(process.argv[2]),folder=dirname(file);
mkdirSync(join(folder,'ocr-cache'),{recursive:true,mode:0o700});
let state={seen:{},snapshot:null,checkedAt:null};
try{state=restoreSharedSmallState(JSON.parse(readFileSync(file,'utf8')))}catch(e){if(e.code!=='ENOENT')throw e}
await readSmallOnServer(state,{cachePath:join(folder,'ocr-cache'),save(next){writeFileSync(file+'.tmp',JSON.stringify(next),{mode:0o600});renameSync(file+'.tmp',file)}});
