// Vercel Routing Middleware: only a signed-in admin can load the admin page and its scripts.
// The admin API checks the same cookie on every request (api/_ops.mjs readAdmin).
export const config={matcher:['/admin','/admin/:path*','/admin.js','/admin-ops.js']};

const ADMIN_EMAIL=(process.env.CHEMPAT_ADMIN_EMAIL||'blk911@gmail.com').trim().toLowerCase();
const hex=buffer=>[...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,'0')).join('');

async function signedIn(request){
 const match=(request.headers.get('cookie')||'').match(/(?:^|;\s*)chempat_admin=(\d+)\.([a-f0-9]{64})(?:;|$)/);
 const secret=process.env.ADMIN_SESSION_SECRET||process.env.DATABASE_URL||'';
 if(!match||!secret||!(Number(match[1])>Date.now()))return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const expected=hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`admin|${ADMIN_EMAIL}|${match[1]}`)));
 let diff=0;for(let i=0;i<64;i++)diff|=expected.charCodeAt(i)^match[2].charCodeAt(i);
 return diff===0;
}

export default async function middleware(request){
 if(await signedIn(request))return;
 const url=new URL(request.url);
 if(url.pathname.endsWith('.js'))return new Response('Sign in required.',{status:401,headers:{'cache-control':'no-store'}});
 return Response.redirect(new URL('/admin-login',request.url),307);
}
