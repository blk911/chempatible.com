import assert from 'node:assert/strict';
import {ensureConnectionSchema} from '../api/connection-schema.mjs';

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
console.log('Connection schema recovery and caching passed');
