import {readRpc,writeRpc} from '../../../lib/api';
import {crmActions} from '../../../lib/validation';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export function GET(req:Request){return readRpc(req,'crm_read')}
export function POST(req:Request){return writeRpc(req,'crm_write',crmActions)}
