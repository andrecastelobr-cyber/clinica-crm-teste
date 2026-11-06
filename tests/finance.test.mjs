import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context)}catch(error){if(error.code==='ERR_MODULE_NOT_FOUND'&&specifier.startsWith('.')&&!specifier.endsWith('.ts'))return next(specifier+'.ts',context);throw error}}});
const {splitInstallments,amountSchema,dateSchema}=await import('../lib/finance.ts');
test('parcelas preservam o total e colocam os centavos restantes na última',()=>{
 assert.deepEqual(splitInstallments(10000,3),[3333,3333,3334]);
 assert.deepEqual(splitInstallments(1,1),[1]);
 assert.deepEqual(splitInstallments(100000000,120).reduce((sum,n)=>sum+n,0),100000000);
 for(const count of [0,121,1.5])assert.throws(()=>splitInstallments(100,count));
 assert.throws(()=>splitInstallments(1,2));
});
test('pagamentos aceitam somente valores positivos e datas reais sem futuro',()=>{
 assert.equal(amountSchema.parse('123,45'),12345);
 for(const value of ['0','-1','1.001','1000001','NaN'])assert.equal(amountSchema.safeParse(value).success,false);
 assert.equal(dateSchema.safeParse('2026-02-30').success,false);
 assert.equal(dateSchema.safeParse('2024-02-29').success,true);
 assert.equal(dateSchema.safeParse('2099-01-01').success,false);
});
