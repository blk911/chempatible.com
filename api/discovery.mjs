import {createHash} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {reviewGate} from './_review.mjs';
import {MODULES,getModule,validateAnswers,scoreAnswers} from './_discovery-modules.mjs';

const hash=s=>createHash('sha256').update(s).digest('hex');
const validId=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const reply=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
// Repeated inside every statement after locks: sessions, lifecycle and standing may
// change between the initial request and a transaction acquiring its locks.
const AUTH=`SELECT m.id FROM members m WHERE m.session_hash=$1 AND m.email_verified_at IS NOT NULL AND m.blocked_at IS NULL AND (m.suspended_until IS NULL OR m.suspended_until<=now())`;
const PAIR=`SELECT i.token_hash,i.sender_member_id,c.prospect_member_id,m.id AS actor,m.name AS actor_name,
 CASE WHEN m.id=i.sender_member_id THEN c.prospect_member_id ELSE i.sender_member_id END AS other
 FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash
 JOIN members m ON m.id IN (i.sender_member_id,c.prospect_member_id)
 WHERE i.token_hash=$2 AND m.id IN (${AUTH}) AND i.channel<>'friend'
 AND i.sender_member_id IS NOT NULL AND c.prospect_member_id IS NOT NULL AND i.sender_member_id<>c.prospect_member_id
 AND c.status IN ('chat','secondResults','email','tests')
 AND NOT EXISTS(SELECT 1 FROM member_blocks b WHERE (b.blocker_id=i.sender_member_id AND b.blocked_id=c.prospect_member_id) OR (b.blocked_id=i.sender_member_id AND b.blocker_id=c.prospect_member_id))
 AND NOT EXISTS(SELECT 1 FROM connection_visibility v WHERE v.invitation_hash=i.token_hash AND (v.trashed_at IS NOT NULL OR v.frozen_at IS NOT NULL))
 AND NOT EXISTS(SELECT 1 FROM members p WHERE p.id IN(i.sender_member_id,c.prospect_member_id) AND (p.blocked_at IS NOT NULL OR p.suspended_until>now()))`;
const match=`invitation_hash=$2 AND module_id=$3 AND version=$4`;
const ownMatch=`${match} AND member_id IN (SELECT actor FROM eligible)`;
const pieceMatch=`module_id=$3 AND version=$4 AND member_id IN (SELECT actor FROM eligible)`;
function eventQuery(key,condition){return `WITH eligible AS (${PAIR}), emitted AS (
 INSERT INTO discovery_events(invitation_hash,module_id,version,event_key)
 SELECT $2,$3,$4,${key} FROM eligible WHERE ${condition}
 ON CONFLICT DO NOTHING RETURNING event_key)
 UPDATE connection_state SET messages=messages||coalesce((SELECT jsonb_agg(jsonb_build_object('by','system','text',$5::text,'gameEvent',event_key,'id','discovery:'||$3||':'||$4||':'||event_key,'at',now())) FROM emitted),'[]'::jsonb),updated_at=CASE WHEN EXISTS(SELECT 1 FROM emitted) THEN now() ELSE updated_at END
 WHERE invitation_hash=$2 AND EXISTS(SELECT 1 FROM emitted)`}
