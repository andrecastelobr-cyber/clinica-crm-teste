import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {z} from 'zod';
import {amountSchema,dateSchema,splitInstallments} from '../../../lib/finance';
export const dynamic='force-dynamic';
const db=()=>env.DB!;
const key=z.string().min(1).max(200);
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),clinic:key,patient:key,description:z.string().trim().min(1).max(300),amount:amountSchema,count:z.number().int().min(1).max(120)}),
 z.object({action:z.literal('pay'),clinic:key,installment:key,amount:amountSchema,paidOn:dateSchema,requestId:z.string().uuid()})
]);
const respond=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function access(clinic:string,user:{userId:string;email:string}){
 const result=await db().prepare('SELECT c.id FROM clinics c LEFT JOIN members m ON m.clinic=c.id WHERE c.id=? AND (c.owner=? OR m.email=?) LIMIT 1').bind(clinic,user.userId,user.email.toLowerCase()).first();
 if(!result)throw Error('FORBIDDEN');
}
function failure(e:unknown){
 if(e instanceof Error&&e.message==='FORBIDDEN')return respond({error:'Acesso negado a esta clínica.'},403);
 let current:unknown=e;
 for(let i=0;i<5&&current instanceof Error;i++,current=current.cause)if(/no such table/i.test(current.message))return respond({error:'O módulo financeiro precisa da atualização do banco local.'},503);
 return respond({error:'Não foi possível concluir a operação financeira. Recarregue os dados e tente novamente.'},500);
}
export async function GET(req:Request){
 const user=await getChatGPTUser();if(!user)return respond({error:'Entre para continuar.'},401);
 const url=new URL(req.url),clinic=url.searchParams.get('clinic'),charge=url.searchParams.get('charge');if(!clinic)return respond({error:'Selecione uma clínica.'},400);
 try{await access(clinic,user);
 if(charge){
 const found=await db().prepare('SELECT id FROM charges WHERE clinic=? AND id=?').bind(clinic,charge).first();if(!found)return respond({error:'Registro financeiro não encontrado.'},404);
 const rows=await db().prepare('SELECT i.id,i.number,i.amount_cents AS amountCents,COALESCE(SUM(p.amount_cents),0) AS paidCents,i.amount_cents-COALESCE(SUM(p.amount_cents),0) AS balanceCents,MAX(p.paid_on) AS paidOn FROM installments i LEFT JOIN payments p ON p.installment=i.id AND p.clinic=i.clinic WHERE i.clinic=? AND i.charge=? GROUP BY i.id ORDER BY i.number').bind(clinic,charge).all();
 const payments=await db().prepare('SELECT p.id,p.installment,p.amount_cents AS amountCents,p.paid_on AS paidOn,p.actor FROM payments p JOIN installments i ON i.id=p.installment AND i.clinic=p.clinic WHERE p.clinic=? AND i.charge=? ORDER BY p.paid_on,p.created').bind(clinic,charge).all();
 return respond({installments:rows.results,payments:payments.results});}
 const charges=await db().prepare('SELECT c.id,c.clinic,c.patient,p.name AS patientName,c.description,c.total_cents AS totalCents,c.installment_count AS count,c.created,COALESCE(SUM(pay.amount_cents),0) AS paidCents,c.total_cents-COALESCE(SUM(pay.amount_cents),0) AS balanceCents FROM charges c JOIN patients p ON p.id=c.patient AND p.clinic=c.clinic LEFT JOIN installments i ON i.charge=c.id AND i.clinic=c.clinic LEFT JOIN payments pay ON pay.installment=i.id AND pay.clinic=c.clinic WHERE c.clinic=? GROUP BY c.id ORDER BY c.created DESC,c.id').bind(clinic).all();
 const patients=await db().prepare('SELECT id,name FROM patients WHERE clinic=? ORDER BY name').bind(clinic).all();
 return respond({charges:charges.results,patients:patients.results});
 }catch(e){return failure(e)}
}
export async function POST(req:Request){
 const user=await getChatGPTUser();if(!user)return respond({error:'Entre para continuar.'},401);
 if(req.headers.get('origin')!==new URL(req.url).origin)return respond({error:'Origem inválida.'},403);
 try{
 const raw=await req.text();if(raw.length>10000)return respond({error:'Dados muito extensos.'},413);
 let json:unknown;try{json=JSON.parse(raw)}catch{return respond({error:'Dados inválidos.'},400)}
 const parsed=schema.safeParse(json);if(!parsed.success)return respond({error:'Confira os campos, o valor e a data do pagamento. Use até 120 parcelas e valores positivos com duas casas decimais.'},400);
 const d=parsed.data;await access(d.clinic,user);const now=new Date().toISOString();
 if(d.action==='create'){
 const patient=await db().prepare('SELECT id FROM patients WHERE id=? AND clinic=?').bind(d.patient,d.clinic).first();if(!patient)return respond({error:'Selecione um paciente desta clínica.'},400);
 if(d.count>d.amount)return respond({error:'Cada parcela deve ter pelo menos R$ 0,01.'},400);
 const id=crypto.randomUUID(),amounts=splitInstallments(d.amount,d.count);
 await db().batch([db().prepare('INSERT INTO charges VALUES(?,?,?,?,?,?,?)').bind(id,d.clinic,d.patient,d.description,d.amount,d.count,now),...amounts.map((amount,i)=>db().prepare('INSERT INTO installments VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),d.clinic,id,i+1,amount)),db().prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),d.clinic,user.email,'charge_create',id,now)]);
 return respond({id});
 }
 const prior=await db().prepare('SELECT id,installment,amount_cents AS amountCents,paid_on AS paidOn FROM payments WHERE id=? AND clinic=?').bind(d.requestId,d.clinic).first<{id:string;installment:string;amountCents:number;paidOn:string}>();
 if(prior){if(prior.installment===d.installment&&prior.amountCents===d.amount&&prior.paidOn===d.paidOn)return respond({ok:true,id:prior.id});return respond({error:'Identificador de pagamento já utilizado. Atualize os dados.'},409)}
 const result=await db().batch([
 db().prepare('INSERT INTO payments (id,clinic,installment,amount_cents,paid_on,actor,created) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM installments i WHERE i.id=? AND i.clinic=? AND i.amount_cents-COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.installment=i.id AND p.clinic=i.clinic),0)>=?)').bind(d.requestId,d.clinic,d.installment,d.amount,d.paidOn,user.email,now,d.installment,d.clinic,d.amount),
 db().prepare('INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0').bind(crypto.randomUUID(),d.clinic,user.email,'installment_payment',d.installment,now)
 ]);
 if(!result[0].meta.changes)return respond({error:'A parcela não foi encontrada nesta clínica, já está paga ou o valor supera o saldo da parcela. Atualize os dados.'},409);
 return respond({ok:true,id:d.requestId});
 }catch(e){return failure(e)}
}
