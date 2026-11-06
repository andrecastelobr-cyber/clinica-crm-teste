-- Apply once to a NEW Supabase project using the SQL editor or Supabase CLI.
-- The local Cloudflare/SQLite database is intentionally not imported here.
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.clinics (
 id text primary key default gen_random_uuid()::text,
 name text not null check(length(btrim(name)) between 1 and 200),
 owner uuid not null references auth.users(id)
);
create index clinics_owner on public.clinics(owner);
create table public.members (
 id text primary key default gen_random_uuid()::text,
 clinic text not null references public.clinics(id),
 email text not null check(email=lower(btrim(email)) and length(email) between 3 and 320),
 role text not null check(role in ('admin','professional','reception')),
 name text not null check(length(btrim(name)) between 1 and 200),
 specialty text not null check(specialty in ('Medicina','Odontologia','Recepção')),
 is_default boolean not null default false,
 unique(clinic,email),unique(id,clinic)
);
create index members_email on public.members(email);
create table public.patients (
 id text primary key default gen_random_uuid()::text,clinic text not null references public.clinics(id),
 name text not null check(length(btrim(name)) between 1 and 200),birth date not null,phone text not null default '' check(length(phone)<=40),
 created timestamptz not null default now(),unique(id,clinic)
);
create table public.appointments (
 id text primary key default gen_random_uuid()::text,clinic text not null references public.clinics(id),
 patient text not null,professional text not null,start timestamptz not null,"end" timestamptz not null,
 status text not null check(status in ('Agendada','Confirmada','Na recepção','Concluída','Cancelada')),
 reason text not null check(length(btrim(reason)) between 1 and 200),
 foreign key(patient,clinic) references public.patients(id,clinic),
 foreign key(professional,clinic) references public.members(id,clinic),
 check("end">start and "end"<=start+interval '1 day')
);
create index appointments_clinic_day on public.appointments(clinic,start);
create index appointments_professional on public.appointments(clinic,professional,start,"end") where status<>'Cancelada';
create table public.notes (
 id text primary key default gen_random_uuid()::text,clinic text not null references public.clinics(id),patient text not null,
 author text not null,specialty text not null check(specialty in ('Medicina','Odontologia')),
 subjective text not null check(length(btrim(subjective)) between 1 and 10000),objective text not null default '' check(length(objective)<=10000),
 assessment text not null default '' check(length(assessment)<=10000),plan text not null check(length(btrim(plan)) between 1 and 10000),
 tooth text not null default '' check(length(tooth)<=100),created timestamptz not null default now(),
 foreign key(patient,clinic) references public.patients(id,clinic)
);
create index notes_patient on public.notes(clinic,patient,created desc);
create table public.audit (
 id text primary key default gen_random_uuid()::text,clinic text not null references public.clinics(id),actor text not null,
 action text not null,resource text not null,created timestamptz not null default now()
);
create index audit_clinic on public.audit(clinic,created desc);
create table public.products (
 id text primary key default gen_random_uuid()::text,clinic text not null references public.clinics(id),
 code text not null check(length(btrim(code)) between 1 and 80),description text not null check(length(btrim(description)) between 1 and 300),
 quantity_milli integer not null check(quantity_milli between 0 and 1000000000),
 unit_cents integer not null check(unit_cents between 0 and 100000000),
 created timestamptz not null default now(),updated timestamptz not null default now(),unique(clinic,code)
);
create table public.charges (
 id text primary key default gen_random_uuid()::text,clinic text not null references public.clinics(id),patient text not null,
 description text not null check(length(btrim(description)) between 1 and 300),total_cents integer not null check(total_cents between 1 and 100000000),
 installment_count integer not null check(installment_count between 1 and 120 and installment_count<=total_cents),created timestamptz not null default now(),
 foreign key(patient,clinic) references public.patients(id,clinic),unique(id,clinic)
);
create table public.installments (
 id text primary key default gen_random_uuid()::text,clinic text not null references public.clinics(id),charge text not null,
 number integer not null check(number between 1 and 120),amount_cents integer not null check(amount_cents between 1 and 100000000),
 foreign key(charge,clinic) references public.charges(id,clinic),unique(charge,number),unique(id,clinic)
);
create table public.payments (
 id text primary key,clinic text not null references public.clinics(id),installment text not null,
 amount_cents integer not null check(amount_cents between 1 and 100000000),paid_on date not null,actor text not null,created timestamptz not null default now(),
 foreign key(installment,clinic) references public.installments(id,clinic)
);
create index payments_installment on public.payments(clinic,installment);

