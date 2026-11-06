import {redirect} from 'next/navigation';
import {getUser} from '../lib/supabase/server';
import Dashboard from './dashboard';
export const dynamic='force-dynamic';
export default async function Page(){
 let user;try{user=await getUser()}catch{redirect('/login?error=unavailable')}if(!user)redirect('/login');
 return <Dashboard user={{name:user.displayName,email:user.email}}/>;
}
