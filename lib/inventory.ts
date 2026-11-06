import {z} from 'zod';
export function decimalUnits(value:string,places:number):number|null{
 const normalized=value.trim().replace(',','.');
 if(!new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(normalized))return null;
 const [whole,fraction='']=normalized.split('.');
 const units=Number(whole)*10**places+Number(fraction.padEnd(places,'0'));
 return Number.isSafeInteger(units)?units:null;
}
function decimal(places:number,max:number){return z.string().trim().refine(v=>{const n=decimalUnits(v,places);return n!==null&&n<=max},'Valor inválido ou acima do limite').transform(v=>decimalUnits(v,places)!)}
export const productFields={code:z.string().trim().min(1).max(80),description:z.string().trim().min(1).max(300),quantity:decimal(3,1000000000),unitValue:decimal(2,100000000)};
export function totalCents(quantityMilli:number,unitCents:number){return Number((BigInt(quantityMilli)*BigInt(unitCents)+BigInt(500))/BigInt(1000))}
export type Product={id:string;clinic:string;code:string;description:string;quantityMilli:number;unitCents:number;totalCents:number};