-- Helpers use only the authenticated user's CURRENT confirmed email in auth.users.
-- Never trust a browser-supplied user id, email, role, or metadata for authorization.
create function private.current_email() returns text language sql stable security definer set search_path='' as $$
 select lower(u.email) from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null
$$;
create function private.clinic_role(p_clinic text) returns text language sql stable security definer set search_path='' as $$
 select case when c.owner=auth.uid() then 'admin' else
  (select m.role from public.members m where m.clinic=c.id and m.email=private.current_email()) end
 from public.clinics c where c.id=p_clinic and private.current_email() is not null
$$;
create function private.require_access(p_clinic text) returns text language plpgsql stable security definer set search_path='' as $$
 declare r text;
 begin
  if auth.uid() is null or private.current_email() is null then raise insufficient_privilege using message='Acesso autenticado obrigatório.';end if;
  r:=private.clinic_role(p_clinic);
  if r is null then raise insufficient_privilege using message='Acesso negado a esta clínica.';end if;
  return r;
 end
$$;
revoke all on function private.current_email(),private.clinic_role(text),private.require_access(text) from public,anon;
grant execute on function private.current_email(),private.clinic_role(text),private.require_access(text) to authenticated;

-- RLS protects direct reads too. All writes are exposed ONLY through the checked RPCs below.
alter table public.clinics enable row level security;
alter table public.members enable row level security;
alter table public.patients enable row level security;
alter table public.appointments enable row level security;
alter table public.notes enable row level security;
alter table public.audit enable row level security;
alter table public.products enable row level security;
alter table public.charges enable row level security;
alter table public.installments enable row level security;
alter table public.payments enable row level security;
create policy clinics_read on public.clinics for select to authenticated using(private.clinic_role(id) is not null);
create policy members_read on public.members for select to authenticated using(private.clinic_role(clinic) is not null);
create policy patients_read on public.patients for select to authenticated using(private.clinic_role(clinic) is not null);
create policy appointments_read on public.appointments for select to authenticated using(private.clinic_role(clinic) is not null);
-- Clinical notes must be read through crm_read so each access is audited.
create policy audit_read on public.audit for select to authenticated using(private.clinic_role(clinic)='admin');
create policy products_read on public.products for select to authenticated using(private.clinic_role(clinic) is not null);
create policy charges_read on public.charges for select to authenticated using(private.clinic_role(clinic) is not null);
create policy installments_read on public.installments for select to authenticated using(private.clinic_role(clinic) is not null);
create policy payments_read on public.payments for select to authenticated using(private.clinic_role(clinic) is not null);
revoke all on public.clinics,public.members,public.patients,public.appointments,public.notes,public.audit,public.products,public.charges,public.installments,public.payments from anon,authenticated;
grant select on public.clinics,public.members,public.patients,public.appointments,public.audit,public.products,public.charges,public.installments,public.payments to authenticated;

