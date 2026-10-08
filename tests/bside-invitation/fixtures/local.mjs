import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createWildHubService} from '../../../wild-hub-hosted/server/_wildhub-service.mjs';

/** Fresh local-only SQL state and fake mail. The outbox is trusted process memory,
 * never an HTTP route. Nothing here reads production environment variables.
 * Callers provide sharp from their declared dependency; tests may inject it.
 */
export async function createLocalWildHub({origin='http://127.0.0.1:4180',sharp,now,emailAllowed=address=>address.endsWith('.test'),mail,onError,getClientKey,readPaidEntitlement,readCreatorFinance,scheduleNotifications,profileLinks=true}={}) {
  const db=new PGlite();
  await db.exec(await readFile(new URL('./001-base.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('./004-notifications.sql',import.meta.url),'utf8'));
  if(profileLinks)await db.exec(await readFile(new URL('./005-profile-links.sql',import.meta.url),'utf8'));
  const outbox=[],acceptedKeys=new Set();
  const fakeMail=mail||{deliveryMode:'simulated',supportsIdempotency:true,sender:{name:'BsideVibes local preview',email:'hello@bsidevibes.test'},async send(message){if(message.idempotencyKey&&acceptedKeys.has(message.idempotencyKey))return {accepted:true};outbox.push({...message});if(message.idempotencyKey)acceptedKeys.add(message.idempotencyKey);return {accepted:true};}};
  const handler=createWildHubService({db,mail:fakeMail,origin,sharp,secret:randomBytes(32).toString('hex'),secureCookies:false,emailAllowed,now,onError,getClientKey,readPaidEntitlement,readCreatorFinance,scheduleNotifications});
  return {handler,db,outbox,dispatchNotifications:handler.dispatchNotifications,close:()=>db.close()};
}
