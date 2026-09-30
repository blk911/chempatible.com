import {next} from '@vercel/functions';
import {isTrustedLive} from './api/_deployment.mjs';

// Vercel Routing Middleware: only a signed-in admin can load the admin page and its scripts.
// The admin API checks the same cookie on every request (api/_ops.mjs readAdmin).
// All responses need a mode-aware robots header, including static pages/assets.
export const config={matcher:['/:path*']};

const configuredAdminEmail=(process.env.CHEMPAT_ADMIN_EMAIL||'').trim().toLowerCase();
const ADMIN_EMAIL=configuredAdminEmail.length<=255&&/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(configuredAdminEmail)?configuredAdminEmail:'';
const hex=buffer=>[...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,'0')).join('');

async function signedIn(request){
 const match=(request.headers.get('cookie')||'').match(/(?:^|;\s*)chempat_admin=(\d+)\.([a-f0-9]{64})(?:;|$)/);
 const secret=process.env.ADMIN_SESSION_SECRET||process.env.DATABASE_URL||'';
 if(!ADMIN_EMAIL||!match||!secret||!(Number(match[1])>Date.now()))return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const expected=hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`admin|${ADMIN_EMAIL}|${match[1]}`)));
 let diff=0;for(let i=0;i<64;i++)diff|=expected.charCodeAt(i)^match[2].charCodeAt(i);
 return diff===0;
}

export default async function middleware(request){
 const url=new URL(request.url);
 const path=url.pathname;
 const admin=path==='/admin'||path.startsWith('/admin/')||path==='/admin.js'||path==='/admin-ops.js';
 const privatePage=path==='/friend'||path==='/friend.html'||admin||path.startsWith('/api/')||path==='/api'||path.startsWith('/admin-login')||url.searchParams.has('invite')||url.searchParams.has('token')||url.searchParams.has('friend');
 const headers=!isTrustedLive()||privatePage?{'x-robots-tag':'noindex, nofollow, noarchive'}:{};
 if(admin&&!(await signedIn(request))){
  if(path.endsWith('.js'))return new Response('Sign in required.',{status:401,headers:{...headers,'cache-control':'no-store'}});
  return new Response(null,{status:307,headers:{...headers,'cache-control':'no-store',location:new URL('/admin-login',request.url).href}});
 }
 return next({headers});
}
