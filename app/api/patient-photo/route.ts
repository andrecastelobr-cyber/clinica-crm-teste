import {cookies} from 'next/headers';
import {getUser} from '../../../lib/supabase/server';
import {ACCESS_COOKIE,config,sameOrigin} from '../../../lib/supabase/http';
import {failure,respond} from '../../../lib/api';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const maximum=512*1024;
const identifier=/^[A-Za-z0-9_-]{1,200}$/;
async function handle(req:Request,upload:boolean){
 if(upload&&!sameOrigin(req))return respond({error:'Origem inválida.'},403);
 try{
  if(!await getUser())return respond({error:'Entre para continuar.'},401);
  const params=new URL(req.url).searchParams,clinic=params.get('clinic')||'',patient=params.get('patient')||'';
  if(!identifier.test(clinic)||!identifier.test(patient))return respond({error:'Clínica ou paciente inválido.'},400);
  let data:Uint8Array|undefined;
  if(upload){
   if(req.headers.get('content-type')?.split(';')[0]!=='image/jpeg')return respond({error:'A foto deve estar em JPEG.'},400);
   if(Number(req.headers.get('content-length'))>maximum)return respond({error:'A foto deve ter até 512 KB.'},413);
   const reader=req.body?.getReader();if(!reader)return respond({error:'Foto vazia.'},400);
   const chunks:Uint8Array[]=[];let size=0;
   while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>maximum){await reader.cancel();return respond({error:'A foto deve ter até 512 KB.'},413)}chunks.push(value)}
   data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length}
   if(size<4||data[0]!==255||data[1]!==216||data[2]!==255||data[size-2]!==255||data[size-1]!==217)return respond({error:'Foto JPEG inválida.'},400);
  }
  const {url,key}=config(),token=(await cookies()).get(ACCESS_COOKIE)?.value;
  // Storage enforces clinic membership and existence of the patient for reads and writes.
  const path=encodeURIComponent(clinic)+'/'+encodeURIComponent(patient)+'.jpg';
  const upstream=await fetch(url+'/storage/v1/object/'+(upload?'':'authenticated/')+'patient-photos/'+path,{method:upload?'POST':'GET',headers:{apikey:key,Authorization:'Bearer '+token,...(upload?{'Content-Type':'image/jpeg','x-upsert':'true','Cache-Control':'no-store'}:{})},...(data?{body:Buffer.from(data)}:{}),cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!upstream.ok){
   if(!upload)return new Response(null,{status:upstream.status===401?401:404,headers:{'Cache-Control':'private, no-store'}});
   return respond({error:'Não foi possível salvar a foto. Confira a migração de fotos no Supabase e o acesso à clínica.'},upstream.status===403?403:503);
  }
  if(upload)return respond({ok:true});
  return new Response(await upstream.arrayBuffer(),{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(error){return failure(error)}
}
export function GET(req:Request){return handle(req,false)}
export function POST(req:Request){return handle(req,true)}
