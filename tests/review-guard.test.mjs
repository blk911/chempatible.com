import assert from 'node:assert/strict';
import fs from 'node:fs';
import {reviewGate} from '../api/_review.mjs';
delete process.env.CHEMPAT_REVIEW_DATA;
assert.equal(reviewGate().status,503);
process.env.CHEMPAT_REVIEW_DATA='true';
assert.equal(reviewGate().status,503);
process.env.CHEMPAT_REVIEW_DATA='isolated-confirmed';
assert.equal(reviewGate(),null);
delete process.env.CHEMPAT_REVIEW_DATA;
process.env.DATABASE_URL='postgres://must-not-connect';
process.env.SENDGRID_API_KEY='must-not-send';
let networkCalls=0;globalThis.fetch=async()=>{networkCalls++;throw Error('Review gate attempted network access')};
// Every callable endpoint must fail closed before connecting to data services.
for(const name of ['admin','connection','email','member','qr']){
 const api=(await import(`../api/${name}.mjs`)).default;
 for(const method of ['GET','POST']){const response=await api.fetch(new Request(`https://review.example/api/${name}`,{method,...(method==='POST'?{headers:{'content-type':'application/json'},body:JSON.stringify({action:'register'})}:{})}));assert.equal(response.status,503,`${name} ${method}: blocked`);assert.equal((await response.json()).reviewOnly,true)}
 const source=fs.readFileSync(new URL(`../api/${name}.mjs`,import.meta.url),'utf8');
 const gate=source.indexOf('const blocked=reviewGate();if(blocked)return blocked;');
 assert.ok(gate>0,`${name}: review gate installed`);
 const handler=source.indexOf(name==='qr'?'export default {async fetch(req){':'async function handler(req){');
 assert.ok(gate>handler,`${name}: gate is at request boundary`);
 assert.ok(gate<source.indexOf('neon(process.env.DATABASE_URL)',handler),`${name}: no database access before gate`);
}
assert.equal(networkCalls,0);
console.log('All review APIs fail closed before database/mail access');
