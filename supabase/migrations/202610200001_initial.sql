-- All tenant links use composite foreign keys. Phone numbers never share a public row.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create type public.app_role as enum ('administrador', 'designador', 'irmao');
create type public.member_category as enum ('irma', 'irmao_batizado', 'servo_ministerial', 'anciao');
create type public.eligibility_rule as enum ('qualquer_pessoa', 'irmaos_batizados', 'anciaos_e_servos', 'somente_anciaos');
create type public.meeting_kind as enum ('meio_de_semana', 'fim_de_semana');
create type public.slot_role as enum ('titular', 'ajudante', 'dirigente', 'leitor');
create type public.assignment_status as enum ('pendente', 'confirmada', 'recusada');

create table public.congregations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now()
);
create table public.members (
  id uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations(id),
  name text not null check (length(trim(name)) between 1 and 120),
  category public.member_category not null,
  active boolean not null default true,
  is_visitor boolean not null default false,
  unique (congregation_id, id)
);
create table public.congregation_memberships (
  congregation_id uuid not null references public.congregations(id),
  user_id uuid not null references auth.users(id),
  member_id uuid not null,
  role public.app_role not null default 'irmao',
  primary key (congregation_id, user_id),
  unique (congregation_id, member_id),
  foreign key (congregation_id, member_id) references public.members(congregation_id, id)
);
create table public.member_phones (
  congregation_id uuid not null,
  member_id uuid not null,
  whatsapp text not null check (whatsapp ~ '^[1-9][0-9]{7,14}$'),
  primary key (congregation_id, member_id),
  foreign key (congregation_id, member_id) references public.members(congregation_id, id) on delete cascade
);
create table public.unavailability (
  id uuid primary key default gen_random_uuid(),
  congregation_id uuid not null,
  member_id uuid not null,
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  foreign key (congregation_id, member_id) references public.members(congregation_id, id) on delete cascade
);
create table public.meeting_templates (
  id uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations(id),
  name text not null check (length(trim(name)) between 1 and 120),
  kind public.meeting_kind not null,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = domingo
  local_time time not null,
  unique (congregation_id, id)
);
-- Each row represents one person/slot. A demonstration has titular + ajudante
-- with the same group_key; a study has dirigente + leitor in that group.
create table public.template_parts (
  id uuid primary key default gen_random_uuid(),
  congregation_id uuid not null,
  template_id uuid not null,
  section text not null,
  title text not null check (length(trim(title)) between 1 and 160),
  position integer not null check (position >= 0),
  group_key text,
  slot public.slot_role not null default 'titular',
  eligibility public.eligibility_rule not null,
  allows_visitor boolean not null default false,
  unique (congregation_id, id),
  unique (template_id, position),
  foreign key (congregation_id, template_id) references public.meeting_templates(congregation_id, id)
);
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations(id),
  template_id uuid not null,
  starts_at timestamptz not null,
  unique (congregation_id, id),
  foreign key (congregation_id, template_id) references public.meeting_templates(congregation_id, id)
);
create table public.meeting_parts (
  id uuid primary key default gen_random_uuid(),
  congregation_id uuid not null,
  meeting_id uuid not null,
  template_part_id uuid,
  section text not null,
  title text not null check (length(trim(title)) between 1 and 160),
  position integer not null check (position >= 0),
  group_key text,
  slot public.slot_role not null default 'titular',
  eligibility public.eligibility_rule not null,
  allows_visitor boolean not null default false,
  unique (congregation_id, id, meeting_id),
  unique (meeting_id, position),
  foreign key (congregation_id, meeting_id) references public.meetings(congregation_id, id),
  foreign key (congregation_id, template_part_id) references public.template_parts(congregation_id, id)
);
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  congregation_id uuid not null,
  meeting_id uuid not null,
  part_id uuid not null unique,
  member_id uuid not null,
  locked boolean not null default false,
  status public.assignment_status not null default 'pendente',
  created_at timestamptz not null default now(),
  unique (meeting_id, member_id) deferrable initially immediate,
  foreign key (congregation_id, part_id, meeting_id) references public.meeting_parts(congregation_id, id, meeting_id),
  foreign key (congregation_id, member_id) references public.members(congregation_id, id)
);
-- Immutable audit trail, no phones or unrestricted payload JSON.
create table public.assignment_history (
  id bigint generated always as identity primary key,
  congregation_id uuid not null references public.congregations(id),
  assignment_id uuid not null,
  meeting_id uuid not null,
  part_id uuid not null,
  member_id uuid not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  status public.assignment_status not null,
  locked boolean not null,
  actor_id uuid,
  occurred_at timestamptz not null default now(),
  foreign key (congregation_id, member_id) references public.members(congregation_id, id),
  foreign key (congregation_id, part_id, meeting_id) references public.meeting_parts(congregation_id, id, meeting_id)
);
create index on public.congregation_memberships(user_id, congregation_id);
create index on public.members(congregation_id);
create index on public.unavailability(congregation_id, member_id, starts_on, ends_on);
create index on public.meetings(congregation_id, starts_at);
create index on public.assignments(congregation_id, member_id);
create index on public.assignment_history(congregation_id, member_id, occurred_at);

