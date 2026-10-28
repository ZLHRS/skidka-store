import {DatabaseSync,backup} from 'node:sqlite';
import {mkdir,chmod,stat} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function backupDatabase(sourcePath,outputDirectory){
 const source=resolve(sourcePath);await stat(source);
 const directory=resolve(outputDirectory);await mkdir(directory,{recursive:true,mode:0o700});
 const stamp=new Date().toISOString().replace(/[:.]/g,'-'),target=join(directory,'accounts-'+stamp+'.sqlite');
 const db=new DatabaseSync(source,{readOnly:true});
 try{await backup(db,target);}finally{db.close();}
 await chmod(target,0o600);
 const check=new DatabaseSync(target,{readOnly:true});try{if(Object.values(check.prepare('PRAGMA quick_check').get())[0]!=='ok')throw new Error('Backup verification failed');}finally{check.close();}
 return target;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const source=process.argv[2]||process.env.DB_PATH||'/var/lib/po-skidke/accounts.sqlite';
 console.log(await backupDatabase(source,process.argv[3]||join(dirname(source),'backups')));
}
