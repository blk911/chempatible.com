// Bind the request's verified account identity to every later AUTH projection.
// This protects a stale tab's consent when another tab signs into another account,
// and prevents a token reassignment during a lock wait from changing the target.
export function expectedRewardMember(req,memberId){
 const expected=req.headers.get('x-chempat-member-id');
 return req.method==='POST'?expected===memberId:expected===null||expected===memberId;
}
export function bindRewardMember(sql,memberId){
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(memberId))throw Error('Invalid member identity');
 const scope=query=>query.replaceAll('m.session_hash=$1',`m.session_hash=$1 AND m.id='${memberId}'::uuid`);
 return {query:(query,params)=>sql.query(scope(query),params),transaction:(build,options)=>sql.transaction(tx=>build({query:(query,params)=>tx.query(scope(query),params)}),options)};
}
