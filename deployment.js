// Keep the review notice unless the same-origin server confirms trusted live mode.
// This is presentation only: every API independently enforces its server-side gate.
(async()=>{
 try{
  const response=await fetch('/api/config',{cache:'no-store',credentials:'omit'});
  if(!response.ok)return;
  const config=await response.json();
  if(config?.reviewOnly===false)document.getElementById('reviewBanner')?.remove();
 }catch{}
})();
