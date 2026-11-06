import test from 'node:test';
import assert from 'node:assert/strict';
import {ACCESS_COOKIE,REFRESH_COOKIE,SupabaseError,config,passwordSession,verifyUser,refreshSession,needsRefresh,safeReturnTo,sameOrigin,sessionCookies} from '../lib/supabase/http.ts';
const originalFetch=globalThis.fetch;
process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';
test.afterEach(()=>{globalThis.fetch=originalFetch});
test('login sends password only to the configured HTTPS auth API, without caching',async()=>{
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,'https://test.supabase.co/auth/v1/token?grant_type=password');
  assert.equal(options.cache,'no-store');assert.equal(options.headers.apikey,'sb_publishable_test');
  assert.deepEqual(JSON.parse(options.body),{email:'person@test.com',password:'test-password'});
  return Response.json({access_token:'access',refresh_token:'refresh',expires_in:3600});
 };
 assert.equal((await passwordSession('person@test.com','test-password')).access_token,'access');
});
test('sessions are verified remotely; invalid and unconfirmed users cannot be trusted',async()=>{
 globalThis.fetch=async(url,options)=>{assert.equal(url,'https://test.supabase.co/auth/v1/user');assert.equal(options.headers.Authorization,'Bearer fake');return Response.json({message:'invalid'},{status:401})};
 assert.equal(await verifyUser('fake'),null);
 globalThis.fetch=async()=>Response.json({message:'outage'},{status:503});
 await assert.rejects(verifyUser('fake'),SupabaseError);
});
test('refresh exchanges the refresh token without trusting token claims as identity',async()=>{
 globalThis.fetch=async(url,options)=>{assert.match(url,/grant_type=refresh_token/);assert.deepEqual(JSON.parse(options.body),{refresh_token:'refresh'});return Response.json({access_token:'new',refresh_token:'rotated',expires_in:3600})};
 assert.equal((await refreshSession('refresh')).refresh_token,'rotated');
 assert.equal(needsRefresh('invalid'),true);assert.equal(needsRefresh(),true);
 const jwt='x.'+Buffer.from(JSON.stringify({exp:Date.now()/1000+3600})).toString('base64url')+'.x';
 assert.equal(needsRefresh(jwt),false);
});
test('cookies are HttpOnly, scoped to the site and SameSite; redirects cannot leave the site',()=>{
 const cookies=sessionCookies({access_token:'a',refresh_token:'r',expires_in:3600});
 assert.deepEqual(cookies.map(c=>c.name),[ACCESS_COOKIE,REFRESH_COOKIE]);
 for(const cookie of cookies){assert.equal(cookie.httpOnly,true);assert.equal(cookie.sameSite,'lax');assert.equal(cookie.path,'/')}
 for(const path of ['https://evil.test','//evil.test','/\\evil.test','javascript:alert(1)'])assert.equal(safeReturnTo(path),'/');
 assert.equal(safeReturnTo('/login?error=invalid'),'/login?error=invalid');
});
test('state changes require the exact same origin; secret keys are rejected',()=>{
 assert.equal(sameOrigin(new Request('https://crm.test/api',{headers:{origin:'https://crm.test'}})),true);
 assert.equal(sameOrigin(new Request('https://crm.test/api',{headers:{origin:'https://evil.test'}})),false);
 assert.equal(sameOrigin(new Request('https://crm.test/api')),false);
 process.env.SUPABASE_PUBLISHABLE_KEY='sb_secret_test';assert.throws(config);process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';
});

test('production session cookies require HTTPS and legacy service-role keys are refused',()=>{
 const previous=process.env.NODE_ENV;process.env.NODE_ENV='production';
 try{for(const c of sessionCookies({access_token:'a',refresh_token:'r',expires_in:3600}))assert.equal(c.secure,true)}finally{if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous}
 process.env.SUPABASE_PUBLISHABLE_KEY='eyJ.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.test';
 assert.throws(config);process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';
});
