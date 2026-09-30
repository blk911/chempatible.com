import {deploymentMode} from './_deployment.mjs';

// Public presentation only. No secrets, identities, allowlists, or DB access.
export default {fetch(req){
 const headers={'cache-control':'no-store','x-robots-tag':'noindex, nofollow, noarchive'};
 if(req.method!=='GET'&&req.method!=='HEAD')return new Response(null,{status:405,headers:{...headers,allow:'GET, HEAD'}});
 const mode=deploymentMode(),status=mode==='blocked'?503:200;
 if(req.method==='HEAD')return new Response(null,{status,headers:{...headers,'content-type':'application/json'}});
 return Response.json({reviewOnly:mode!=='live'},{status,headers});
}};
