import {z} from "zod";
const text=z.string().trim().min(1).max(200);
const email=z.string().email().transform(v=>v.toLowerCase());
export const crmActions=z.discriminatedUnion("action",[
 z.object({action:z.literal("clinic"),name:text}),
 z.object({action:z.literal("member"),clinic:text,name:text,email,role:z.enum(["admin","professional","reception"]),specialty:z.enum(["Medicina","Odontologia","Recepção"])}),
 z.object({action:z.literal("patient"),clinic:text,name:text,birth:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),phone:z.string().trim().max(40)}),
 z.object({action:z.literal("appointment"),clinic:text,patient:text,professional:text,start:z.string().datetime(),end:z.string().datetime(),reason:text}),
 z.object({action:z.literal("status"),clinic:text,id:text,status:z.enum(["Agendada","Confirmada","Na recepção","Concluída","Cancelada"])}),
 z.object({action:z.literal("note"),clinic:text,patient:text,specialty:z.enum(["Medicina","Odontologia"]),subjective:z.string().trim().min(1).max(10000),objective:z.string().trim().max(10000),assessment:z.string().trim().max(10000),plan:z.string().trim().min(1).max(10000),tooth:z.string().max(100)})
]);
