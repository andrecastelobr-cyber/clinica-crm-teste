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

const {POST:reschedule}=await import('../app/api/appointments/route.ts');
test('rescheduling validates dates before RPC and only forwards appointment identifiers and times',async()=>{
 cookies('token');globalThis.fetch=authenticatedFetch(()=>{throw Error('Invalid dates must not reach RPC')});
 const body={clinic:'c1',id:'a1',start:'2027-01-01T12:00:00Z',end:'2027-01-01T11:00:00Z'};
 assert.equal((await reschedule(request(body))).status,400);
 assert.equal((await reschedule(request({...body,end:'2027-01-03T12:00:00Z'}))).status,400);
 const valid={...body,end:'2027-01-01T12:30:00Z'};
 globalThis.fetch=authenticatedFetch((url,options)=>{
  assert.match(url,/\/rpc\/reschedule_appointment$/);
  assert.deepEqual(JSON.parse(options.body),{p_data:valid});return Response.json({ok:true,id:'a1'});
 });
 assert.equal((await reschedule(request({...valid,patient:'forged',professional:'forged',status:'Concluída'}))).status,200);
});
test('rescheduling requires authentication, origin and database authorization; conflicts reach the caller',async()=>{
 const body={clinic:'c1',id:'a1',start:'2027-01-01T12:00:00Z',end:'2027-01-01T12:30:00Z'};
 cookies(null);assert.equal((await reschedule(request(body))).status,401);
 cookies('token');assert.equal((await reschedule(request(body,'https://evil.test'))).status,403);
 globalThis.fetch=authenticatedFetch(()=>Response.json({code:'42501',message:'forbidden'},{status:403}));
 assert.equal((await reschedule(request(body))).status,403);
 globalThis.fetch=authenticatedFetch(()=>Response.json({code:'P0001',message:'Este profissional já tem uma consulta nesse horário.'},{status:400}));
 const response=await reschedule(request(body));assert.equal(response.status,400);assert.match((await response.json()).error,/já tem uma consulta/);
});

const {GET:readPhoto,POST:savePhoto}=await import('../app/api/patient-photo/route.ts');
const photoUrl='https://crm.test/api/patient-photo?clinic=c1&patient=p1';
const jpeg=new Uint8Array([255,216,255,224,0,2,255,217]);
function photoRequest(body=jpeg,headers={}){return new Request(photoUrl,{method:'POST',headers:{origin:'https://crm.test','Content-Type':'image/jpeg',...headers},body})}
test('patient photos require authentication, matching origin and bounded JPEG input',async()=>{
 cookies(null);assert.equal((await readPhoto(new Request(photoUrl))).status,401);
 cookies('token');globalThis.fetch=authenticatedFetch(()=>{throw Error('Invalid input must not reach Storage')});
 assert.equal((await savePhoto(photoRequest(jpeg,{origin:'https://evil.test'}))).status,403);
 assert.equal((await savePhoto(photoRequest('hello',{'Content-Type':'image/png'}))).status,400);
 assert.equal((await savePhoto(photoRequest(new Uint8Array(512*1024+1)))).status,413);
 assert.equal((await savePhoto(photoRequest(new Uint8Array([1,2,3,4])))).status,400);
 assert.equal((await readPhoto(new Request('https://crm.test/api/patient-photo?clinic=../other&patient=p1'))).status,400);
});
test('photo uploads and reads use user credentials and a private patient-specific object',async()=>{
 cookies('token');globalThis.fetch=authenticatedFetch((url,options)=>{
  assert.equal(url,'https://test.supabase.co/storage/v1/object/patient-photos/c1/p1.jpg');
  assert.equal(options.method,'POST');assert.equal(options.headers.Authorization,'Bearer token');assert.equal(options.headers['x-upsert'],'true');
  assert.deepEqual(new Uint8Array(options.body),jpeg);return Response.json({Key:'c1/p1.jpg'});
 });
 assert.equal((await savePhoto(photoRequest())).status,200);
 globalThis.fetch=authenticatedFetch((url,options)=>{
  assert.equal(url,'https://test.supabase.co/storage/v1/object/authenticated/patient-photos/c1/p1.jpg');assert.equal(options.headers.Authorization,'Bearer token');return new Response(jpeg);
 });
 const image=await readPhoto(new Request(photoUrl));assert.equal(image.status,200);assert.equal(image.headers.get('Content-Type'),'image/jpeg');assert.match(image.headers.get('Cache-Control'),/no-store/);assert.deepEqual(new Uint8Array(await image.arrayBuffer()),jpeg);
});
test('photo authorization failures are not reported as successful saves or public images',async()=>{
 cookies('token');globalThis.fetch=authenticatedFetch(()=>Response.json({message:'forbidden'},{status:403}));
 assert.equal((await savePhoto(photoRequest())).status,403);
 const result=await readPhoto(new Request(photoUrl));assert.equal(result.status,404);assert.match(result.headers.get('Cache-Control'),/no-store/);
 globalThis.fetch=authenticatedFetch(()=>Response.json({message:'Bucket not found'},{status:400}));
 assert.equal((await savePhoto(photoRequest())).status,503);
});
