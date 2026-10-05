export const IMAGE_LIMITS = Object.freeze({bytes:5*1024*1024,pixels:20_000_000,edge:1600});

// Decode pixels instead of trusting extension, Content-Type, or magic bytes.
// Reencoding without withMetadata() strips EXIF, GPS, XMP and source metadata.
export async function prepareWildHubPhoto(value,sharp) {
  const fail=()=>{throw Object.assign(new Error('Choose a valid JPEG, PNG, or WebP image up to 5 MiB and 20 megapixels.'),{status:400,code:'invalid_image'})};
  if(typeof value!=='string'||value.length>Math.ceil(IMAGE_LIMITS.bytes/3)*4+64)fail();
  const match=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if(!match||match[2].length%4!==0)fail();
  const bytes=Buffer.from(match[2],'base64');
  if(!bytes.length||bytes.length>IMAGE_LIMITS.bytes||bytes.toString('base64')!==match[2])fail();
  try {
    const decoder=sharp(bytes,{limitInputPixels:IMAGE_LIMITS.pixels,failOn:'warning',animated:false});
    const metadata=await decoder.metadata();
    const allowed=match[1]==='jpeg'?'jpeg':match[1];
    if(metadata.format!==allowed||!metadata.width||!metadata.height||metadata.width*metadata.height>IMAGE_LIMITS.pixels||(metadata.pages||1)!==1)fail();
    const {data,info}=await decoder.rotate().resize({width:IMAGE_LIMITS.edge,height:IMAGE_LIMITS.edge,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality:82,mozjpeg:true}).toBuffer({resolveWithObject:true});
    if(data.length>IMAGE_LIMITS.bytes)fail();
    return {bytes:data,width:info.width,height:info.height};
  } catch { fail(); }
}
