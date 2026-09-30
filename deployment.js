// Do not label the deployment until the same-origin server confirms its mode.
// This is presentation only: every API independently enforces its server-side gate.
(async()=>{
 const banner=document.getElementById('reviewBanner');
 try{
  const response=await fetch('/api/config',{cache:'no-store',credentials:'omit'});
  if(!response.ok)throw Error('Configuration unavailable');
  const config=await response.json();
  if(config?.reviewOnly===false)return;
  if(config?.reviewOnly!==true)throw Error('Invalid configuration');
  if(banner)banner.hidden=false;
 }catch{
  if(banner){
   banner.textContent='Service temporarily unavailable. Please try again.';
   banner.hidden=false;
  }
 }
})();
