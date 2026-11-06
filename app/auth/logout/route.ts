import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {ACCESS_COOKIE,REFRESH_COOKIE,sameOrigin,supabaseRequest} from '../../../lib/supabase/http';
export async function POST(req:Request){
 if(!sameOrigin(req))return new Response('Origem inválida.',{status:403});
 const token=(await cookies()).get(ACCESS_COOKIE)?.value;
 if(token){try{await supabaseRequest('/auth/v1/logout?scope=local',{method:'POST',token})}catch{/* Always clear browser cookies, including during an upstream outage. */}}
 const response=NextResponse.redirect(new URL('/login',req.url),303);
 response.cookies.delete(ACCESS_COOKIE);response.cookies.delete(REFRESH_COOKIE);
 response.headers.set('Cache-Control','private, no-store');return response;
}
