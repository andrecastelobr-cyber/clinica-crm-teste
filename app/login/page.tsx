import {redirect} from 'next/navigation';
import {Activity} from 'lucide-react';
import {getUser,isConfigured} from '../../lib/supabase/server';
export const dynamic='force-dynamic';
const messages:Record<string,string>={invalid:'E-mail ou senha inválidos. Confira os dados e tente novamente.',confirmation:'Confirme seu e-mail para entrar.',setup:'O ambiente está em configuração. Entre em contato com o administrador.',unavailable:'O serviço de acesso está indisponível no momento. Tente novamente.',limit:'Muitas tentativas de acesso. Aguarde um pouco antes de tentar novamente.'};
export default async function Login({searchParams}:{searchParams:Promise<{error?:string}>}){
 const ready=isConfigured();
 let signedIn=false;if(ready){try{signedIn=Boolean(await getUser())}catch{/* Show the sign-in page during an authentication outage. */}}if(signedIn)redirect('/');
 const params=await searchParams;
 return <main className="login-page"><section className="login-card"><span className="brand-icon"><Activity size={26}/></span><span className="eyebrow">GESTÃO E CUIDADO</span><h1>Bem-vindo à sua clínica.</h1><p>Entre para acessar sua agenda e os módulos da clínica.</p>{(!ready||params.error)&&<div className="error" role="alert">{!ready?messages.setup:messages[params.error||'']||messages.unavailable}</div>}<form method="post" action="/auth/login"><label>E-mail<input name="email" type="email" autoComplete="username" required maxLength={320}/></label><label>Senha<input name="password" type="password" autoComplete="current-password" required maxLength={1024}/></label><button className="primary" disabled={!ready}>Entrar</button></form><p className="login-help">Seu acesso é cadastrado pelo administrador. Para recuperar a senha, entre em contato com ele.</p></section></main>
}