create function public.crm_read(p_clinic text default null,p_record text default null) returns jsonb language plpgsql security definer set search_path='' as $$
 declare clinics_json jsonb;r text;result jsonb;
 begin
  if private.current_email() is null then raise insufficient_privilege;end if;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.name),'[]') into clinics_json from public.clinics c where private.clinic_role(c.id) is not null;
  if p_clinic is null then return jsonb_build_object('clinics',clinics_json);end if;
  r:=private.require_access(p_clinic);
  if p_record is not null then
   if r not in ('admin','professional') then raise insufficient_privilege;end if;
   if not exists(select 1 from public.patients where id=p_record and clinic=p_clinic) then raise exception 'Paciente não encontrado.';end if;
   select coalesce(jsonb_agg(to_jsonb(n) order by n.created desc),'[]') into result from public.notes n where n.clinic=p_clinic and n.patient=p_record;
   insert into public.audit(clinic,actor,action,resource) values(p_clinic,private.current_email(),'read_notes',p_record);
   return jsonb_build_object('notes',result);
  end if;
  return jsonb_build_object('clinics',clinics_json,'role',r,
   'patients',(select coalesce(jsonb_agg(to_jsonb(p) order by p.name),'[]') from public.patients p where p.clinic=p_clinic),
   'members',(select coalesce(jsonb_agg(to_jsonb(m)-'is_default' order by m.name),'[]') from public.members m where m.clinic=p_clinic and not m.is_default),
   'appointments',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('patientName',p.name,'professionalName',m.name) order by a.start),'[]') from public.appointments a join public.patients p on p.id=a.patient and p.clinic=a.clinic join public.members m on m.id=a.professional and m.clinic=a.clinic where a.clinic=p_clinic and m.role='professional')
  );
 end
$$;

create function public.crm_write(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare a text:=p_data->>'action';c text:=p_data->>'clinic';r text;resource text:=gen_random_uuid()::text;prof text;starts timestamptz;ends timestamptz;existing public.appointments%rowtype;status_value text;
 begin
  if private.current_email() is null then raise insufficient_privilege;end if;
  if a='clinic' then
   insert into public.clinics(id,name,owner) values(resource,btrim(p_data->>'name'),auth.uid());
   insert into public.members(clinic,email,role,name,specialty,is_default) values(resource,private.current_email(),'admin',coalesce((select coalesce(raw_user_meta_data->>'full_name',email) from auth.users where id=auth.uid()),private.current_email()),'Medicina',true);
   insert into public.audit(clinic,actor,action,resource) values(resource,private.current_email(),'clinic',resource);
   return jsonb_build_object('id',resource);
  end if;
  r:=private.require_access(c);
  if a='member' then
   if r<>'admin' then raise insufficient_privilege;end if;
   insert into public.members(id,clinic,email,role,name,specialty) values(resource,c,lower(btrim(p_data->>'email')),p_data->>'role',btrim(p_data->>'name'),p_data->>'specialty');
  elsif a='patient' then
   if (p_data->>'birth')::date>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Data de nascimento inválida.';end if;
   insert into public.patients(id,clinic,name,birth,phone) values(resource,c,btrim(p_data->>'name'),(p_data->>'birth')::date,coalesce(p_data->>'phone',''));
  elsif a='appointment' then
   prof:=p_data->>'professional';starts:=(p_data->>'start')::timestamptz;ends:=(p_data->>'end')::timestamptz;
   if not exists(select 1 from public.members where id=prof and clinic=c and role='professional') then raise exception 'Profissional inválido.';end if;
   perform pg_advisory_xact_lock(hashtextextended(c||':'||prof,0));
   if exists(select 1 from public.appointments where clinic=c and professional=prof and status<>'Cancelada' and start<ends and "end">starts) then raise exception 'Este profissional já tem uma consulta nesse horário.';end if;
   insert into public.appointments values(resource,c,p_data->>'patient',prof,starts,ends,'Agendada',btrim(p_data->>'reason'));
  elsif a='status' then
   resource:=p_data->>'id';
   -- Serialize by professional before locking the appointment to avoid deadlocks with creation.
   select professional into prof from public.appointments where id=resource and clinic=c;
   if prof is null then raise exception 'Consulta não encontrada.';end if;
   perform pg_advisory_xact_lock(hashtextextended(c||':'||prof,0));
   select * into existing from public.appointments where id=resource and clinic=c for update;
   status_value:=p_data->>'status';
   if status_value<>'Cancelada' and exists(select 1 from public.appointments where clinic=c and professional=prof and id<>resource and status<>'Cancelada' and start<existing."end" and "end">existing.start) then raise exception 'O horário já está ocupado por outra consulta.';end if;
   update public.appointments set status=status_value where id=resource and clinic=c;
  elsif a='note' then
   if r not in ('admin','professional') then raise insufficient_privilege;end if;
   insert into public.notes(id,clinic,patient,author,specialty,subjective,objective,assessment,plan,tooth) values(resource,c,p_data->>'patient',private.current_email(),p_data->>'specialty',btrim(p_data->>'subjective'),coalesce(p_data->>'objective',''),coalesce(p_data->>'assessment',''),btrim(p_data->>'plan'),coalesce(p_data->>'tooth',''));
  else raise exception 'Operação inválida.';
  end if;
  insert into public.audit(clinic,actor,action,resource) values(c,private.current_email(),a,resource);
  return jsonb_build_object('ok',true,'id',resource);
 end
$$;

create function public.inventory_read(p_clinic text default null,p_record text default null) returns jsonb language plpgsql security definer set search_path='' as $$
 begin
  perform private.require_access(p_clinic);
  return jsonb_build_object('products',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'clinic',p.clinic,'code',p.code,'description',p.description,'quantityMilli',p.quantity_milli,'unitCents',p.unit_cents,'totalCents',(p.quantity_milli::bigint*p.unit_cents+500)/1000) order by p.description,p.code),'[]') from public.products p where p.clinic=p_clinic));
 end
