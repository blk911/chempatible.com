import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {neon} from '@neondatabase/serverless';

const hash=value=>createHash('sha256').update(value).digest('hex');
const reply=(body,status=200,headers={})=>Response.json(body,{status,headers:{'cache-control':'no-store',...headers}});
const validPhoto=value=>typeof value==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value)&&value.length<250000;
const validAnswers=value=>Array.isArray(value)&&[0,5,10].includes(value.length)&&value.every(answer=>Number.isInteger(answer)&&answer>=0&&answer<=2);
const validContact=value=>value.length<=255&&(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)||(value.length<=30&&value.replace(/\D/g,'').length>=10));
let schemaReady;
function ensureSchema(sql){
 if(!schemaReady)schemaReady=sql`CREATE TABLE IF NOT EXISTS members (
   id uuid PRIMARY KEY,
   session_hash text NOT NULL UNIQUE,
   name text NOT NULL,
   contact text NOT NULL,
   photo text NOT NULL,
   answers jsonb NOT NULL DEFAULT '[]'::jsonb,
   created_at timestamptz NOT NULL DEFAULT now(),
   updated_at timestamptz NOT NULL DEFAULT now()
 )`.catch(error=>{schemaReady=undefined;throw error});
 return schemaReady;
}
function tokenFrom(req){
 const match=(req.headers.get('cookie')||'').match(/(?:^|;\s*)chempat_member=([a-f0-9]{64})(?:;|$)/);
 return match?.[1]||null;
}
async function handler(req){
 if(!process.env.DATABASE_URL)return reply({error:'Member storage is unavailable.'},503);
 const sql=neon(process.env.DATABASE_URL);
 try{
  await ensureSchema(sql);
  const token=tokenFrom(req);
  if(req.method==='GET'){
   if(!token)return reply({error:'No member on this device.'},401);
   const rows=await sql`SELECT id,name,contact,photo,answers FROM members WHERE session_hash=${hash(token)}`;
   return rows[0]?reply({member:rows[0]}):reply({error:'Member not found.'},404);
  }
  if(req.method!=='POST')return reply({error:'Method not allowed.'},405);
  let body;try{body=await req.json()}catch{return reply({error:'Invalid request.'},400)}
  if(body.action==='register'){
   const name=String(body.name||'').trim(),contact=String(body.contact||'').trim().toLowerCase(),photo=body.photo,answers=body.answers||[];
   if(name.length<1||name.length>50||!validContact(contact)||!validPhoto(photo)||!validAnswers(answers))return reply({error:'Add your first name, contact, and picture.'},400);
   if(token){
    const existing=await sql`SELECT contact FROM members WHERE session_hash=${hash(token)}`;
    if(existing[0]&&existing[0].contact!==contact)return reply({error:'This device already has a different member page. Open this invitation in a private window.'},409);
    const rows=await sql`UPDATE members SET name=${name},contact=${contact},photo=${photo},answers=CASE WHEN jsonb_array_length(answers)>${answers.length} THEN answers ELSE ${JSON.stringify(answers)}::jsonb END,updated_at=now() WHERE session_hash=${hash(token)} RETURNING id,name,contact,photo,answers`;
    if(rows[0])return reply({member:rows[0]});
   }
   const fresh=randomBytes(32).toString('hex');
   const rows=await sql`INSERT INTO members(id,session_hash,name,contact,photo,answers) VALUES(${randomUUID()},${hash(fresh)},${name},${contact},${photo},${JSON.stringify(answers)}::jsonb) RETURNING id,name,contact,photo,answers`;
   return reply({member:rows[0]},200,{'set-cookie':`chempat_member=${fresh}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=15552000`});
  }
  if(body.action==='answers'){
   if(!token)return reply({error:'Join the game first.'},401);
   if(!validAnswers(body.answers)||body.answers.length!==10)return reply({error:'Answer all ten to finish your page.'},400);
   const rows=await sql`UPDATE members SET answers=${JSON.stringify(body.answers)}::jsonb,updated_at=now() WHERE session_hash=${hash(token)} RETURNING id,name,contact,photo,answers`;
   return rows[0]?reply({member:rows[0]}):reply({error:'Member not found.'},404);
  }
  return reply({error:'Unknown action.'},400);
 }catch(error){console.error('Member error:',error);return reply({error:'Could not save your page. Try again.'},500)}
}
export default {fetch:handler};
