// Stand-in for api/_ops.mjs so API tests keep their exact SQL mocks. tests/ops.test.mjs covers the real module.
export const calls=[];
globalThis.__ops={
 log:async(sql,kind,info={})=>{calls.push({kind,...info})},
 standing:async()=>null,
 standingByContact:async()=>null,
 memberIdFromToken:async()=>null,
 linkProspect:async(sql,connection)=>{calls.push({kind:'link',connection})},
 endConnection:async(sql,args)=>{calls.push({kind:'end',...args});return {status:200,body:{ok:true,status:'ended'}}}
};
