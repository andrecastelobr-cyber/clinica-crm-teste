import {existsSync,readFileSync} from 'node:fs';
// This check never prints keys, passwords, or tokens.
const env={...process.env};
if(existsSync('.env.local'))for(const line of readFileSync('.env.local','utf8').split(/\r?\n/)){
 const match=line.match(/^([A-Z_]+)\s*=\s*["']?([^"'\r\n]*)["']?\s*$/);if(match&&!env[match[1]])env[match[1]]=match[2].trim();
}
let valid=true;
for(const key of ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY']){
 const value=env[key];const okay=Boolean(value&&!value.includes('YOUR_'));console.log(key+': '+(okay?'configurada':'ausente ou exemplo'));valid&&=okay;
}
if(env.SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_secret_')){console.log('Use a chave publicável; não use uma chave secreta.');valid=false;}
if(valid){try{const url=new URL(env.SUPABASE_URL);if(url.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(url.hostname))valid=false}catch{valid=false}}
process.exitCode=valid?0:1;
