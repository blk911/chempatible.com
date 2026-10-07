// Profile photos are browser-cropped JPEGs. Bound decoded bytes and dimensions,
// and validate the complete marker/segment envelope without decoding pixels.
const PREFIX='data:image/jpeg;base64,';
export function validProfilePhoto(value){
 if(typeof value!=='string'||value.length>=250000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))return false;
 const payload=value.slice(PREFIX.length),bytes=Buffer.from(payload,'base64');
 if(bytes.toString('base64')!==payload||bytes.length<4||bytes[0]!==255||bytes[1]!==216)return false;
 let offset=2,frame=null,quantization=false,huffman=false,scans=0,entropy=0;
 while(offset<bytes.length){
  if(bytes[offset++]!==255)return false;
  while(bytes[offset]===255)offset++;
  const marker=bytes[offset++];
  if(marker===217)return !!frame&&quantization&&huffman&&scans>0&&entropy>0&&offset===bytes.length;
  if(marker===undefined||marker===0||marker===216||marker===1||(marker>=208&&marker<=215)||offset+2>bytes.length)return false;
  const length=bytes.readUInt16BE(offset),end=offset+length;
  if(length<2||end>bytes.length)return false;
  if(marker>=192&&marker<=207&&![196,200,204].includes(marker)){
   if(frame||![192,193,194].includes(marker)||length<11||bytes[offset+2]!==8)return false;
   const height=bytes.readUInt16BE(offset+3),width=bytes.readUInt16BE(offset+5),count=bytes[offset+7];
   if(![1,3,4].includes(count)||length!==8+3*count||!width||!height||width>4096||height>4096||width*height>16000000)return false;
   const components=new Set();
   for(let i=0;i<count;i++){
    const start=offset+8+i*3,id=bytes[start],sampling=bytes[start+1];
    if(components.has(id)||!(sampling>>4)||!(sampling&15)||(sampling>>4)>4||(sampling&15)>4||bytes[start+2]>3)return false;
    components.add(id);
   }
   frame={marker,components};
  }else if(marker===219){
   let cursor=offset+2;
   while(cursor<end){const table=bytes[cursor++],precision=table>>4;if(precision>1||(table&15)>3)return false;cursor+=64*(precision+1)}
   if(cursor!==end||length===2)return false;quantization=true;
  }else if(marker===196){
   let cursor=offset+2;
   while(cursor<end){
    const table=bytes[cursor++];if((table>>4)>1||(table&15)>3||cursor+16>end)return false;
    let symbols=0;for(let i=0;i<16;i++)symbols+=bytes[cursor++];
    if(!symbols||symbols>256)return false;cursor+=symbols;
   }
   if(cursor!==end||length===2)return false;huffman=true;
  }else if(marker===218){
   if(!frame||!quantization||!huffman)return false;
   const count=bytes[offset+2],components=new Set();
   if(!count||count>frame.components.size||length!==6+2*count)return false;
   for(let i=0;i<count;i++){
    const id=bytes[offset+3+i*2],table=bytes[offset+4+i*2];
    if(!frame.components.has(id)||components.has(id)||(table>>4)>3||(table&15)>3)return false;
    components.add(id);
   }
   const spectralStart=bytes[end-3],spectralEnd=bytes[end-2],approximation=bytes[end-1];
   if(spectralStart>spectralEnd||spectralEnd>63||(approximation>>4)>13||(approximation&15)>13)return false;
   if(frame.marker!==194&&(spectralStart!==0||spectralEnd!==63||approximation!==0))return false;
   scans++;offset=end;let scanBytes=0;
   while(offset<bytes.length){
    if(bytes[offset]!==255){offset++;scanBytes++;continue}
    if(bytes[offset+1]===0){offset+=2;scanBytes++;continue}
    if(bytes[offset+1]>=208&&bytes[offset+1]<=215){offset+=2;continue}
    break;
   }
   if(!scanBytes)return false;entropy+=scanBytes;continue;
  }else if(marker===221){if(length!==4)return false}
  else if(!(marker>=224&&marker<=239)&&marker!==254)return false;
  offset=end;
 }
 return false;
}

export async function readProfileBody(req,max=256000){
 const failure=()=>Object.assign(Error('The profile is too large. Choose another photo.'),{status:413});
 const length=req.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>max))throw failure();
 if(!req.body)return null;
 const reader=req.body.getReader(),chunks=[];let count=0;
 try{
  while(true){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>max){await reader.cancel().catch(()=>{});throw failure()}chunks.push(Buffer.from(value))}
 }finally{reader.releaseLock()}
 try{return JSON.parse(Buffer.concat(chunks,count).toString('utf8'))}catch{return null}
}
