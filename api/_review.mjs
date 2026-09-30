// This branch is a review build. Fail closed before any database or mail access.
// Enable ONLY after configuring a separate disposable database and test mail.
export function reviewGate(){
 if(process.env.CHEMPAT_REVIEW_DATA==='isolated-confirmed')return null;
 return Response.json({error:'Review preview: account, invitation and messaging actions are disabled until an isolated test database is configured.',reviewOnly:true},{status:503,headers:{'cache-control':'no-store'}});
}
