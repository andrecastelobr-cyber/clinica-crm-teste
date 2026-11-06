-- Run ONLY in a test Supabase project, after the migration, as postgres.
-- All fixtures and operations are rolled back. Any failure aborts the test.
begin;
insert into auth.users(id,email,email_confirmed_at,aud,role) values
 ('10000000-0000-4000-8000-000000000001','crm-owner-one@example.invalid',now(),'authenticated','authenticated'),
 ('10000000-0000-4000-8000-000000000002','crm-owner-two@example.invalid',now(),'authenticated','authenticated'),
 ('10000000-0000-4000-8000-000000000003','crm-reception@example.invalid',now(),'authenticated','authenticated');
insert into public.clinics values
 ('crm-test-clinic-one','Test One','10000000-0000-4000-8000-000000000001'),
 ('crm-test-clinic-two','Test Two','10000000-0000-4000-8000-000000000002');
insert into public.members(id,clinic,email,role,name,specialty) values
 ('crm-test-doctor','crm-test-clinic-one','crm-doctor@example.invalid','professional','Doctor','Medicina'),
 ('crm-test-reception','crm-test-clinic-one','crm-reception@example.invalid','reception','Reception','Recepção');
insert into public.patients(id,clinic,name,birth) values
 ('crm-test-patient-one','crm-test-clinic-one','Synthetic patient one','2000-01-01'),
 ('crm-test-patient-two','crm-test-clinic-two','Synthetic patient two','2000-01-01');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare result jsonb;charge text;inst text;appointment text;ignored jsonb;
begin
 if exists(select 1 from public.clinics where id='crm-test-clinic-two') then raise exception 'RLS leaked another clinic';end if;
 begin
  perform public.crm_read('crm-test-clinic-two');
  raise sqlstate 'XX000' using message='Cross-clinic RPC unexpectedly succeeded';
 exception when insufficient_privilege then null;end;
 begin
  insert into public.patients(id,clinic,name,birth) values('illegal','crm-test-clinic-one','Illegal','2000-01-01');
  raise sqlstate 'XX000' using message='Direct write unexpectedly succeeded';
 exception when insufficient_privilege then null;end;
 result:=public.crm_write('{"action":"clinic","name":"RPC creation test"}');
 if result->>'id' is null then raise exception 'Clinic creation failed';end if;

 begin
  perform public.crm_write('{"action":"appointment","clinic":"crm-test-clinic-one","patient":"crm-test-patient-two","professional":"crm-test-doctor","start":"2027-01-01T12:00:00Z","end":"2027-01-01T12:30:00Z","reason":"Test"}');
  raise sqlstate 'XX000' using message='Foreign patient was accepted';
 exception when foreign_key_violation then null;end;
 result:=public.crm_write('{"action":"appointment","clinic":"crm-test-clinic-one","patient":"crm-test-patient-one","professional":"crm-test-doctor","start":"2027-01-01T12:00:00Z","end":"2027-01-01T12:30:00Z","reason":"Test"}');
 appointment:=result->>'id';
 begin
  perform public.crm_write('{"action":"appointment","clinic":"crm-test-clinic-one","patient":"crm-test-patient-one","professional":"crm-test-doctor","start":"2027-01-01T12:15:00Z","end":"2027-01-01T12:45:00Z","reason":"Overlap"}');
  raise sqlstate 'XX000' using message='Overlap unexpectedly accepted';
 exception when raise_exception then null;end;
 perform public.crm_write(jsonb_build_object('action','status','clinic','crm-test-clinic-one','id',appointment,'status','Cancelada'));
 perform public.crm_write('{"action":"appointment","clinic":"crm-test-clinic-one","patient":"crm-test-patient-one","professional":"crm-test-doctor","start":"2027-01-01T12:00:00Z","end":"2027-01-01T12:30:00Z","reason":"Replacement"}');
 begin
  perform public.crm_write(jsonb_build_object('action','status','clinic','crm-test-clinic-one','id',appointment,'status','Agendada'));
  raise sqlstate 'XX000' using message='Cancelled appointment was restored over an occupied slot';
 exception when raise_exception then null;end;

 result:=public.finance_write('{"action":"create","clinic":"crm-test-clinic-one","patient":"crm-test-patient-one","description":"Test treatment","amount":10000,"count":3}');
 charge:=result->>'id';
 result:=public.finance_read('crm-test-clinic-one',charge);
 if jsonb_array_length(result->'installments')<>3 then raise exception 'Installment count mismatch';end if;
 if (result#>>'{installments,2,amountCents}')::integer<>3334 then raise exception 'Remainder mismatch';end if;
 inst:=result#>>'{installments,0,id}';
 perform public.finance_write(jsonb_build_object('action','pay','clinic','crm-test-clinic-one','installment',inst,'amount',1000,'paidOn','2020-01-01','requestId','20000000-0000-4000-8000-000000000001'));
 perform public.finance_write(jsonb_build_object('action','pay','clinic','crm-test-clinic-one','installment',inst,'amount',1000,'paidOn','2020-01-01','requestId','20000000-0000-4000-8000-000000000001'));
 result:=public.finance_read('crm-test-clinic-one',charge);
 if jsonb_array_length(result->'payments')<>1 then raise exception 'Duplicate payment';end if;
 if (result#>>'{installments,0,balanceCents}')::integer<>2333 then raise exception 'Partial balance mismatch';end if;
 begin
  perform public.finance_write(jsonb_build_object('action','pay','clinic','crm-test-clinic-one','installment',inst,'amount',3000,'paidOn','2020-01-01','requestId','20000000-0000-4000-8000-000000000002'));
  raise sqlstate 'XX000' using message='Overpayment accepted';
 exception when raise_exception then null;end;

 result:=public.inventory_write('{"action":"create","clinic":"crm-test-clinic-one","code":"TEST","description":"Test product","quantity":1250,"unitValue":1990}');
 begin
  perform public.inventory_write(jsonb_build_object('action','update','clinic','crm-test-clinic-one','targetClinic','crm-test-clinic-two','id',result->>'id','code','TEST','description','Transferred','quantity',1250,'unitValue',1990));
  raise sqlstate 'XX000' using message='Cross-clinic transfer without access succeeded';
 exception when insufficient_privilege then null;end;
 result:=public.inventory_read('crm-test-clinic-one');
 if (result#>>'{products,0,totalCents}')::bigint<>2488 then raise exception 'Inventory total mismatch';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
do $$begin
 begin
  perform public.crm_read('crm-test-clinic-one','crm-test-patient-one');
  raise sqlstate 'XX000' using message='Reception read clinical notes';
 exception when insufficient_privilege then null;end;
 begin
  perform public.crm_write('{"action":"member","clinic":"crm-test-clinic-one","email":"attacker@example.invalid","role":"admin","name":"Attacker","specialty":"Medicina"}');
  raise sqlstate 'XX000' using message='Reception escalated its privileges';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$begin
 begin
  perform public.crm_read('crm-test-clinic-one');
  raise sqlstate 'XX000' using message='Anonymous RPC unexpectedly succeeded';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
