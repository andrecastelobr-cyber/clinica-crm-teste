import {z} from 'zod';
import {amountSchema,dateSchema} from '../../../lib/finance';
import {readRpc,writeRpc} from '../../../lib/api';
const key=z.string().min(1).max(200);
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),clinic:key,patient:key,description:z.string().trim().min(1).max(300),amount:amountSchema,count:z.number().int().min(1).max(120)}),
 z.object({action:z.literal('pay'),clinic:key,installment:key,amount:amountSchema,paidOn:dateSchema,requestId:z.string().uuid()})
]);
export const dynamic='force-dynamic';
export const runtime='nodejs';
export function GET(req:Request){return readRpc(req,'finance_read')}
export function POST(req:Request){return writeRpc(req,'finance_write',schema)}
