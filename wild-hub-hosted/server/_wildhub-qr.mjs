// A local QR renderer. QR codes contain public request routes, never admission
// or session credentials. This helper does not contact a QR/image provider.
import QRCode from 'qrcode';

export async function renderWildHubQr(request,{origin}={}) {
  const headers={'cache-control':'no-store','content-type':'text/plain; charset=utf-8','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-robots-tag':'noindex, nofollow, noarchive'};
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{...headers,allow:'GET, HEAD'}});
  const value=new URL(request.url).searchParams.get('url');
  let target;
  try {
    if(typeof value!=='string'||value.length>2048)throw Error();
    target=new URL(value);
    if(target.origin!==origin||target.username||target.password||target.pathname!=='/'||target.search||
      !/^#(?:hub\/[a-z0-9][a-z0-9-]{1,38}[a-z0-9]|share\/[a-f0-9]{64})$/.test(target.hash))throw Error();
  } catch {return new Response('Choose a Wild Hub request link.',{status:400,headers})}
  const svg=await QRCode.toString(target.href,{type:'svg',errorCorrectionLevel:'M',margin:4,width:320,color:{dark:'#171717',light:'#ffffff'}});
  return new Response(request.method==='HEAD'?null:svg,{headers:{...headers,'content-type':'image/svg+xml; charset=utf-8','content-security-policy':"default-src 'none'; sandbox",'cross-origin-resource-policy':'same-origin'}});
}
