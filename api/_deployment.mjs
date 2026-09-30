// Use only Vercel's server-side system environment variables for deployment
// identity. Never trust a request host/header, URL parameter, or browser flag.
const LIVE_PROJECT_ID='prj_gtV01YIqkEfAfvdSbVopIfy2VpnJ';

export function isTrustedLive(){
 return process.env.CHEMPAT_RELEASE_MODE==='live'
  &&process.env.VERCEL==='1'
  &&process.env.VERCEL_PROJECT_ID===LIVE_PROJECT_ID
  &&process.env.VERCEL_ENV==='production'
  &&process.env.VERCEL_GIT_COMMIT_REF==='live';
}

export function deploymentMode(){
 if(isTrustedLive())return 'live';
 const requested=process.env.CHEMPAT_RELEASE_MODE;
 // A mistyped/misplaced live flag must never fall back to review access. The
 // public project must never treat its real database as isolated review data.
 if((requested&&requested!=='review')||process.env.VERCEL_PROJECT_ID===LIVE_PROJECT_ID)return 'blocked';
 return process.env.CHEMPAT_REVIEW_DATA==='isolated-confirmed'?'review':'blocked';
}
