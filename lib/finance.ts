import {z} from 'zod';
import {decimalUnits} from './inventory';
export const amountSchema=z.string().trim().refine(v=>{const n=decimalUnits(v,2);return n!==null&&n>0&&n<=100000000},'Informe um valor positivo de até R$ 1.000.000,00 com duas casas decimais.').transform(v=>decimalUnits(v,2)!);
export function splitInstallments(total:number,count:number){
 if(!Number.isSafeInteger(total)||total<1||!Number.isInteger(count)||count<1||count>120||count>total)throw Error('Número de parcelas inválido.');
 const base=Math.floor(total/count);
 return Array.from({length:count},(_,i)=>base+(i===count-1?total-base*count:0));
}
export const dateSchema=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v&&v<=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'})},'Data de pagamento inválida.');
export type Charge={id:string;clinic:string;patient:string;patientName:string;description:string;totalCents:number;count:number;created:string;paidCents:number;balanceCents:number};
export type Installment={id:string;number:number;amountCents:number;paidCents:number;balanceCents:number;paidOn:string|null};
export type Payment={id:string;installment:string;amountCents:number;paidOn:string;actor:string};
