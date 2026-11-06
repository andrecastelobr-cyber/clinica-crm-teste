import test from 'node:test';
import assert from 'node:assert/strict';
import {decimalUnits,productFields,totalCents} from '../lib/inventory.ts';
import {z} from 'zod';
test('valores monetários e quantidades fracionadas são exatos',()=>{
 assert.equal(decimalUnits('0,10',2),10);
 assert.equal(decimalUnits('2.125',3),2125);
 assert.equal(totalCents(3000,10),30);
 assert.equal(totalCents(1250,1990),2488);
 assert.equal(totalCents(1000000000,100000000),100000000000000);
});
test('validação rejeita negativos, excesso de casas, números não finitos e campos vazios',()=>{
 const schema=z.object(productFields);
 const valid={code:'P1',description:'Produto',quantity:'1.5',unitValue:'2.99'};
 assert.equal(schema.safeParse(valid).success,true);
 for(const patch of [{quantity:'-1'},{quantity:'1.0001'},{unitValue:'0.001'},{unitValue:'Infinity'},{quantity:'1000001'},{unitValue:'1000001'},{code:' '},{description:''}]){
  assert.equal(schema.safeParse({...valid,...patch}).success,false,JSON.stringify(patch));
 }
 assert.equal(schema.safeParse({...valid,quantity:'0',unitValue:'0'}).success,true);
});
