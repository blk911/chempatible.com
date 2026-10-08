import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createLocalWildHub} from './fixtures/local.mjs';
import {createWildHubHostedHandler} from '../../wild-hub-hosted/server/_wildhub-hosted.mjs';

test('hosted email preview cannot dispatch notification mail or billing jobs; real writes retain scheduling',async()=>{
  const calls={mail:0,reconcile:0,cancel:0,schedule:0},origin='https://preview.example.test';
  const handler=createWildHubHostedHandler({origin,service:async()=>Response.json({ok:true}),
    dispatchNotifications:async()=>{calls.mail++;return {};},
    billing:{reconcileMembershipEvents:async()=>{calls.reconcile++;return {};},runCancellationJobs:async()=>{calls.cancel++;return {};}},
    schedule:promise=>{calls.schedule++;return promise;}
  });
  const post=action=>handler(new Request(origin+'/api/wildhub?action='+action,{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'}));
  assert.equal((await post('invite_email_preview')).status,200);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls,{mail:0,reconcile:0,cancel:0,schedule:0});
  assert.equal((await post('invite_create')).status,200);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls,{mail:1,reconcile:1,cancel:1,schedule:1});
});

test('actual distinct hosts cannot preview another circle or reuse its signed preview; blocked recipients are rechecked',async t=>{
  const origin='http://127.0.0.1:4180',now=()=>Date.parse('2026-10-08T12:00:00Z');
  const f=await createLocalWildHub({origin,sharp:()=>{},now});t.after(()=>f.close());
  const stamp=new Date(now()).toISOString();
  async function host(name){
    const id=randomUUID(),hubId=randomUUID(),token=createHash('sha256').update(id).digest('hex');
    await f.db.query('INSERT INTO wh_users(id,email,verified_at,name,photo_id,acknowledged_at,created_at) VALUES($1,$2,$3,$4,$5,$3,$3)',[id,name+'@example.test',stamp,name,randomUUID()]);
    await f.db.query('INSERT INTO wh_hubs(id,owner_id,slug,name,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$5)',[hubId,id,name.toLowerCase(),name+' circle',stamp]);
    await f.db.query('INSERT INTO wh_sessions(token_hash,user_id,expires_at,created_at) VALUES($1,$2,$3,$4)',[createHash('sha256').update(token).digest('hex'),id,new Date(now()+86400000).toISOString(),stamp]);
    return {id,hubId,async post(action,body){const response=await f.handler(new Request(origin+'/api/wildhub?action='+action,{method:'POST',headers:{origin,'content-type':'application/json',cookie:'wh_session='+token},body:JSON.stringify(body)}));return {status:response.status,...await response.json()};}};
  }
  const first=await host('First'),second=await host('Second');
  const body={hubId:first.hubId,email:'friend@example.test'};
  assert.equal((await second.post('invite_email_preview',body)).error.code,'host_required');
  const before=JSON.stringify((await f.db.query('SELECT * FROM wh_rate_limits ORDER BY key,bucket')).rows);
  const {preview}=await first.post('invite_email_preview',body);
  assert.equal(JSON.stringify((await f.db.query('SELECT * FROM wh_rate_limits ORDER BY key,bucket')).rows),before);
  assert.deepEqual(preview.from,{name:'BsideVibes local preview',email:'hello@bsidevibes.test'});
  assert.equal((await second.post('invite_create',{...body,previewToken:preview.previewToken})).error.code,'host_required');
  assert.equal((await second.post('invite_create',{...body,hubId:second.hubId,previewToken:preview.previewToken})).error.code,'preview_mismatch');
  const recipientId=randomUUID();
  await f.db.query('INSERT INTO wh_users(id,email,verified_at,name,created_at) VALUES($1,$2,$3,$4,$3)',[recipientId,body.email,stamp,'Friend']);
  await f.db.query("INSERT INTO wh_memberships(hub_id,user_id,role,status,created_at,updated_at) VALUES($1,$2,'member','blocked',$3,$3)",[first.hubId,recipientId,stamp]);
  assert.equal((await first.post('invite_create',{...body,previewToken:preview.previewToken})).error.code,'unavailable');
  assert.equal(f.outbox.length,0);
  assert.equal((await f.db.query('SELECT count(*)::int n FROM wh_invites')).rows[0].n,0);
});
