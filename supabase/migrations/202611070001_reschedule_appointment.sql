-- Apply after the initial migration. Preserves existing tables and appointments.
begin;
create or replace function public.reschedule_appointment(p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 c text:=p_data->>'clinic';resource text:=p_data->>'id';prof text;
 starts timestamptz:=(p_data->>'start')::timestamptz;
 ends timestamptz:=(p_data->>'end')::timestamptz;
 existing public.appointments%rowtype;
begin
 perform private.require_access(c);
 if starts is null or ends is null or not isfinite(starts) or not isfinite(ends) or ends<=starts or ends>starts+interval '1 day' then
  raise exception 'Informe início e fim válidos, com duração máxima de 24 horas.';
 end if;
 select professional into prof from public.appointments where id=resource and clinic=c;
 if prof is null then raise exception 'Consulta não encontrada.';end if;
 -- Same lock and order used by appointment creation and status changes.
 perform pg_advisory_xact_lock(hashtextextended(c||':'||prof,0));
 select * into existing from public.appointments where id=resource and clinic=c for update;
 if not found then raise exception 'Consulta não encontrada.';end if;
 if existing.status in ('Cancelada','Concluída') then
  raise exception 'Somente consultas em aberto podem ter o horário alterado.';
 end if;
 if exists(select 1 from public.appointments where clinic=c and professional=prof and id<>resource and status<>'Cancelada' and start<ends and "end">starts) then
  raise exception 'Este profissional já tem uma consulta nesse horário.';
 end if;
 update public.appointments set start=starts,"end"=ends where id=resource and clinic=c;
 insert into public.audit(clinic,actor,action,resource) values(c,private.current_email(),'appointment_reschedule',resource);
 return jsonb_build_object('ok',true,'id',resource);
end $$;
revoke all on function public.reschedule_appointment(jsonb) from public,anon;
grant execute on function public.reschedule_appointment(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
