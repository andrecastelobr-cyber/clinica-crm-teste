import {env} from "cloudflare:workers";
import {getChatGPTUser} from "../../chatgpt-auth";
import {z} from "zod";
export const dynamic="force-dynamic";
const db=()=>env.DB!;
const id=()=>crypto.randomUUID();
const text=z.string().trim().min(1).max(200);
const email=z.string().email().transform(v=>v.toLowerCase());
const actions=z.discriminatedUnion("action",[
 z.object({action:z.literal("clinic"),name:text}),
 z.object({action:z.literal("member"),clinic:text,name:text,email,role:z.enum(["admin","professional","reception"]),specialty:z.enum(["Medicina","Odontologia","Recepção"])}),
 z.object({action:z.literal("patient"),clinic:text,name:text,birth:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),phone:z.string().trim().max(40)}),
 z.object({action:z.literal("appointment"),clinic:text,patient:text,professional:text,start:z.string().datetime(),end:z.string().datetime(),reason:text}),
 z.object({action:z.literal("status"),clinic:text,id:text,status:z.enum(["Agendada","Confirmada","Na recepção","Concluída","Cancelada"])}),
 z.object({action:z.literal("note"),clinic:text,patient:text,specialty:z.enum(["Medicina","Odontologia"]),subjective:z.string().trim().min(1).max(10000),objective:z.string().trim().max(10000),assessment:z.string().trim().max(10000),plan:z.string().trim().min(1).max(10000),tooth:z.string().max(100)})
]);
async function access(clinic:string,user:{userId:string,email:string}){
 const c=await db().prepare("SELECT * FROM clinics WHERE id=?").bind(clinic).first<any>();
 if(!c)throw new Error("FORBIDDEN");
 if(c.owner===user.userId)return "admin";
 const m=await db().prepare("SELECT role FROM members WHERE clinic=? AND email=?").bind(clinic,user.email.toLowerCase()).first<any>();
 if(!m)throw new Error("FORBIDDEN");return m.role;
}
function response(data:unknown,status=200){return Response.json(data,{status,headers:{"Cache-Control":"no-store"}})}
function databaseNotReady(error:unknown){
 let current:unknown=error;
 for(let depth=0;depth<5&&current instanceof Error;depth++){
  if(/no such table/i.test(current.message))return true;
  current=current.cause;
 }
 return false;
}
function setupError(){return response({error:"O banco de dados ainda não foi preparado. No ambiente local, execute npm run db:local no Terminal e recarregue esta página.",code:"DATABASE_NOT_READY"},503)}
export async function GET(req:Request){
 const user=await getChatGPTUser();if(!user)return response({error:"Entre para continuar."},401);
 try{
 const clinics=(await db().prepare("SELECT DISTINCT c.* FROM clinics c LEFT JOIN members m ON m.clinic=c.id WHERE c.owner=? OR m.email=? ORDER BY c.name").bind(user.userId,user.email.toLowerCase()).all()).results;
 const url=new URL(req.url);const clinic=url.searchParams.get("clinic");if(!clinic)return response({clinics});
 const role=await access(clinic,user);
 const patient=url.searchParams.get("patient");
 if(patient){if(role==="reception")return response({error:"Acesso restrito aos profissionais."},403);
 const exists=await db().prepare("SELECT id FROM patients WHERE clinic=? AND id=?").bind(clinic,patient).first();if(!exists)return response({error:"Paciente não encontrado."},404);
 const notes=(await db().prepare("SELECT * FROM notes WHERE clinic=? AND patient=? ORDER BY created DESC").bind(clinic,patient).all()).results;
 await db().prepare("INSERT INTO audit VALUES(?,?,?,?,?,?)").bind(id(),clinic,user.email,"read_notes",patient,new Date().toISOString()).run();return response({notes});}
 const [patients,members,appointments]=await Promise.all([db().prepare("SELECT * FROM patients WHERE clinic=? ORDER BY name").bind(clinic).all(),db().prepare("SELECT id,name,email,role,specialty FROM members WHERE clinic=? AND NOT (role='admin' AND email IN (SELECT lower(actor) FROM audit WHERE clinic=? AND action='clinic')) ORDER BY name").bind(clinic,clinic).all(),db().prepare("SELECT a.*,p.name as patientName,m.name as professionalName FROM appointments a JOIN patients p ON a.patient=p.id AND a.clinic=p.clinic JOIN members m ON a.professional=m.id AND a.clinic=m.clinic WHERE a.clinic=? AND m.role='professional' ORDER BY a.start").bind(clinic).all()]);
 return response({clinics,role,patients:patients.results,members:members.results,appointments:appointments.results});
 }catch(e){if(databaseNotReady(e))return setupError();return response({error:e instanceof Error&&e.message==="FORBIDDEN"?"Acesso negado.":"Não foi possível carregar os dados."},e instanceof Error&&e.message==="FORBIDDEN"?403:500)}
}
export async function POST(req:Request){
 const user=await getChatGPTUser();if(!user)return response({error:"Entre para continuar."},401);
 if(req.headers.get("origin")!==new URL(req.url).origin)return response({error:"Origem inválida."},403);
 try{
 const raw=await req.text();if(raw.length>50000)return response({error:"Dados muito extensos."},413);
 const parsed=actions.safeParse(JSON.parse(raw));if(!parsed.success)return response({error:"Confira os campos obrigatórios."},400);
 const d=parsed.data;const now=new Date().toISOString();const resource=id();let stmt;
 if(d.action==="clinic"){
 const mid=id();await db().batch([db().prepare("INSERT INTO clinics VALUES(?,?,?)").bind(resource,d.name,user.userId),db().prepare("INSERT INTO members VALUES(?,?,?,?,?,?)").bind(mid,resource,user.email.toLowerCase(),"admin",user.displayName,"Medicina"),db().prepare("INSERT INTO audit VALUES(?,?,?,?,?,?)").bind(id(),resource,user.email,"clinic",resource,now)]);return response({id:resource});}
 const role=await access(d.clinic,user);
 if(d.action==="member"){
 if(role!=="admin")return response({error:"Somente administradores podem cadastrar a equipe."},403);
 stmt=db().prepare("INSERT INTO members VALUES(?,?,?,?,?,?)").bind(resource,d.clinic,d.email,d.role,d.name,d.specialty);
 }else if(d.action==="patient"){
 if(d.birth>now.slice(0,10)||!Number.isFinite(Date.parse(d.birth)))return response({error:"Data de nascimento inválida."},400);
 stmt=db().prepare("INSERT INTO patients VALUES(?,?,?,?,?,?)").bind(resource,d.clinic,d.name,d.birth,d.phone,now);
 }else if(d.action==="appointment"){
 if(Date.parse(d.end)<=Date.parse(d.start)||Date.parse(d.end)-Date.parse(d.start)>86400000)return response({error:"Confira a duração da consulta."},400);
 const p=await db().prepare("SELECT id FROM patients WHERE id=? AND clinic=?").bind(d.patient,d.clinic).first();
 const m=await db().prepare("SELECT id FROM members WHERE id=? AND clinic=? AND role='professional'").bind(d.professional,d.clinic).first();
 if(!p||!m)return response({error:"Paciente ou profissional inválido."},400);
 stmt=db().prepare("INSERT INTO appointments SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM appointments WHERE clinic=? AND professional=? AND status!='Cancelada' AND start<? AND end>?)").bind(resource,d.clinic,d.patient,d.professional,d.start,d.end,"Agendada",d.reason,d.clinic,d.professional,d.end,d.start);
 }else if(d.action==="status"){
 stmt=db().prepare("UPDATE appointments SET status=? WHERE id=? AND clinic=?").bind(d.status,d.id,d.clinic);
 }else{
 if(role==="reception")return response({error:"Acesso restrito aos profissionais."},403);
 const p=await db().prepare("SELECT id FROM patients WHERE id=? AND clinic=?").bind(d.patient,d.clinic).first();if(!p)return response({error:"Paciente inválido."},400);
 stmt=db().prepare("INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(resource,d.clinic,d.patient,user.email,d.specialty,d.subjective,d.objective,d.assessment,d.plan,d.tooth,now);
 }
 const result=await db().batch([stmt,db().prepare("INSERT INTO audit SELECT ?,?,?,?,?,? WHERE changes()>0").bind(id(),d.clinic,user.email,d.action,("id" in d?d.id:resource),now)]);
 if(!result[0].meta.changes)return response({error:d.action==="appointment"?"Este profissional já tem uma consulta nesse horário.":"Registro não encontrado."},409);
 return response({ok:true,id:resource});
 }catch(e){if(databaseNotReady(e))return setupError();if(e instanceof Error&&e.message==="FORBIDDEN")return response({error:"Acesso negado."},403);return response({error:"Não foi possível salvar. Verifique se o e-mail já está cadastrado e tente novamente."},400)}
}
