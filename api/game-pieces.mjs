import {createHash} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {deploymentMode} from './_deployment.mjs';
import {expectedRewardMember,bindRewardMember} from './_reward-auth.mjs';
import {connectionInboxView} from './connection.mjs';
import {GAME_PIECE_AUTH as AUTH,GAME_PIECE_ELIGIBLE as ELIGIBLE,gamePieceConnectionQuery,gamePiece} from './_game-pieces.mjs';
const reply=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
const validVisit=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(value);
const validId=value=>typeof value==='string'&&/^[1-9][0-9]{0,18}$/.test(value)&&BigInt(value)<=9223372036854775807n;
async function body(req){
 const declared=req.headers.get('content-length');
 const tooLarge=()=>Object.assign(Error('Too large'),{status:413});
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>2048))throw tooLarge();
 if(!req.body)throw Error('Empty');
 const reader=req.body.getReader(),chunks=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>2048){await reader.cancel().catch(()=>{});throw tooLarge()}chunks.push(Buffer.from(value))}}finally{reader.releaseLock()}
 return JSON.parse(Buffer.concat(chunks,length).toString('utf8'));
}
async function handler(req){
 if(deploymentMode()==='blocked'||!process.env.DATABASE_URL)return reply({error:'Game pieces are unavailable until this deployment is configured.'},503);
 if(!['GET','POST'].includes(req.method))return reply({error:'Method not allowed.'},405);
 const token=(req.headers.get('cookie')||'').match(/(?:^|;\s*)chempat_member=([a-f0-9]{64})(?:;|$)/)?.[1];
 if(!token)return reply({error:'Sign in to see your game pieces.',sessionExpired:true},401);
 const session=createHash('sha256').update(token).digest('hex');let sql=neon(process.env.DATABASE_URL);
 try{
  const actor=(await sql.query(AUTH,[session]))[0];
  if(!actor)return reply({error:'Use your verified, active member account.',sessionExpired:true},403);
  if(!expectedRewardMember(req,actor.id))return reply({error:'Your signed-in account changed. Refresh your page.',sessionExpired:true},403);
  sql=bindRewardMember(sql,actor.id);
  if(req.method==='GET'){
   const params=new URL(req.url).searchParams,visit=params.get('visit'),after=params.get('after');if(!validVisit(visit)||(after!==null&&!validId(after)))return reply({error:'Reload your page to see game pieces.'},400);
   if(params.has('piece')||params.has('connection')||params.has('refresh')){
    const pieceId=params.get('piece'),connectionId=params.get('connection'),refresh=params.get('refresh');
    if((refresh!==null&&refresh!=='1')||after!==null||!validId(pieceId)||!/^[a-f0-9]{64}$/.test(connectionId||''))return reply({error:'Choose a current game piece connection.'},400);
    const row=(await sql.query(gamePieceConnectionQuery(refresh==='1'),[session,pieceId,connectionId]))[0];
    return row?reply({...(!refresh?{piece:gamePiece(row.hydrated_piece,visit)}:{}),connection:connectionInboxView(row,actor.id)}):reply({error:'This game piece is no longer available.'},404);
   }
   // The outer actor row distinguishes a lost session from an empty feed. IDs
   // are text before JSON conversion, preserving bigint precision in browsers.
   const row=(await sql.query(`WITH owner AS (${AUTH}),eligible AS (${ELIGIBLE}) SELECT coalesce((SELECT jsonb_agg(to_jsonb(q)||jsonb_build_object('id',q.id::text) ORDER BY q.id) FROM (SELECT * FROM eligible WHERE handled_at IS NULL AND id>$2::bigint ORDER BY id LIMIT 101) q),'[]'::jsonb) AS pieces,(SELECT count(*)::integer FROM eligible WHERE handled_at IS NULL) AS pending_count FROM owner`,[session,after||'0']))[0];
   return row?reply({pieces:row.pieces.slice(0,100).map(piece=>gamePiece(piece,visit)),pendingCount:row.pending_count,nextCursor:row.pieces.length>100?String(row.pieces[99].id):null}):reply({error:'Your sign-in changed. Refresh your page.',sessionExpired:true},403);
  }
  const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return reply({error:'Open your member page to manage game pieces.'},403);
  if((req.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='application/json')return reply({error:'Use the game piece controls.'},415);
  let input;try{input=await body(req)}catch(error){return reply({error:error.status===413?'Request too large.':'Invalid request.'},error.status||400)}
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['action','id','version','visit','receiptRevision'].includes(key))||!['seen','hold','handled'].includes(input.action)||!validId(input.id)||input.version!==1||!Number.isInteger(input.receiptRevision)||input.receiptRevision<0||input.receiptRevision>2147483646||!validVisit(input.visit))return reply({error:'Choose a current game piece.'},400);
  const piece=(await sql.query(`WITH eligible AS (${ELIGIBLE}) SELECT id::text,invitation_hash,sender_member_id,prospect_member_id FROM eligible WHERE id=$2::bigint AND version=$3`,[session,input.id,input.version]))[0];
  if(!piece)return reply({error:'This game piece is no longer available.'},404);
  const results=await sql.transaction(tx=>[
   tx.query('SELECT id FROM members WHERE id IN($1::uuid,$2::uuid) ORDER BY id FOR UPDATE',[piece.sender_member_id,piece.prospect_member_id]),
   tx.query('SELECT invitation_hash FROM connection_state WHERE invitation_hash=$1 FOR UPDATE',[piece.invitation_hash]),
   tx.query(`WITH eligible AS (${ELIGIBLE}) UPDATE game_piece_events e SET receipt_revision=CASE WHEN e.handled_at IS NOT NULL THEN e.receipt_revision ELSE e.receipt_revision+1 END,observed_at=coalesce(e.observed_at,now()),handled_at=CASE WHEN $4='handled' THEN coalesce(e.handled_at,now()) ELSE e.handled_at END,held_visit=CASE WHEN e.handled_at IS NOT NULL OR $4='handled' THEN NULL WHEN $4='hold' THEN $5 WHEN $4='seen' THEN NULL ELSE e.held_visit END FROM eligible x WHERE e.id=x.id AND e.id=$2::bigint AND e.version=$3 AND (e.handled_at IS NOT NULL OR $4='handled' OR e.receipt_revision=$6) RETURNING e.id::text,e.receipt_revision`,[session,input.id,input.version,input.action,input.visit,input.receiptRevision])
  ],{isolationLevel:'ReadCommitted'});
  return results[2].length?reply({ok:true,receiptRevision:results[2][0].receipt_revision}):reply({error:'This game piece or sign-in changed. Refresh your page.',receiptConflict:true},409);
 }catch(error){console.error('Game piece request failed.');return reply({error:'Could not load or save your game pieces. Try again.'},503)}
}
export default {fetch:handler};
