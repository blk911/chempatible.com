import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Deployment/route closure: a working local editor is insufficient if its
// handler or a transitive API helper is excluded from the deployed artifact.
const root=fileURLToPath(new URL('../',import.meta.url));
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const deployed=new Set(read('.vercelignore').split('\n').filter(line=>line.startsWith('!/')).map(line=>line.slice(2)));
const publicPages=['index.html','friend.html'];
for(const name of publicPages){
 const html=read(name);
 for(const match of html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))(?:\?[^"']*)?["']/g)){
  if(/^(?:https?:|data:)/.test(match[1]))continue;
  const target=path.posix.normalize(path.posix.join(path.posix.dirname(name),match[1].replace(/^\//,'')));
  assert.ok(fs.existsSync(path.join(root,target)),`${name} asset exists: ${target}`);
  assert.ok(deployed.has(target),`${name} asset deploys: ${target}`);
 }
}

const client=read('game.js'),routes=new Set();
for(const match of client.matchAll(/['"`]\/api\/([a-z][a-z-]*)(?:[?'"`])/g))routes.add(match[1]);
assert.ok(routes.has('member-profile'),'the shipped game reaches the profile API');
assert.ok(routes.has('rewards'),'private phone keeps the existing reward API');
for(const name of routes){
 const endpoint=`api/${name}.mjs`;
 assert.ok(fs.existsSync(path.join(root,endpoint)),`client route resolves: ${endpoint}`);
 assert.ok(deployed.has(endpoint),`client route deploys: ${endpoint}`);
}
const checked=new Set();
function checkImports(name){
 if(checked.has(name))return;
 checked.add(name);
 assert.ok(deployed.has(name),`runtime module deploys: ${name}`);
 for(const match of read(name).matchAll(/(?:from\s*|import\s*)['"](\.\/[^'"]+\.mjs)['"]/g)){
  const target=path.posix.normalize(path.posix.join(path.posix.dirname(name),match[1]));
  assert.ok(fs.existsSync(path.join(root,target)),`runtime dependency exists: ${name} -> ${target}`);
  checkImports(target);
 }
}
for(const name of routes)checkImports(`api/${name}.mjs`);
for(const name of ['api/member-profile.mjs','api/_connection-identity.mjs'])checkImports(name);

// Both permitted deployment modes still reject anonymous profile access; an
// invalid deployment fails closed before contacting a database or mail service.
const keys=['CHEMPAT_RELEASE_MODE','VERCEL','VERCEL_PROJECT_ID','VERCEL_ENV','VERCEL_GIT_COMMIT_REF','CHEMPAT_REVIEW_DATA'];
const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
const configure=values=>{for(const key of keys)delete process.env[key];Object.assign(process.env,values)};
const originalFetch=globalThis.fetch;
let networkCalls=0;
globalThis.fetch=async()=>{networkCalls++;throw Error('Unexpected network request in route guard test')};
process.env.DATABASE_URL='postgres://synthetic-route-guard-no-connection';
const api=(await import('../api/member-profile.mjs')).default;
const request=method=>new Request('https://synthetic.example/api/member-profile',{method,headers:{'content-type':'application/json','x-chempat-member-id':'11111111-1111-4111-8111-111111111111'},...(method==='POST'?{body:JSON.stringify({action:'save',name:'Synthetic',profileRevision:'0'.repeat(64),photo:'',updateDiscovery:false})}:{})});
try{
 for(const values of [{},{CHEMPAT_RELEASE_MODE:'live',VERCEL:'1',VERCEL_PROJECT_ID:'prj_development',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'live'}]){
  configure(values);
  for(const method of ['GET','POST'])assert.equal((await api.fetch(request(method))).status,503,`${method} blocked deployment`);
 }
 for(const values of [{CHEMPAT_REVIEW_DATA:'isolated-confirmed'},{CHEMPAT_RELEASE_MODE:'live',VERCEL:'1',VERCEL_PROJECT_ID:'prj_gtV01YIqkEfAfvdSbVopIfy2VpnJ',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'live'}]){
  configure(values);
  for(const method of ['GET','POST']){
   const response=await api.fetch(request(method));
   assert.equal(response.status,401,`${method} needs a member session`);
   assert.match(response.headers.get('cache-control')||'',/no-store/);
  }
 }
 assert.equal(networkCalls,0,'route guards do not contact data or mail services');
}finally{
 for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}
 globalThis.fetch=originalFetch;
}
console.log(`Profile route closure passed: ${routes.size} client endpoints, ${checked.size} deployed API modules, review/live/blocked authentication guards`);
