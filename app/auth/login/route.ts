import {NextResponse} from 'next/server';
import {isConfigured,passwordSession,sameOrigin,sessionCookies,SupabaseError,verifyUser} from '../../../lib/supabase/http';
export async function POST(req:Request){
 if(!sameOrigin(req))return new Response('Origem inválida.',{status:403});
 const redirect=(error:string)=>NextResponse.redirect(new URL('/login?error='+error,req.url),303);
 if(!isConfigured())return redirect('setup');
 const raw=await req.text();if(raw.length>8192)return redirect('invalid');
 const data=new URLSearchParams(raw),email=data.get('email')?.trim(),password=data.get('password');
 if(!email||email.length>320||!password||password.length>1024)return redirect('invalid');
 try{
  const session=await passwordSession(email,password);
  const user=await verifyUser(session.access_token);
  if(!user?.email_confirmed_at)return redirect('confirmation');
  const response=NextResponse.redirect(new URL('/',req.url),303);
  for(const cookie of sessionCookies(session))response.cookies.set(cookie);
  response.headers.set('Cache-Control','private, no-store');return response;
 }catch(e){return redirect(e instanceof SupabaseError&&e.status===429?'limit':e instanceof SupabaseError&&e.status<500?'invalid':'unavailable')}
}
