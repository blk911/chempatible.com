import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
let sent=[],invitation=null,connected=false;const session='b'.repeat(64),sessionHash=createHash('sha256').update(session).digest('hex');
async function sql(strings,...v){const q=strings.join('?').replace(/\s+/g,' ');
 if(q.includes('SELECT email FROM email_sessions'))return v[0]===sessionHash?[{email:'cindy@example.com'}]:[];
 if(q.includes('INSERT INTO invitations')){invitation=v;return []}
 if(q.includes('INSERT INTO connection_state')){connected=true;return []}
 if(q.includes('DELETE FROM invitations')){invitation=null;return []}
 throw Error('Unexpected SQL '+q)}
let src=fs.readFileSync(new URL('../api/email.mjs',import.meta.url),'utf8').replace("import {neon} from '@neondatabase/serverless';",'const neon=()=>globalThis.__sql;');globalThis.__sql=sql;process.env.DATABASE_URL='postgres://test';process.env.SENDGRID_API_KEY='test';process.env.CHEMPAT_FROM_EMAIL='hello@chempatible.com';globalThis.fetch=async(u,opt)=>{sent.push(JSON.parse(opt.body));return {ok:true,status:202}};
const {default:api}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const req=new Request('https://chempatible.com/api/email',{method:'POST',headers:{cookie:'chempat_session='+session,'content-type':'application/json'},body:JSON.stringify({action:'send',member:{name:'Cindy',photo:'data:image/jpeg;base64,AA==',answers:[0,1,2,0,1,2,0,1,2,0]},recipient:{name:'Mike',email:'mike@example.com'}})});
const r=await api.fetch(req),result=await r.json();assert.equal(r.status,200);assert.match(result.id,/^[a-f0-9]{64}$/);assert(connected);assert(invitation);assert.equal(sent[0].personalizations[0].to[0].email,'mike@example.com');assert.equal(sent[0].from.email,'hello@chempatible.com');assert.match(sent[0].content[1].value,/Let’s talk!/);assert.equal(sent[0].attachments[0].content_id,'inviter-photo');console.log('Email send payload and invitation storage passed');