$$;
create function public.inventory_write(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare c text:=p_data->>'clinic';target text;resource text;a text:=p_data->>'action';
 begin
  perform private.require_access(c);
  if a='create' then
   resource:=gen_random_uuid()::text;
   insert into public.products(id,clinic,code,description,quantity_milli,unit_cents) values(resource,c,btrim(p_data->>'code'),btrim(p_data->>'description'),(p_data->>'quantity')::integer,(p_data->>'unitValue')::integer);
  elsif a='update' then
   resource:=p_data->>'id';target:=p_data->>'targetClinic';perform private.require_access(target);
   update public.products set clinic=target,code=btrim(p_data->>'code'),description=btrim(p_data->>'description'),quantity_milli=(p_data->>'quantity')::integer,unit_cents=(p_data->>'unitValue')::integer,updated=now() where id=resource and clinic=c;
   if not found then raise exception 'Produto não encontrado nesta clínica.';end if;
   if target<>c then insert into public.audit(clinic,actor,action,resource) values(target,private.current_email(),'product_transfer_in',resource);end if;
  elsif a='delete' then
   resource:=p_data->>'id';delete from public.products where id=resource and clinic=c;
   if not found then raise exception 'Produto não encontrado nesta clínica.';end if;
  else raise exception 'Operação inválida.';
  end if;
  insert into public.audit(clinic,actor,action,resource) values(c,private.current_email(),'product_'||a,resource);
  return jsonb_build_object('ok',true,'id',resource);
 end
$$;

create function public.finance_read(p_clinic text default null,p_record text default null) returns jsonb language plpgsql security definer set search_path='' as $$
 declare result jsonb;history jsonb;
 begin
  perform private.require_access(p_clinic);
  if p_record is not null then
   if not exists(select 1 from public.charges where id=p_record and clinic=p_clinic) then raise exception 'Registro financeiro não encontrado.';end if;
   select coalesce(jsonb_agg(to_jsonb(t) order by t.number),'[]') into result from (
    select i.id,i.number,i.amount_cents as "amountCents",coalesce(sum(p.amount_cents),0) as "paidCents",i.amount_cents-coalesce(sum(p.amount_cents),0) as "balanceCents",max(p.paid_on) as "paidOn"
    from public.installments i left join public.payments p on p.installment=i.id and p.clinic=i.clinic where i.clinic=p_clinic and i.charge=p_record group by i.id
   ) t;
   select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'installment',p.installment,'amountCents',p.amount_cents,'paidOn',p.paid_on,'actor',p.actor) order by p.paid_on,p.created),'[]') into history from public.payments p join public.installments i on i.id=p.installment and i.clinic=p.clinic where p.clinic=p_clinic and i.charge=p_record;
   return jsonb_build_object('installments',result,'payments',history);
  end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created desc,t.id),'[]') into result from (
   select c.id,c.clinic,c.patient,p.name as "patientName",c.description,c.total_cents as "totalCents",c.installment_count as count,c.created,coalesce(sum(pay.amount_cents),0) as "paidCents",c.total_cents-coalesce(sum(pay.amount_cents),0) as "balanceCents"
   from public.charges c join public.patients p on p.id=c.patient and p.clinic=c.clinic left join public.installments i on i.charge=c.id and i.clinic=c.clinic left join public.payments pay on pay.installment=i.id and pay.clinic=c.clinic where c.clinic=p_clinic group by c.id,p.name
  ) t;
  return jsonb_build_object('charges',result,'patients',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name),'[]') from public.patients p where p.clinic=p_clinic));
 end
