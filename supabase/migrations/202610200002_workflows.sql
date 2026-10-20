alter table public.meetings add column title text not null default 'Reunião';
alter table public.meetings add column kind public.meeting_kind not null default 'meio_de_semana';
update public.meetings m set title=t.name,kind=t.kind from public.meeting_templates t where t.id=m.template_id;
alter table public.meetings add column revision bigint not null default 0;
alter table public.meetings add constraint meeting_template_start_unique unique(template_id, starts_at);
alter table public.meeting_parts add column empty_locked boolean not null default false;
alter table public.template_parts add column active boolean not null default true;
alter table public.template_parts drop constraint template_parts_template_id_position_key;
create unique index template_active_position on public.template_parts(template_id,position) where active;

create function private.touch_meeting() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.meetings set revision=revision+1 where id=coalesce(new.meeting_id,old.meeting_id);
 return null;
end $$;
create trigger revision after insert or update or delete on public.assignments for each row execute function private.touch_meeting();
create trigger revision after insert or update or delete on public.meeting_parts for each row execute function private.touch_meeting();
revoke all on function private.touch_meeting() from public;

create function public.save_member(cid uuid, mid uuid, member_name text, member_category public.member_category, is_active boolean, visitor boolean, phone text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid := coalesce(mid, gen_random_uuid());
begin
 if not private.is_staff(cid) then raise exception 'Sem permissão para editar irmãos' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(cid::text,0));
 if mid is not null and not exists(select 1 from public.members where id=mid and congregation_id=cid) then raise exception 'Cadastro não encontrado'; end if;
 insert into public.members(id,congregation_id,name,category,active,is_visitor) values(result,cid,trim(member_name),member_category,is_active,visitor)
 on conflict(id) do update set name=excluded.name,category=excluded.category,active=excluded.active,is_visitor=excluded.is_visitor;
 if nullif(trim(phone),'') is null then
   delete from public.member_phones where congregation_id=cid and member_id=result;
 else
   insert into public.member_phones values(cid,result,phone) on conflict(congregation_id,member_id) do update set whatsapp=excluded.whatsapp;
 end if;
 return result;
end $$;

create function public.save_template(cid uuid, tid uuid, template_name text, meeting_type public.meeting_kind, day_of_week smallint, meeting_time time, slots jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid:=coalesce(tid,gen_random_uuid()); item jsonb;
begin
 if not private.is_staff(cid) then raise exception 'Sem permissão para editar modelos' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(cid::text,0));
 if slots is null or jsonb_typeof(slots) is distinct from 'array' or jsonb_array_length(slots)=0 then raise exception 'Inclua pelo menos uma parte'; end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(slots))<>jsonb_array_length(slots) then raise exception 'Parte repetida no modelo'; end if;
 if tid is not null and not exists(select 1 from public.meeting_templates where id=tid and congregation_id=cid) then raise exception 'Modelo não encontrado'; end if;
 insert into public.meeting_templates(id,congregation_id,name,kind,weekday,local_time) values(result,cid,template_name,meeting_type,day_of_week,meeting_time)
 on conflict(id) do update set name=excluded.name,kind=excluded.kind,weekday=excluded.weekday,local_time=excluded.local_time;
 update public.template_parts set active=false where template_id=result and congregation_id=cid;
 for item in select value from jsonb_array_elements(slots) loop
   if exists(select 1 from public.template_parts where id=(item->>'id')::uuid and (congregation_id<>cid or template_id<>result)) then raise exception 'Parte pertence a outro modelo'; end if;
   insert into public.template_parts(id,congregation_id,template_id,section,title,position,group_key,slot,eligibility,allows_visitor,active)
   values((item->>'id')::uuid,cid,result,item->>'section',item->>'title',(item->>'position')::integer,item->>'group_key',(item->>'slot')::public.slot_role,(item->>'eligibility')::public.eligibility_rule,coalesce((item->>'allows_visitor')::boolean,false),true)
   on conflict(id) do update set section=excluded.section,title=excluded.title,position=excluded.position,group_key=excluded.group_key,slot=excluded.slot,eligibility=excluded.eligibility,allows_visitor=excluded.allows_visitor,active=true;
 end loop;
 return result;
end $$;

