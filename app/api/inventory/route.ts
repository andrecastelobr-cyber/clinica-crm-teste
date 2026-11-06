import {z} from 'zod';
import {productFields} from '../../../lib/inventory';
import {readRpc,writeRpc} from '../../../lib/api';
const key=z.string().min(1).max(200);
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),clinic:key,...productFields}),
 z.object({action:z.literal('update'),clinic:key,targetClinic:key,id:key,...productFields}),
 z.object({action:z.literal('delete'),clinic:key,id:key})
]);
export const dynamic='force-dynamic';
export const runtime='nodejs';
export function GET(req:Request){return readRpc(req,'inventory_read')}
export function POST(req:Request){return writeRpc(req,'inventory_write',schema)}