$$;
create function public.finance_write(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare c text:=p_data->>'clinic';a text:=p_data->>'action';resource text;total integer:=(p_data->>'amount')::integer;count_value integer;part integer;n integer;balance bigint;inst public.installments%rowtype;prior public.payments%rowtype;paid date;
 begin
  perform private.require_access(c);
  if total is null or total<1 or total>100000000 then raise exception 'Informe um valor positivo de até R$ 1.000.000,00.';end if;
  if a='create' then
   count_value:=(p_data->>'count')::integer;
   if count_value is null or count_value<1 or count_value>120 or count_value>total then raise exception 'Número de parcelas inválido.';end if;
   resource:=gen_random_uuid()::text;
   insert into public.charges values(resource,c,p_data->>'patient',btrim(p_data->>'description'),total,count_value,now());
   part:=total/count_value;
   for n in 1..count_value loop
    insert into public.installments(clinic,charge,number,amount_cents) values(c,resource,n,part+case when n=count_value then total-part*count_value else 0 end);
   end loop;
   insert into public.audit(clinic,actor,action,resource) values(c,private.current_email(),'charge_create',resource);
  elsif a='pay' then
   resource:=(p_data->>'requestId')::uuid::text;
   paid:=(p_data->>'paidOn')::date;
   if paid is null or paid>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Data de pagamento inválida.';end if;
   -- Lock the installment before reading sums: concurrent payments cannot overpay it.
   select * into inst from public.installments where id=p_data->>'installment' and clinic=c for update;
   if not found then raise exception 'Parcela não encontrada nesta clínica.';end if;
   select * into prior from public.payments where id=resource;
   if found then
    if prior.clinic=c and prior.installment=inst.id and prior.amount_cents=total and prior.paid_on=paid then return jsonb_build_object('ok',true,'id',resource);end if;
    raise exception 'Identificador de pagamento já utilizado.';
   end if;
   select inst.amount_cents-coalesce(sum(p.amount_cents),0) into balance from public.payments p where p.installment=inst.id and p.clinic=c;
   if total>balance then raise exception 'O valor supera o saldo da parcela ou ela já está paga.';end if;
   insert into public.payments values(resource,c,inst.id,total,paid,private.current_email(),now());
   insert into public.audit(clinic,actor,action,resource) values(c,private.current_email(),'installment_payment',inst.id);
  else raise exception 'Operação inválida.';
  end if;
  return jsonb_build_object('ok',true,'id',resource);
 end
$$;

-- No anonymous execution and no public defaults on SECURITY DEFINER functions.
revoke all on function public.crm_read(text,text),public.crm_write(jsonb),public.inventory_read(text,text),public.inventory_write(jsonb),public.finance_read(text,text),public.finance_write(jsonb) from public,anon;
grant execute on function public.crm_read(text,text),public.crm_write(jsonb),public.inventory_read(text,text),public.inventory_write(jsonb),public.finance_read(text,text),public.finance_write(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
