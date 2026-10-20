-- Current eligibility is a rule for upcoming meetings, not a rewrite of who
-- participated in the past. Keep those assignments available for fair rotation.
-- An explicit edit of a meeting part still reconciles that part, including past ones.
create or replace function private.revalidate_assignments() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 delete from public.assignments a
 using public.members m, public.meeting_parts p, public.meetings mt, public.congregations c
 where a.congregation_id = new.congregation_id
 and m.id = a.member_id and p.id = a.part_id and mt.id = a.meeting_id and c.id = a.congregation_id
 and (mt.starts_at > now() or tg_table_name='meeting_parts')
 and (not private.eligible(m.category,p.eligibility)
      or (m.is_visitor and not p.allows_visitor)
      or (mt.starts_at > now() and (not m.active or exists (
        select 1 from public.unavailability u
        where u.congregation_id = a.congregation_id and u.member_id = a.member_id
        and (mt.starts_at at time zone c.timezone)::date between u.starts_on and u.ends_on
      ))));
 return null;
end;
$$;

-- Serialize membership writes with the same tenant lock used for scheduling.
-- The guard reads all memberships as its owner; RLS still authorizes each write.
create trigger a_lock before insert or update or delete on public.congregation_memberships
for each row execute function private.lock_tenant();
create function private.keep_administrator() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if old.role='administrador' then
  if tg_op='DELETE' or new.role<>'administrador' then
   if not exists(select 1 from public.congregation_memberships
     where congregation_id=old.congregation_id and role='administrador' and user_id<>old.user_id) then
    raise exception 'Mantenha pelo menos um administrador. Promova outra pessoa antes de remover este acesso.';
   end if;
  end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end;
$$;
create trigger b_keep_administrator before update or delete on public.congregation_memberships
for each row execute function private.keep_administrator();
revoke all on function private.keep_administrator() from public;
