import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const files=['api/_ops.mjs','api/admin.mjs','api/email.mjs','api/friend.mjs','api/member.mjs','game.js','index.html','friend.html','admin-login.html','admin/index.html','admin.js','admin-ops.js'];
for(const file of files){const source=read(file);assert.doesNotMatch(source,/Chem-patible|chem-PATIBLE|Chem-<em>patible|brand-logo\.png/,file+' retains old visible branding');assert.doesNotMatch(source,/duhwild\.com/i,file+' must keep the existing domain');}
for(const file of ['api/_ops.mjs','api/email.mjs','api/friend.mjs'])assert.match(read(file),/from:\{email:'hello@chempatible\.com',name:'Duh Wild'\}/,'new display name preserves verified sender');
for(const file of ['api/member.mjs','api/admin.mjs','api/email.mjs'])assert.match(read(file),/is your Duh Wild (?:admin )?code/,'generated subject spelling');
const game=read('game.js');assert.match(game,/button\('IN DUH WILD →','createMyVibe\(\)'\)/,'existing explicit invitation action');assert.match(game,/Catch a vibe\.<br>In Duh Wild\./,'trial headline');assert.match(game,/const KEY='chempatibility\.walkthrough\.v7'/,'saved state key retained');
for(const file of ['index.html','friend.html','privacy.html','terms.html','admin-login.html','admin/index.html']){const source=read(file);assert.match(source,/class="brandWordmark">Duh <em>Wild<\/em>/,'consistent wordmark');assert.doesNotMatch(source,/<img[^>]+brand-logo/,'old raster logo is not rendered');}
assert.match(read('terms.html'),/These Terms are an agreement between you and Chem-patible/,'legal counterparty preserved');assert.match(read('privacy.html'),/This policy explains how Chem-patible/,'existing operator preserved');
for(const file of ['privacy.html','terms.html'])assert.match(read(file),/mailto:hello@chempatible\.com/,'real support address preserved');
for(const file of ['index.html','friend.html']){assert.match(read(file),/https:\/\/chempatible\.com\/duh-wild-og\.png/,'branded social image on unchanged domain');assert.match(read(file),/\/duh-wild-icon\.png/);}
const allowlist=read('.vercelignore');for(const file of ['duh-wild-og.png','duh-wild-icon.png','duh-wild-apple.png']){assert.ok(allowlist.split('\n').includes('!/'+file));const bytes=fs.readFileSync(new URL('../'+file,import.meta.url));assert.equal(bytes.subarray(1,4).toString(),'PNG');}
for(const old of ['brand-logo.png','og-image.png','favicon.png','apple-touch-icon.png'])assert.ok(!allowlist.split('\n').includes('!/'+old),'obsolete brand bitmap stays out of deployment');
console.log('Duh Wild trial branding, generated mail, wordmarks/assets, unchanged domain/sender, legal operator, and state keys passed');
