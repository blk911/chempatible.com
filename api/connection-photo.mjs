import {createHash} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {reviewGate} from './_review.mjs';

const validId=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin'};
const error=(message,status)=>Response.json({error:message},{status,headers});
async function handler(req){
 const blocked=reviewGate();if(blocked)return blocked;
 if(!['GET','HEAD'].includes(req.method))return error('Method not allowed.',405);
 const token=(req.headers.get('cookie')||'').match(/(?:^|;\s*)chempat_member=([a-f0-9]{64})(?:;|$)/)?.[1];
 if(!validId(token))return error('Sign in to view connection history.',401);
 const id=new URL(req.url).searchParams.get('id');
 if(!validId(id))return error('Photo not found.',404);
 if(!process.env.DATABASE_URL)return error('Connection storage is unavailable.',503);
 const sql=neon(process.env.DATABASE_URL);
 try{
  // Snapshot photos belong to the participants' history. Never look up a
  // recipient's private profile from a typed email or an unaccepted target ID.
  const rows=await sql`SELECT CASE WHEN i.sender_member_id=m.id THEN c.prospect_photo ELSE i.sender_photo END AS photo
   FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash
   JOIN members m ON m.session_hash=${createHash('sha256').update(token).digest('hex')}
   WHERE i.token_hash=${id} AND (i.sender_member_id=m.id OR c.prospect_member_id=m.id)`;
  const photo=rows[0]?.photo;
  if(typeof photo!=='string'||photo.length>=250000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo))return error('Photo not found.',404);
  const bytes=Buffer.from(photo.slice('data:image/jpeg;base64,'.length),'base64');
  if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8||bytes.at(-2)!==0xff||bytes.at(-1)!==0xd9)return error('Photo not found.',404);
  return new Response(req.method==='HEAD'?null:bytes,{headers:{...headers,'content-type':'image/jpeg','content-length':String(bytes.length)}});
 }catch{return error('Could not load this photo.',503)}
}
export default {fetch:handler};
