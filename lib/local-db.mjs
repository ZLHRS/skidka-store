import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdirSync} from 'node:fs';
export function localDB(path=':memory:'){
 const sqlite=new DatabaseSync(path);sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
 if(!sqlite.prepare("SELECT name FROM sqlite_master WHERE name='accounts'").get())sqlite.exec(readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'));
 sqlite.exec('CREATE TABLE IF NOT EXISTS user_catalogs (user_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, value TEXT NOT NULL);');
 const wrap=(sql,values=[])=>({bind(...args){return wrap(sql,args)},async first(){return sqlite.prepare(sql).get(...values)||null},async all(){return {results:sqlite.prepare(sql).all(...values)}},async run(){return sqlite.prepare(sql).run(...values)}});
 return {prepare:sql=>wrap(sql),async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}},close:()=>sqlite.close()};
}
