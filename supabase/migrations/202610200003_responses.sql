-- Elevated only to update status; identity, tenant, person and time are checked
-- inside this narrow operation. No general UPDATE policy is granted to brothers.
create function public.respond_assignment(aid uuid, expected_status public.assignment_status, answer public.assignment_status)
returns void language plpgsql security definer set search_path='' as $$
declare cid uuid; a public.assignments; starts timestamptz;
begin
 if answer is null or answer not in ('confirmada','recusada') then raise exception 'Escolha confirmar ou recusar'; end if;
 select congregation_id into cid from public.assignments where id=aid and member_id=private.own_member(congregation_id);
 if cid is null then raise exception 'Designação não disponível para esta conta' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(cid::text,0));
 select * into a from public.assignments where id=aid and congregation_id=cid and member_id=private.own_member(cid) for update;
 if not found then raise exception 'Designação não disponível para esta conta' using errcode='42501'; end if;
 select starts_at into starts from public.meetings where id=a.meeting_id;
 if starts<=now() then raise exception 'Esta reunião já começou. Fale com o designador para corrigir o histórico.'; end if;
 if expected_status is null or a.status<>expected_status then raise exception 'A resposta mudou. Atualize e tente novamente.' using errcode='40001'; end if;
 update public.assignments set status=answer where id=aid and status is distinct from answer;
end $$;
revoke all on function public.respond_assignment(uuid,public.assignment_status,public.assignment_status) from public,anon;
grant execute on function public.respond_assignment(uuid,public.assignment_status,public.assignment_status) to authenticated;
