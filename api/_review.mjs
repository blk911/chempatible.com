import {deploymentMode} from './_deployment.mjs';

// Fail closed before database/mail access unless review isolation is explicitly
// confirmed or the separately approved public deployment is in trusted live mode.
export function reviewGate(){
 if(deploymentMode()!=='blocked')return null;
 return Response.json({error:'Account, invitation and messaging actions are disabled until this deployment is configured.',reviewOnly:true},{status:503,headers:{'cache-control':'no-store'}});
}

// Review mail is limited to exact, explicitly approved inboxes. No domain wildcards.
export function reviewRecipientAllowed(value){
 if(typeof value!=='string')return false;
 const email=value.trim().toLowerCase();
 if(email.length>254||!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email))return false;
 const mode=deploymentMode();
 if(mode==='live')return true;
 if(mode!=='review')return false;
 const allowed=(process.env.CHEMPAT_REVIEW_EMAILS||'').split(',').map(x=>x.trim().toLowerCase());
 return allowed.includes(email);
}
export function requireReviewRecipient(value){
 if(!reviewRecipientAllowed(value))throw Error('Review email is limited to approved test recipients.');
}
