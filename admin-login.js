const $=id=>document.getElementById(id);
async function post(body){
 const response=await fetch('/api/admin',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify(body)});
 let data={};try{data=await response.json()}catch{}
 if(!response.ok)throw Error(data.error||'Something went wrong. Try again.');
 return data;
}
$('emailStep').addEventListener('submit',async event=>{
 event.preventDefault();$('error').textContent='Sending…';
 try{await post({action:'start',email:$('email').value.trim()});$('error').textContent='';$('emailStep').hidden=true;$('codeStep').hidden=false;$('lead').textContent='If that’s the admin address, a code is on its way. It expires in ten minutes.';$('code').focus()}
 catch(e){$('error').textContent=e.message}
});
$('codeStep').addEventListener('submit',async event=>{
 event.preventDefault();$('error').textContent='Checking…';
 try{await post({action:'verify',email:$('email').value.trim(),code:$('code').value.trim()});location.href='/admin#dash'}
 catch(e){$('error').textContent=e.message}
});
