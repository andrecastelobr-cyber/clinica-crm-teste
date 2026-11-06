import {cookies} from 'next/headers';
import {ACCESS_COOKIE,isConfigured,supabaseRequest,verifyUser} from './http';
export {isConfigured};
export async function getUser(){
 if(!isConfigured())return null;
 const token=(await cookies()).get(ACCESS_COOKIE)?.value;if(!token)return null;
 const user=await verifyUser(token);
 if(!user?.email||!user.email_confirmed_at)return null;
 return {userId:user.id,email:user.email.toLowerCase(),displayName:user.user_metadata?.full_name||user.user_metadata?.name||user.email};
}
export async function rpc<T=unknown>(name:string,args:Record<string,unknown>){
 const token=(await cookies()).get(ACCESS_COOKIE)?.value;
 if(!token)throw new Error('UNAUTHENTICATED');
 return supabaseRequest<T>('/rest/v1/rpc/'+encodeURIComponent(name),{method:'POST',token,body:args});
}
