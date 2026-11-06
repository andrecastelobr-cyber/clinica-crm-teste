import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {z} from 'zod';
import {productFields,totalCents} from '../../../lib/inventory';
export const dynamic='force-dynamic';
const db=()=>env.DB!;
const key=z.string().min(1).max(200);
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),clinic:key,...productFields}),
 z.object({action:z.literal('update'),clinic:key,targetClinic:key,id:key,...productFields}),
 z.object({action:z.literal('delete'),clinic:key,id:key})
]);
const respond=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function authorized(clinic:string,user:{userId:string,email:string}){
 const found=await db().prepare('SELECT c.id FROM clinics c LEFT JOIN members m ON m.clinic=c.id WHERE c.id=? AND (c.owner=? OR m.email=?) LIMIT 1').bind(clinic,user.userId,user.email.toLowerCase()).first();
 if(!found)throw Error('FORBIDDEN');
}
function failure(error:unknown){
 if(error instanceof Error&&error.message==='FORBIDDEN')return respond({error:'Você não tem acesso a esta clínica.'},403);
 let current:unknown=error;
 for(let i=0;i<5&&current instanceof Error;i++,current=current.cause){
  if(/UNIQUE constraint failed/i.test(current.message))return respond({error:'Já existe um produto com esse código nesta clínica.'},409);
  if(/no such table/i.test(current.message))return respond({error:'O módulo de estoque precisa da atualização do banco local.'},503);
 }
 return respond({error:'Não foi possível concluir a operação de estoque. Tente novamente.'},500);
}
export async function GET(req:Request){
 const user=await getChatGPTUser();if(!user)return respond({error:'Entre para continuar.'},401);
 const clinic=new URL(req.url).searchParams.get('clinic');if(!clinic)return respond({error:'Selecione uma clínica.'},400);
 try{await authorized(clinic,user);
 const result=await db().prepare('SELECT id,clinic,code,description,quantity_milli AS quantityMilli,unit_cents AS unitCents FROM products WHERE clinic=? ORDER BY description,code').bind(clinic).all<{id:string;clinic:string;code:string;description:string;quantityMilli:number;unitCents:number}>();
 return respond({products:result.results.map(p=>({...p,totalCents:totalCents(p.quantityMilli,p.unitCents)}))});
 }catch(e){return failure(e)}
}
export async function POST(req:Request){
 const user=await getChatGPTUser();if(!user)return respond({error:'Entre para continuar.'},401);
 if(req.headers.get('origin')!==new URL(req.url).origin)return respond({error:'Origem inválida.'},403);
 try{
 const body=await req.text();if(body.length>10000)return respond({error:'Dados muito extensos.'},413);
 let json:unknown;try{json=JSON.parse(body)}catch{return respond({error:'Dados inválidos.'},400)}
 const parsed=schema.safeParse(json);if(!parsed.success)return respond({error:'Confira os campos: quantidade aceita até 3 casas decimais e valor unitário até 2. Use valores de 0 a 1.000.000.'},400);
 const d=parsed.data;await authorized(d.clinic,user);const now=new Date().toISOString();const id=d.action==='create'?crypto.randomUUID():d.id;
 let statement;
 if(d.action==='create')statement=db().prepare('INSERT INTO products (id,clinic,code,description,quantity_milli,unit_cents,created,updated) VALUES(?,?,?,?,?,?,?,?)').bind(id,d.clinic,d.code,d.description,d.quantity,d.unitValue,now,now);
 else if(d.action==='update'){
  await authorized(d.targetClinic,user);
  statement=db().prepare('UPDATE products SET clinic=?,code=?,description=?,quantity_milli=?,unit_cents=?,updated=? WHERE id=? AND clinic=?').bind(d.targetClinic,d.code,d.description,d.quantity,d.unitValue,now,id,d.clinic);
 }else statement=db().prepare('DELETE FROM products WHERE id=? AND clinic=?').bind(id,d.clinic);
 const statements=[statement,db().prepare('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0').bind(crypto.randomUUID(),d.clinic,user.email,'product_'+d.action,id,now)];
 if(d.action==='update'&&d.targetClinic!==d.clinic)statements.push(db().prepare('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0').bind(crypto.randomUUID(),d.targetClinic,user.email,'product_transfer_in',id,now));
 const result=await db().batch(statements);if(!result[0].meta.changes)return respond({error:'Produto não encontrado nesta clínica.'},404);
 return respond({ok:true,id});
 }catch(e){return failure(e)}
}
