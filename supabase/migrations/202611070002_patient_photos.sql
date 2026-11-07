-- Run after the initial migration. Patient photographs are private Storage objects.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('patient-photos','patient-photos',false,524288,array['image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=524288,allowed_mime_types=array['image/jpeg'];

create or replace function private.patient_photo_access(object_name text)
returns boolean language sql stable security definer set search_path='' as $$
 select array_length(string_to_array(object_name,'/'),1)=2
 and exists(select 1 from public.patients p
 where p.clinic=split_part(object_name,'/',1)
 and p.id||'.jpg'=split_part(object_name,'/',2)
 and private.clinic_role(p.clinic) is not null)
$$;
revoke all on function private.patient_photo_access(text) from public,anon;
grant execute on function private.patient_photo_access(text) to authenticated;

drop policy if exists patient_photos_read on storage.objects;
drop policy if exists patient_photos_insert on storage.objects;
drop policy if exists patient_photos_update on storage.objects;
create policy patient_photos_read on storage.objects for select to authenticated
 using(bucket_id='patient-photos' and private.patient_photo_access(name));
create policy patient_photos_insert on storage.objects for insert to authenticated
 with check(bucket_id='patient-photos' and private.patient_photo_access(name));
create policy patient_photos_update on storage.objects for update to authenticated
 using(bucket_id='patient-photos' and private.patient_photo_access(name))
 with check(bucket_id='patient-photos' and private.patient_photo_access(name));
commit;
