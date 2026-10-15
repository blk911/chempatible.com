import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ensureConnectionSchema} from '../api/connection-schema.mjs';
import {ensureQrSchema} from '../api/qr-schema.mjs';

let calls=0;
const sql=async(strings)=>{
 calls++;
 assert.match(strings.join(''),/CREATE TABLE IF NOT EXISTS connection_state/);
 if(calls===1)throw Error('temporary database failure');
 return [];
};
await assert.rejects(ensureConnectionSchema(sql),/temporary database failure/);
await Promise.all([ensureConnectionSchema(sql),ensureConnectionSchema(sql)]);
await ensureConnectionSchema(sql);
assert.equal(calls,2);
const migrations=[];
await Promise.all([ensureQrSchema(async strings=>{migrations.push(strings.join(''));return []}),ensureQrSchema(async()=>{throw Error('Should reuse the migration promise')})]);
assert.equal(migrations.length,4);
assert(migrations.some(query=>query.includes('sender_member_id')));
assert(migrations.some(query=>query.includes('claim_hash')));
console.log('Connection schema recovery and caching passed');

// Every live member authorization must use the revocable session authority.
// The compatibility column remains only for legacy capture and account creation.
for (const name of fs.readdirSync(new URL('../api/',import.meta.url)).filter(name=>name.endsWith('.mjs'))) {
 const source=fs.readFileSync(new URL('../api/'+name,import.meta.url),'utf8');
 assert.doesNotMatch(source,/(?:\b(?:WHERE|AND|OR|ON)\s+|\bSET\s+)(?:[a-z_]+\.)?session_hash\s*=/i,name+' cannot authorize or rotate via the legacy member hash');
}
const binder=fs.readFileSync(new URL('../api/_reward-auth.mjs',import.meta.url),'utf8');
assert.ok(binder.includes("query.replaceAll('m.id=duhwild_session_member($1)'"),'reward identity binding follows the central session authority');
console.log('All API member authorization uses revocable session lookup; reward binding remains attached');
