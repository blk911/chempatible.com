import assert from 'node:assert/strict';
import fs from 'node:fs';
const files=['api/_ops.mjs','api/admin.mjs','api/email.mjs','api/member.mjs','game.js','index.html','privacy.html','terms.html','admin-login.html','admin/index.html','admin.js','admin-ops.js'];
for(const file of files){const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');assert.doesNotMatch(source,/chem-PATIBLE|chem-<span>PATIBLE/,file+' retains old visible branding')}
for(const file of ['api/_ops.mjs','api/email.mjs']){const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');assert.match(source,/from:\{email:'hello@chempatible\.com',name:'Chem-patible'\}/,'generated sender name');}
for(const file of ['api/member.mjs','api/admin.mjs','api/email.mjs'])assert.match(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),/is your Chem-patible (?:admin )?code/,'generated subject spelling');
const game=fs.readFileSync(new URL('../game.js',import.meta.url),'utf8');assert.match(game,/const action=button\('Send an invitation →','createMyVibe\(\)'\)/,'CTA preserves tap-only invitation action');assert.match(game,/>Caught their vibe\?</,'approved helper line');
console.log('Generated email/UI brand spelling and approved invitation CTA passed');
