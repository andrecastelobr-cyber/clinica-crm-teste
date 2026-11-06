import {getUser,rpc} from './supabase/server';
import {sameOrigin,SupabaseError} from './supabase/http';
import type {ZodTypeAny} from 'zod';
export const respond=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export function failure(error:unknown){
 if(error instanceof SupabaseError){
  if(['42501','PGRST301'].includes(error.code)||error.status===403)return respond({error:'Acesso negado a esta clínica ou operação.'},403);
  if(error.status===401)return respond({error:'Sua sessão expirou. Entre novamente.'},401);
  if(['23505','23P01'].includes(error.code))return respond({error:'Já existe um registro com esse código ou horário. Confira os dados.'},409);
  if(['42P01','42883','PGRST202','CONFIGURATION'].includes(error.code))return respond({error:'O ambiente ainda está sendo configurado. Entre em contato com o administrador.'},503);
  if(error.code==='P0001')return respond({error:error.message},400);
  if(['23503','23514','22P02','22007','22008','22003'].includes(error.code))return respond({error:'Confira os valores e os vínculos dos dados informados.'},400);
 }
 return respond({error:'Não foi possível concluir a operação. Tente novamente.'},500);
}
export async function readRpc(req:Request,name:string){
 try{
  if(!await getUser())return respond({error:'Entre para continuar.'},401);
  const url=new URL(req.url);
  return respond(await rpc(name,{p_clinic:url.searchParams.get('clinic'),p_record:url.searchParams.get('patient')||url.searchParams.get('charge')}));
 }catch(e){return failure(e)}
}
export async function writeRpc(req:Request,name:string,schema:ZodTypeAny){
 if(!sameOrigin(req))return respond({error:'Origem inválida.'},403);
 try{
  if(!await getUser())return respond({error:'Entre para continuar.'},401);
  const raw=await req.text();if(raw.length>50000)return respond({error:'Dados muito extensos.'},413);
  let body:unknown;try{body=JSON.parse(raw)}catch{return respond({error:'Dados inválidos.'},400)}
  const result=schema.safeParse(body);if(!result.success)return respond({error:'Confira os campos obrigatórios, os valores e as datas.'},400);
  return respond(await rpc(name,{p_data:result.data}));
 }catch(e){return failure(e)}
}