create function public.create_week(cid uuid, monday date) returns void language plpgsql security invoker set search_path='' as $$
declare t public.meeting_templates; mid uuid; starts timestamptz; tz text;
begin
 if not private.is_staff(cid) then raise exception 'Sem permissão para criar reuniões' using errcode='42501'; end if;
 if monday is null or extract(isodow from monday)<>1 then raise exception 'Escolha a segunda-feira da semana'; end if;
 perform pg_advisory_xact_lock(hashtextextended(cid::text,0));
 select timezone into strict tz from public.congregations where id=cid;
 if not exists(select 1 from public.meeting_templates where congregation_id=cid) then raise exception 'Crie os modelos em Ajustes antes de gerar a semana'; end if;
 for t in select * from public.meeting_templates where congregation_id=cid loop
   starts := ((monday+((t.weekday+6)%7))+t.local_time) at time zone tz;
   mid := null;
   insert into public.meetings(congregation_id,template_id,starts_at,title,kind) values(cid,t.id,starts,t.name,t.kind)
   on conflict(template_id,starts_at) do nothing returning id into mid;
   if mid is not null then
     insert into public.meeting_parts(congregation_id,meeting_id,template_part_id,section,title,position,group_key,slot,eligibility,allows_visitor)
     select cid,mid,id,section,title,position,group_key,slot,eligibility,allows_visitor from public.template_parts where template_id=t.id and active;
   end if;
 end loop;
end $$;

-- Atomic full-meeting proposal, preserving IDs/statuses when the person is unchanged.
-- Advisory lock + revision prevent a stale browser from overwriting another editor.
create function public.save_assignments(cid uuid, mid uuid, expected_revision bigint, proposal jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare current_revision bigint; item jsonb;
begin
 if not private.is_staff(cid) then raise exception 'Sem permissão para designar' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(cid::text,0));
 select revision into strict current_revision from public.meetings where congregation_id=cid and id=mid for update;
 if expected_revision is null or current_revision<>expected_revision then raise exception 'O quadro mudou. Atualize a página e refaça sua alteração.' using errcode='40001'; end if;
 if proposal is null or jsonb_typeof(proposal) is distinct from 'array' or jsonb_array_length(proposal)<>(select count(*) from public.meeting_parts where meeting_id=mid) then raise exception 'Proposta incompleta'; end if;
 if (select count(distinct value->>'part_id') from jsonb_array_elements(proposal))<>jsonb_array_length(proposal) then raise exception 'Parte repetida na proposta'; end if;
 if exists(select 1 from jsonb_array_elements(proposal) x where not exists(select 1 from public.meeting_parts p where p.id=(x->>'part_id')::uuid and p.meeting_id=mid and p.congregation_id=cid)) then raise exception 'Parte de outra reunião'; end if;
 set constraints public.assignments_meeting_id_member_id_key deferred;
 delete from public.assignments a where a.meeting_id=mid and a.congregation_id=cid and not exists(
   select 1 from jsonb_array_elements(proposal) x where (x->>'part_id')::uuid=a.part_id and (x->>'member_id')::uuid=a.member_id
 );
 for item in select value from jsonb_array_elements(proposal) loop
   update public.meeting_parts set empty_locked=coalesce((item->>'locked')::boolean,false) and item->>'member_id' is null
   where id=(item->>'part_id')::uuid and empty_locked is distinct from (coalesce((item->>'locked')::boolean,false) and item->>'member_id' is null);
   if item->>'member_id' is not null then
     insert into public.assignments(congregation_id,meeting_id,part_id,member_id,locked)
     values(cid,mid,(item->>'part_id')::uuid,(item->>'member_id')::uuid,coalesce((item->>'locked')::boolean,false))
     on conflict(part_id) do update set locked=excluded.locked where assignments.locked is distinct from excluded.locked;
   end if;
 end loop;
 set constraints public.assignments_meeting_id_member_id_key immediate;
end $$;
revoke all on function public.save_member(uuid,uuid,text,public.member_category,boolean,boolean,text), public.save_template(uuid,uuid,text,public.meeting_kind,smallint,time,jsonb), public.create_week(uuid,date), public.save_assignments(uuid,uuid,bigint,jsonb) from public, anon;
grant execute on function public.save_member(uuid,uuid,text,public.member_category,boolean,boolean,text), public.save_template(uuid,uuid,text,public.meeting_kind,smallint,time,jsonb), public.create_week(uuid,date), public.save_assignments(uuid,uuid,bigint,jsonb) to authenticated;

-- Supabase has this publication; the standalone PostgreSQL harness does not.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='meetings') then
   alter publication supabase_realtime add table public.meetings;
 end if;
end $$;
