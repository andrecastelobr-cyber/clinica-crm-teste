import {z} from 'zod';
import {writeRpc} from '../../../lib/api';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const key=z.string().trim().min(1).max(200);
const schema=z.object({clinic:key,id:key,start:z.string().datetime(),end:z.string().datetime()}).refine(value=>{const duration=Date.parse(value.end)-Date.parse(value.start);return duration>0&&duration<=86400000});
export function POST(req:Request){return writeRpc(req,'reschedule_appointment',schema)}
