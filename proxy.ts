import {NextResponse,type NextRequest} from 'next/server';
import {ACCESS_COOKIE,REFRESH_COOKIE,isConfigured,needsRefresh,refreshSession,sessionCookies,SupabaseError} from './lib/supabase/http';
export async function proxy(request:NextRequest){
 let response=NextResponse.next();
 response.headers.set('Cache-Control','private, no-store');
 if(!isConfigured()||request.nextUrl.pathname.startsWith('/auth/'))return response;
 const access=request.cookies.get(ACCESS_COOKIE)?.value,refresh=request.cookies.get(REFRESH_COOKIE)?.value;
 if(!refresh||!needsRefresh(access))return response;
 try{
  const session=await refreshSession(refresh);
  for(const cookie of sessionCookies(session))request.cookies.set(cookie.name,cookie.value);
  response=NextResponse.next({request});
  for(const cookie of sessionCookies(session))response.cookies.set(cookie);
  response.headers.set('Cache-Control','private, no-store');
 }catch(e){
  // Keep the session on transient network failures; do not turn an outage into sign-out.
  if(e instanceof SupabaseError&&[400,401,403].includes(e.status)){
   request.cookies.delete(ACCESS_COOKIE);request.cookies.delete(REFRESH_COOKIE);
   response=NextResponse.next({request});
   response.cookies.delete(ACCESS_COOKIE);response.cookies.delete(REFRESH_COOKIE);
   response.headers.set('Cache-Control','private, no-store');
  }
 }
 return response;
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|favicon.svg).*)']};
