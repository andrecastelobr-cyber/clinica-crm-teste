import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){
 if(specifier==='next/server')return next('next/server.js',context);
 if(specifier==='next/headers')return {url:'data:text/javascript,'+encodeURIComponent('export async function cookies(){return globalThis.__crmTestCookies}'),shortCircuit:true};
 try{return next(specifier,context)}catch(error){if(error.code==='ERR_MODULE_NOT_FOUND'&&specifier.startsWith('.')&&!specifier.endsWith('.ts'))return next(specifier+'.ts',context);throw error}
}});
const {GET,POST}=await import('../app/api/crm/route.ts');
const {POST:pay}=await import('../app/api/finance/route.ts');
const originalFetch=globalThis.fetch;
process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';
function cookies(value){globalThis.__crmTestCookies={get:()=>value?{value}:undefined}}
function authenticatedFetch(rpcHandler){return async(url,options)=>{
 if(url.endsWith('/auth/v1/user'))return Response.json({id:'u1',email:'person@test.com',email_confirmed_at:'2026-01-01',user_metadata:{full_name:'Person'}});
 return rpcHandler(url,options);
}}
function request(body,origin='https://crm.test'){return new Request('https://crm.test/api/crm',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)})}
test.afterEach(()=>{globalThis.fetch=originalFetch;cookies(null)});
test('forged legacy identity headers never authenticate a caller',async()=>{
 cookies(null);globalThis.fetch=()=>{throw Error('must not fetch')};
 const result=await GET(new Request('https://crm.test/api/crm',{headers:{'oai-authenticated-user-id':'victim','oai-authenticated-user-email':'victim@test.com'}}));
 assert.equal(result.status,401);
});
test('unconfirmed accounts are rejected before any data RPC',async()=>{
 cookies('token');globalThis.fetch=async()=>Response.json({id:'u1',email:'person@test.com'});
 assert.equal((await GET(new Request('https://crm.test/api/crm'))).status,401);
});
test('read passes only clinic and record identifiers with the verified bearer token',async()=>{
 cookies('token');globalThis.fetch=authenticatedFetch((url,options)=>{
  assert.equal(url,'https://test.supabase.co/rest/v1/rpc/crm_read');
  assert.equal(options.headers.Authorization,'Bearer token');
  assert.deepEqual(JSON.parse(options.body),{p_clinic:'c1',p_record:'p1'});
  return Response.json({notes:[]});
 });
 const response=await GET(new Request('https://crm.test/api/crm?clinic=c1&patient=p1&role=admin&userId=victim'));
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{notes:[]});assert.match(response.headers.get('Cache-Control'),/no-store/);
});
test('cross-origin mutations are blocked before authentication or database calls',async()=>{
 cookies('token');globalThis.fetch=()=>{throw Error('must not fetch')};
 assert.equal((await POST(request({action:'clinic',name:'Test'},'https://evil.test'))).status,403);
});
test('create strips browser-supplied identity and role; authorization remains in PostgreSQL',async()=>{
 cookies('token');globalThis.fetch=authenticatedFetch((url,options)=>{assert.deepEqual(JSON.parse(options.body),{p_data:{action:'clinic',name:'Test'}});return Response.json({id:'c1'})});
 assert.equal((await POST(request({action:'clinic',name:' Test ',owner:'victim',role:'admin'}))).status,200);
});
test('negative payment is rejected before writing and forbidden database operations return 403',async()=>{
 cookies('token');globalThis.fetch=authenticatedFetch(()=>{throw Error('must not call RPC')});
 const invalid={action:'pay',clinic:'c1',installment:'i1',amount:'-1',paidOn:'2026-01-01',requestId:crypto.randomUUID()};
 assert.equal((await pay(request(invalid))).status,400);
 globalThis.fetch=authenticatedFetch(()=>Response.json({code:'42501',message:'forbidden'},{status:403}));
 assert.equal((await GET(new Request('https://crm.test/api/crm?clinic=other'))).status,403);
});

const {POST:login}=await import('../app/auth/login/route.ts');
const {POST:logout}=await import('../app/auth/logout/route.ts');
const {proxy}=await import('../proxy.ts');
const {NextRequest}=await import('next/server.js');
test('login sets HttpOnly session cookies only after verifying the confirmed user',async()=>{
 globalThis.fetch=async(url)=>url.includes('/token?')?Response.json({access_token:'access',refresh_token:'refresh',expires_in:3600}):Response.json({id:'u1',email:'person@test.com',email_confirmed_at:'2026-01-01'});
 const response=await login(new Request('https://crm.test/auth/login',{method:'POST',headers:{origin:'https://crm.test','Content-Type':'application/x-www-form-urlencoded'},body:'email=person%40test.com&password=password'}));
 assert.equal(response.status,303);assert.equal(response.headers.get('Location'),'https://crm.test/');
 assert.equal(response.cookies.get('crm-access').value,'access');assert.equal(response.cookies.get('crm-refresh').value,'refresh');
 assert.match(response.headers.get('Set-Cookie'),/HttpOnly/i);
});
test('proxy refreshes expired sessions and propagates the new cookies without caching',async()=>{
 globalThis.fetch=async(url)=>{assert.match(url,/grant_type=refresh_token/);return Response.json({access_token:'new-access',refresh_token:'new-refresh',expires_in:3600})};
 const req=new NextRequest('https://crm.test/',{headers:{cookie:'crm-access=expired; crm-refresh=old-refresh'}});
 const response=await proxy(req);
 assert.equal(response.cookies.get('crm-access').value,'new-access');
 assert.equal(req.cookies.get('crm-access').value,'new-access');assert.match(response.headers.get('Cache-Control'),/no-store/);
});
test('proxy preserves cookies during a transient outage, but clears rejected refresh tokens',async()=>{
 globalThis.fetch=async()=>Response.json({message:'outage'},{status:503});
 let response=await proxy(new NextRequest('https://crm.test/',{headers:{cookie:'crm-access=expired; crm-refresh=old-refresh'}}));
 assert.equal(response.cookies.get('crm-refresh'),undefined);
 globalThis.fetch=async()=>Response.json({message:'invalid'},{status:400});
 response=await proxy(new NextRequest('https://crm.test/',{headers:{cookie:'crm-access=expired; crm-refresh=old-refresh'}}));
 assert.equal(response.cookies.get('crm-refresh').value,'');
});
test('logout revokes the current session and clears browser cookies',async()=>{
 cookies('access');globalThis.fetch=async(url,options)=>{assert.match(url,/logout\?scope=local/);assert.equal(options.headers.Authorization,'Bearer access');return new Response(null,{status:204})};
 const response=await logout(new Request('https://crm.test/auth/logout',{method:'POST',headers:{origin:'https://crm.test'}}));
 assert.equal(response.status,303);assert.equal(response.cookies.get('crm-access').value,'');assert.equal(response.cookies.get('crm-refresh').value,'');
});
