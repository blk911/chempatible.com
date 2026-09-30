// This branch is a review build. Fail closed before any database or mail access.
// Enable ONLY after configuring a separate disposable database and test mail.
export function reviewGate(){
 if(process.env.CHEMPAT_REVIEW_DATA==='isolated-confirmed')return null;
 return Response.json({error:'Review preview: account, invitation and messaging actions are disabled until an isolated test database is configured.',reviewOnly:true},{status:503,headers:{'cache-control':'no-store'}});
}

// Review mail is limited to exact, explicitly approved inboxes. No domain wildcards.
export function reviewRecipientAllowed(value){
 if(typeof value!=='string')return false;
 const email=value.trim().toLowerCase();
 if(!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email))return false;
 const allowed=(process.env.CHEMPAT_REVIEW_EMAILS||'').split(',').map(x=>x.trim().toLowerCase());
 return allowed.includes(email);
}
export function requireReviewRecipient(value){
 if(!reviewRecipientAllowed(value))throw Error('Review email is limited to approved test recipients.');
}
