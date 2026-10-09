// Shared invitations live in the existing connection message stream. These
// helpers validate only server-supported choices and keep internal retry data
// out of the dedicated date-card response.
export const DATE_CARD_IDEAS=Object.freeze(['dinner','movie','topgolf','dave-busters','museum','concert','picnic','grocery-games','popcorn-night','staycation','overnight-trip']);
export const DATE_CARD_TITLES=Object.freeze({dinner:'Dinner',movie:'Movie',topgolf:'Topgolf','dave-busters':'Dave & Buster’s',museum:'Museum',concert:'Concert',picnic:'Picnic','grocery-games':'Grocery games','popcorn-night':'Popcorn night',staycation:'Staycation','overnight-trip':'Overnight trip'});
export const DATE_CARD_LIMITS=Object.freeze({cards:100,hourly:10,receipts:128});
export const validDateCardId=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
export const validConnectionId=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function localDate(value){
 if(value==='')return true;
 const match=/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value);
 if(!match)return false;
 const [,year,month,day,hour,minute]=match,numbers=[year,month,day].map(Number),[y,m,d]=numbers;
 if(y<1900||y>9999||m<1||m>12||d<1||d>new Date(Date.UTC(y,m,0)).getUTCDate())return false;
 return hour===undefined||Number(hour)<=23&&Number(minute)<=59;
}
function field(value,max,{multiline=false}={}){
 if(value===undefined)return '';
 if(typeof value!=='string'||value.length>max|| (multiline?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/:/[\u0000-\u001f\u007f]/).test(value))return null;
 return value.trim();
}
export function dateCardRequest(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||!['send','change','accept','cancel'].includes(body.action)||!validConnectionId(body.id)||!validDateCardId(body.requestId))return null;
 const {action,id,requestId}=body,editing=action==='send'||action==='change';
 const allowed=['action','id','requestId',...(action==='send'?[]:['cardId','version']),...(editing?['ideaId','date','place','note']:[])];
 if(Object.keys(body).some(key=>!allowed.includes(key)))return null;
 const result={action,id,requestId};
 if(action!=='send'){
  if(!validDateCardId(body.cardId)||!Number.isInteger(body.version)||body.version<1||body.version>2147483646)return null;
  result.cardId=body.cardId;result.version=body.version;
 }
 if(editing){
  const date=field(body.date,16),place=field(body.place,160),note=field(body.note,500,{multiline:true});
  if(!DATE_CARD_IDEAS.includes(body.ideaId)||date===null||!localDate(date)||place===null||note===null)return null;
  Object.assign(result,{ideaId:body.ideaId,date,place,note});
 }
 return result;
}
export function projectDateCardMessage(message){
 if(!message||message.type!=='dateCard'||!validDateCardId(message.id)||!['member','prospect'].includes(message.by)||!message.card)return null;
 const {ideaId,date,place,note,status,version,proposer,updatedAt,acceptedBy}=message.card;
 if(!DATE_CARD_IDEAS.includes(ideaId)||!['pending','accepted'].includes(status)||!Number.isInteger(version)||version<1||!['member','prospect'].includes(proposer))return null;
 return {type:'dateCard',id:message.id,by:message.by,at:message.at,...(typeof message.text==='string'?{text:message.text}:{}),card:{ideaId,date,place,note,status,version,proposer,updatedAt,...(status==='accepted'&&['member','prospect'].includes(acceptedBy)?{acceptedBy}:{})}};
}
// Normal chat shares the same stored stream. Hide tombstones and internal date
// receipts there too, without changing ordinary messages or their reaction slot.
export function projectConnectionMessages(messages){
 const visible=[];
 for(const [index,message] of (messages||[]).entries()){
  const item=message?.type==='dateCard'?projectDateCardMessage(message):message;
  if(message?.type==='dateCard'&&!item)continue;
  visible.push(item&&typeof item==='object'&&(index!==visible.length||Object.hasOwn(item,'messageIndex'))?{...item,messageIndex:index}:item);
 }
 return visible;
}