create function private.is_staff(cid uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.congregation_memberships where congregation_id = cid and user_id = (select auth.uid()) and role in ('administrador', 'designador'));
$$;
create function private.is_admin(cid uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.congregation_memberships where congregation_id = cid and user_id = (select auth.uid()) and role = 'administrador');
$$;
create function private.own_member(cid uuid) returns uuid language sql stable security definer set search_path = '' as $$
 select member_id from public.congregation_memberships where congregation_id = cid and user_id = (select auth.uid());
$$;
create function private.eligible(category public.member_category, rule public.eligibility_rule) returns boolean language sql immutable set search_path = '' as $$
 select case rule
 when 'qualquer_pessoa' then true
 when 'irmaos_batizados' then category in ('irmao_batizado','servo_ministerial','anciao')
 when 'anciaos_e_servos' then category in ('servo_ministerial','anciao')
 when 'somente_anciaos' then category = 'anciao' end;
$$;

-- Serialize writes per congregation, including availability/category/rule changes,
-- so a concurrent edit cannot commit an invalid assignment.
create function private.lock_tenant() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if tg_op = 'UPDATE' and new.congregation_id <> old.congregation_id then
   raise exception 'Congregação de um registro não pode ser alterada';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(coalesce(new.congregation_id, old.congregation_id)::text, 0));
 if tg_op = 'DELETE' then return old; end if;
 return new;
end;
$$;
create function private.validate_assignment() returns trigger language plpgsql security definer set search_path = '' as $$
declare ok boolean;
begin
 select m.active and private.eligible(m.category, p.eligibility) and (not m.is_visitor or p.allows_visitor) and not exists (
   select 1 from public.unavailability u where u.congregation_id = new.congregation_id and u.member_id = new.member_id
   and (mt.starts_at at time zone c.timezone)::date between u.starts_on and u.ends_on
 ) into ok
 from public.members m
 join public.meeting_parts p on p.id = new.part_id and p.congregation_id = new.congregation_id and p.meeting_id = new.meeting_id
 join public.meetings mt on mt.id = p.meeting_id
 join public.congregations c on c.id = m.congregation_id
 where m.id = new.member_id and m.congregation_id = new.congregation_id;
 if ok is distinct from true then raise exception 'Designado inelegível, inativo, indisponível ou de outra congregação'; end if;
 -- Moving an assignment must not conceal the previous person's history.
 if tg_op = 'UPDATE' and (new.member_id <> old.member_id or new.part_id <> old.part_id or new.meeting_id <> old.meeting_id) then
   raise exception 'Para substituir uma designação, remova a anterior e crie outra na mesma transação';
 end if;
 return new;
end;
$$;
create function private.audit_assignment() returns trigger language plpgsql security definer set search_path = '' as $$
declare a public.assignments;
begin
 if tg_op = 'DELETE' then a := old; else a := new; end if;
 insert into public.assignment_history(congregation_id,assignment_id,meeting_id,part_id,member_id,action,status,locked,actor_id)
 values(a.congregation_id,a.id,a.meeting_id,a.part_id,a.member_id,tg_op,a.status,a.locked,auth.uid());
 return null;
end;
$$;
create function private.revalidate_assignments() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 delete from public.assignments a using public.members m, public.meeting_parts p, public.meetings mt, public.congregations c
 where a.congregation_id = new.congregation_id and m.id = a.member_id and p.id = a.part_id and mt.id = a.meeting_id and c.id = a.congregation_id
 and (not m.active or not private.eligible(m.category,p.eligibility) or (m.is_visitor and not p.allows_visitor) or exists (
   select 1 from public.unavailability u where u.congregation_id = a.congregation_id and u.member_id = a.member_id
   and (mt.starts_at at time zone c.timezone)::date between u.starts_on and u.ends_on
 ));
 return null;
end;
$$;
create function private.propagate_rule() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 update public.meeting_parts p set eligibility = new.eligibility, allows_visitor = new.allows_visitor
 from public.meetings m where p.template_part_id = new.id and m.id = p.meeting_id and m.starts_at >= now();
 return null;