async function pieces(sql,session){
 const rows=await sql.query(`SELECT p.module_id,p.version,p.result,p.completed_at FROM discovery_pieces p WHERE p.member_id IN (${AUTH}) ORDER BY p.completed_at DESC`,[session]);
 return rows.filter(p=>getModule(p.module_id,p.version)).map(p=>({moduleId:p.module_id,version:p.version,title:getModule(p.module_id,p.version).title,result:p.result,completedAt:p.completed_at}));
}
async function view(sql,session,id){
 // One statement, one authorization snapshot. No result from unrelated members.
 const rows=await sql.query(`WITH eligible AS (${PAIR}) SELECT e.actor,e.other,
 coalesce((SELECT jsonb_agg(jsonb_build_object('moduleId',g.module_id,'version',g.version,
 'own',jsonb_build_object('started',op.member_id IS NOT NULL,'answers',coalesce(d.answers,'{}'::jsonb),'draftRevision',coalesce(d.revision,0),'completed',op.completed_at IS NOT NULL,'consent',op.shared_at IS NOT NULL,'result',CASE WHEN op.completed_at IS NOT NULL THEN pp.result ELSE NULL END),
 'other',jsonb_build_object('started',xp.member_id IS NOT NULL,'completed',xp.completed_at IS NOT NULL,'consent',xp.shared_at IS NOT NULL),
 'revealed',op.shared_at IS NOT NULL AND xp.shared_at IS NOT NULL,
 'sharedResults',CASE WHEN op.shared_at IS NOT NULL AND xp.shared_at IS NOT NULL THEN jsonb_build_object('own',pp.result,'other',xpresult.result) ELSE NULL END) ORDER BY g.created_at)
 FROM discovery_games g LEFT JOIN discovery_players op ON op.invitation_hash=g.invitation_hash AND op.module_id=g.module_id AND op.version=g.version AND op.member_id=e.actor
 LEFT JOIN discovery_players xp ON xp.invitation_hash=g.invitation_hash AND xp.module_id=g.module_id AND xp.version=g.version AND xp.member_id=e.other
 LEFT JOIN discovery_drafts d ON d.member_id=e.actor AND d.module_id=g.module_id AND d.version=g.version
 LEFT JOIN discovery_pieces pp ON pp.member_id=e.actor AND pp.module_id=g.module_id AND pp.version=g.version
 LEFT JOIN discovery_pieces xpresult ON xpresult.member_id=e.other AND xpresult.module_id=g.module_id AND xpresult.version=g.version
 WHERE g.invitation_hash=$2),'[]'::jsonb) AS games FROM eligible e`,[session,id]);
 if(!rows[0])return null;
 return {modules:MODULES,games:rows[0].games.filter(g=>getModule(g.moduleId,g.version)).map(g=>({...g,title:getModule(g.moduleId,g.version).title})),pieces:await pieces(sql,session)};
}
async function handler(req){
 const blocked=reviewGate();if(blocked)return blocked;
 if(!process.env.DATABASE_URL)return reply({error:'Discovery games are unavailable.'},503);
 if(!['GET','POST'].includes(req.method))return reply({error:'Method not allowed.'},405);
 const token=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('chempat_member='))?.slice(15);
 if(!validId(token))return reply({error:'Sign in to open your games.',sessionExpired:true},401);
 const session=hash(token),sql=neon(process.env.DATABASE_URL);
 try{
  const actor=(await sql.query(AUTH,[session]))[0]?.id;
  if(!actor)return reply({error:'Sign in with a verified, active member account to open games.'},403);
  const url=new URL(req.url);
  if(req.method==='GET'){
   if(url.searchParams.get('pieces')==='1')return reply({pieces:await pieces(sql,session)});
   const id=url.searchParams.get('connection');if(!validId(id))return reply({error:'Choose an active connection.'},400);
   const data=await view(sql,session,id);return data?reply(data):reply({error:'Games are unavailable for this connection.'},404);
  }
  let body;try{body=await req.json()}catch{return reply({error:'Invalid request.'},400)}
  if(!body||typeof body!=='object'||Array.isArray(body))return reply({error:'Invalid request.'},400);
  const {action,connectionId:id,moduleId}=body,module=getModule(moduleId,body.version);
  if(!validId(id)||!module||!['start','save','complete','share','reuse'].includes(action))return reply({error:'Choose a supported game and action.'},400);
  if(['save','complete'].includes(action)&&!validateAnswers(module,body.answers,{complete:action==='complete'}))return reply({error:'Answer each question using the choices shown.'},400);
  if(['save','complete'].includes(action)&&(!Number.isSafeInteger(body.draftRevision)||body.draftRevision<0||body.draftRevision>2147483646))return reply({error:'Refresh this game before saving your answers.'},400);
  const version=module.version,args=[session,id,moduleId,version];
  const allowed=await sql.query(PAIR,args.slice(0,2));if(!allowed[0])return reply({error:'Games are unavailable for this connection.'},404);
  const statements=[];
  // Every game mutation uses the same member lock order as block/freeze/chat.
  statements.push([`SELECT id FROM members WHERE id IN (SELECT sender_member_id FROM invitations WHERE token_hash=$2 UNION SELECT prospect_member_id FROM connection_state WHERE invitation_hash=$2) OR session_hash=$1 ORDER BY id FOR UPDATE`,args.slice(0,2)]);
  statements.push([`SELECT invitation_hash FROM connection_state WHERE invitation_hash=$1 FOR UPDATE`,[id]]);
  if(['start','reuse'].includes(action)){
   const hasPiece=action==='reuse'?` AND EXISTS(SELECT 1 FROM discovery_pieces WHERE ${pieceMatch})`:'';
   statements.push([`WITH eligible AS (${PAIR}) INSERT INTO discovery_games(invitation_hash,module_id,version) SELECT $2,$3,$4 FROM eligible WHERE true${hasPiece} ON CONFLICT DO NOTHING`,args]);
   statements.push([`WITH eligible AS (${PAIR}) INSERT INTO discovery_players(invitation_hash,module_id,version,member_id) SELECT $2,$3,$4,actor FROM eligible WHERE EXISTS(SELECT 1 FROM discovery_games WHERE ${match})${hasPiece} ON CONFLICT DO NOTHING`,args]);
  }
  const saveIndex=statements.length;
  if(['save','complete'].includes(action)){
   const save=`INSERT INTO discovery_drafts(member_id,module_id,version,answers,revision) SELECT actor,$3,$4,$5::jsonb,1 FROM eligible WHERE EXISTS(SELECT 1 FROM discovery_players WHERE ${ownMatch} AND completed_at IS NULL) AND NOT EXISTS(SELECT 1 FROM discovery_pieces WHERE ${pieceMatch}) AND ($6::integer=0 OR EXISTS(SELECT 1 FROM discovery_drafts WHERE ${pieceMatch})) ON CONFLICT(member_id,module_id,version) DO UPDATE SET answers=excluded.answers,revision=discovery_drafts.revision+1,updated_at=now() WHERE discovery_drafts.revision=$6 RETURNING member_id`;
   if(action==='save')statements.push([`WITH eligible AS (${PAIR}) ${save}`,[...args,JSON.stringify(body.answers),body.draftRevision]]);
   else{
    statements.push([`WITH eligible AS (${PAIR}),saved AS (${save}),earned AS (INSERT INTO discovery_pieces(member_id,module_id,version,result) SELECT member_id,$3,$4,$7::jsonb FROM saved ON CONFLICT DO NOTHING RETURNING member_id) UPDATE discovery_players SET completed_at=coalesce(completed_at,now()) WHERE ${ownMatch} AND member_id IN(SELECT member_id FROM earned) RETURNING member_id`,[...args,JSON.stringify(body.answers),body.draftRevision,JSON.stringify(scoreAnswers(module,body.answers))]]);
   }
  }
  if(['reuse','share'].includes(action))statements.push([`WITH eligible AS (${PAIR}) UPDATE discovery_players SET completed_at=coalesce(completed_at,now()),shared_at=coalesce(shared_at,now()) WHERE ${ownMatch} AND EXISTS(SELECT 1 FROM discovery_pieces WHERE ${pieceMatch})${action==='share'?' AND completed_at IS NOT NULL':''}`,args]);
  const own=`EXISTS(SELECT 1 FROM discovery_players WHERE ${ownMatch}`;
  statements.push([eventQuery(`'started:'||actor::text`,`${own})`),[...args,`${allowed[0].actor_name} started ${module.title}.`]]);
  statements.push([eventQuery(`'finished:'||actor::text`,`${own} AND completed_at IS NOT NULL)`),[...args,`${allowed[0].actor_name} finished ${module.title}. Results stay private until you both choose to share.`]]);
  statements.push([eventQuery(`'reveal-ready'`,`(SELECT count(*) FROM discovery_players WHERE ${match} AND member_id IN(eligible.actor,eligible.other) AND shared_at IS NOT NULL)=2`),[...args,`${module.title}: your shared reveal is ready.`]]);
  const results=await sql.transaction(tx=>statements.map(([query,params])=>tx.query(query,params)),{isolationLevel:'ReadCommitted'});
  if(action==='save'&&!results[saveIndex]?.length)return reply({error:'Your saved answers changed or this piece is already complete. Reload the game before saving again.',draftConflict:true},409);
  const data=await view(sql,session,id);if(!data)return reply({error:'This connection changed. Return to My Page.'},409);
  const game=data.games.find(g=>g.moduleId===moduleId&&g.version===version);
  if(action==='complete'&&!results[saveIndex]?.length&&!game?.own.completed)return reply({error:'Your saved answers changed or a piece was already earned. Reload the game before continuing.',draftConflict:true},409);
  if(!game?.own.started||(['complete','reuse','share'].includes(action)&&!game.own.completed)||(['reuse','share'].includes(action)&&!game.own.consent))return reply({error:action==='reuse'?'Complete this game once before offering your piece.':'Start this game before continuing.'},409);
  return reply(data);
 }catch(error){console.error('Discovery error:',error);return reply({error:'Could not load or save games. Try again.'},500)}
}
export default {fetch:handler};
