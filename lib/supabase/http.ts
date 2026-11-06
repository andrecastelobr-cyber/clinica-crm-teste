export const ACCESS_COOKIE='crm-access';
export const REFRESH_COOKIE='crm-refresh';
export type Session={access_token:string;refresh_token:string;expires_in:number};
export type AuthUser={id:string;email?:string;email_confirmed_at?:string;user_metadata?:{full_name?:string;name?:string}};
export class SupabaseError extends Error{status:number;code:string;constructor(status:number,code:string,message:string){super(message);this.status=status;this.code=code}}
export function isConfigured(){return Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_PUBLISHABLE_KEY)}
export function config(){
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)throw new SupabaseError(503,'CONFIGURATION','Ambiente em configuração.');
 const parsed=new URL(url);
 if(parsed.protocol!=='https:'&&!(parsed.protocol==='http:'&&['localhost','127.0.0.1'].includes(parsed.hostname)))throw new Error('Supabase URL must use HTTPS');
 if(key.startsWith('sb_secret_'))throw new Error('Use a publishable key, never a secret key');
 if(key.startsWith('eyJ')){let role;try{role=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role}catch{throw new Error('Invalid legacy publishable key')}if(role!=='anon')throw new Error('Use an anon key, never a service role key');}
 return {url:parsed.origin,key};
}
export async function supabaseRequest<T>(path:string,{token,body,method='GET'}:{token?:string;body?:unknown;method?:string}={}):Promise<T>{
 const {url,key}=config();
 const response=await fetch(url+path,{method,headers:{apikey:key,...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(20000)});
 if(!response.ok){const error=await response.json().catch(()=>({})) as {code?:string;error_code?:string;message?:string};throw new SupabaseError(response.status,error.code||error.error_code||'UPSTREAM',error.message||'Não foi possível acessar o serviço.');}
 if(response.status===204)return undefined as T;
 const text=await response.text();return (text?JSON.parse(text):undefined) as T;
}
export function passwordSession(email:string,password:string){return supabaseRequest<Session>('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}})}
export function refreshSession(token:string){return supabaseRequest<Session>('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:token}})}
export async function verifyUser(token:string):Promise<AuthUser|null>{try{return await supabaseRequest<AuthUser>('/auth/v1/user',{token})}catch(e){if(e instanceof SupabaseError&&[400,401,403].includes(e.status))return null;throw e}}
export function needsRefresh(token?:string){if(!token)return true;try{const payload=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());return typeof payload.exp!=='number'||payload.exp*1000<Date.now()+60000}catch{return true}}
export function safeReturnTo(value:string|null|undefined){if(!value||!value.startsWith('/')||value.startsWith('//')||value.includes('\\'))return '/';try{const url=new URL(value,'https://crm.local');return url.origin==='https://crm.local'?url.pathname+url.search:'/'}catch{return '/'}}
export function sameOrigin(req:Request){return req.headers.get('origin')===new URL(req.url).origin}
export function sessionCookies(session:Session){return [
 {name:ACCESS_COOKIE,value:session.access_token,maxAge:Math.max(60,Math.min(session.expires_in,86400))},
 {name:REFRESH_COOKIE,value:session.refresh_token,maxAge:60*60*24*7}
].map(cookie=>({...cookie,httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/'}))}