end;
$$;
create trigger a_lock before insert or update or delete on public.assignments for each row execute function private.lock_tenant();
create trigger b_validate before insert or update on public.assignments for each row execute function private.validate_assignment();
create trigger audit after insert or update or delete on public.assignments for each row execute function private.audit_assignment();
create trigger a_lock before insert or update or delete on public.members for each row execute function private.lock_tenant();
create trigger a_lock before insert or update or delete on public.meeting_parts for each row execute function private.lock_tenant();
create trigger a_lock before insert or update or delete on public.template_parts for each row execute function private.lock_tenant();
create trigger a_lock before insert or update or delete on public.unavailability for each row execute function private.lock_tenant();
create trigger a_lock before insert or update or delete on public.meetings for each row execute function private.lock_tenant();
create trigger revalidate after update of category, active, is_visitor on public.members for each row execute function private.revalidate_assignments();
create trigger revalidate after update of eligibility, allows_visitor on public.meeting_parts for each row execute function private.revalidate_assignments();
create trigger revalidate after insert or update on public.unavailability for each row execute function private.revalidate_assignments();
create trigger revalidate after update of starts_at on public.meetings for each row execute function private.revalidate_assignments();
create trigger propagate after update of eligibility, allows_visitor on public.template_parts for each row execute function private.propagate_rule();

alter table public.congregations enable row level security;
alter table public.members enable row level security;
alter table public.congregation_memberships enable row level security;
alter table public.member_phones enable row level security;
alter table public.unavailability enable row level security;
alter table public.meeting_templates enable row level security;
alter table public.template_parts enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_parts enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_history enable row level security;

create policy tenant_read on public.congregations for select to authenticated using (private.own_member(id) is not null);
create policy tenant_edit on public.congregations for update to authenticated using (private.is_admin(id)) with check (private.is_admin(id));
create policy member_read on public.members for select to authenticated using (private.is_staff(congregation_id) or id = private.own_member(congregation_id));
create policy member_write on public.members for all to authenticated using (private.is_staff(congregation_id)) with check (private.is_staff(congregation_id));
create policy membership_read on public.congregation_memberships for select to authenticated using (user_id = (select auth.uid()) or private.is_admin(congregation_id));
create policy membership_write on public.congregation_memberships for all to authenticated using (private.is_admin(congregation_id)) with check (private.is_admin(congregation_id));
create policy phone_staff_only on public.member_phones for all to authenticated using (private.is_staff(congregation_id)) with check (private.is_staff(congregation_id));
create policy availability_own_or_staff on public.unavailability for all to authenticated using (private.is_staff(congregation_id) or member_id = private.own_member(congregation_id)) with check (private.is_staff(congregation_id) or member_id = private.own_member(congregation_id));
create policy template_staff on public.meeting_templates for all to authenticated using (private.is_staff(congregation_id)) with check (private.is_staff(congregation_id));
create policy template_part_staff on public.template_parts for all to authenticated using (private.is_staff(congregation_id)) with check (private.is_staff(congregation_id));
create policy meeting_staff on public.meetings for all to authenticated using (private.is_staff(congregation_id)) with check (private.is_staff(congregation_id));
create policy meeting_own on public.meetings for select to authenticated using (exists (select 1 from public.assignments a where a.meeting_id = meetings.id and a.member_id = private.own_member(meetings.congregation_id)));
create policy part_staff on public.meeting_parts for all to authenticated using (private.is_staff(congregation_id)) with check (private.is_staff(congregation_id));
create policy part_own on public.meeting_parts for select to authenticated using (exists (select 1 from public.assignments a where a.part_id = meeting_parts.id and a.member_id = private.own_member(meeting_parts.congregation_id)));
create policy assignment_staff on public.assignments for all to authenticated using (private.is_staff(congregation_id)) with check (private.is_staff(congregation_id));
create policy assignment_own on public.assignments for select to authenticated using (member_id = private.own_member(congregation_id));
create policy history_read on public.assignment_history for select to authenticated using (private.is_staff(congregation_id) or member_id = private.own_member(congregation_id));

revoke all on all tables in schema public from anon, authenticated;
grant select, update on public.congregations to authenticated;
grant select, insert, update, delete on public.members, public.congregation_memberships, public.member_phones, public.unavailability, public.meeting_templates, public.template_parts, public.meetings, public.meeting_parts, public.assignments to authenticated;
grant select on public.assignment_history to authenticated;
revoke all on all functions in schema private from public;
grant execute on function private.is_staff(uuid), private.is_admin(uuid), private.own_member(uuid) to authenticated;

-- Validate IANA timezone and keep assignment checks valid after a timezone edit.
create function private.validate_congregation() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if tg_op = 'UPDATE' and new.id <> old.id then raise exception 'ID da congregação não pode ser alterado'; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.id::text, 0));
 if not exists(select 1 from pg_timezone_names where name = new.timezone) then raise exception 'Fuso horário inválido'; end if;
 return new;
end;
$$;
create function private.revalidate_timezone() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 update public.meetings set starts_at = starts_at where congregation_id = new.id;
 return null;
end;
$$;
create trigger validate before insert or update on public.congregations for each row execute function private.validate_congregation();
create trigger timezone_changed after update of timezone on public.congregations for each row when (new.timezone is distinct from old.timezone) execute function private.revalidate_timezone();
revoke all on function private.validate_congregation(), private.revalidate_timezone() from public;
