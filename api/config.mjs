import {isTrustedLive} from './_deployment.mjs';

// Public presentation only. No secrets, identities, allowlists, or DB access.
export default {fetch(req){
 const headers={'cache-control':'no-store','x-robots-tag':'noindex, nofollow, noarchive'};
 if(req.method!=='GET'&&req.method!=='HEAD')return new Response(null,{status:405,headers:{...headers,allow:'GET, HEAD'}});
 if(req.method==='HEAD')return new Response(null,{headers:{...headers,'content-type':'application/json'}});
 return Response.json({reviewOnly:!isTrustedLive()},{headers});
}};
