begin;
create function pg_temp.id(label text) returns uuid language sql immutable as $$ select md5(label)::uuid $$;
create function pg_temp.ok(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.fails(statement text,expected text,label text) returns void language plpgsql as $$
begin begin execute statement; exception when others then if sqlstate=expected then raise notice 'PASS: %',label; return; end if; raise exception 'FAIL: % (%: %)',label,sqlstate,sqlerrm; end; raise exception 'FAIL: % (allowed)',label;end $$;
insert into auth.users values(pg_temp.id('admin')), (pg_temp.id('brother'));
insert into public.congregations(id,name) values(pg_temp.id('c'),'Horizonte fictícia'),(pg_temp.id('other'),'Jardim fictícia');
insert into public.members(id,congregation_id,name,category) values(pg_temp.id('m1'),pg_temp.id('c'),'Caio Exemplo','anciao'),(pg_temp.id('m2'),pg_temp.id('c'),'Luan Exemplo','irmao_batizado');
insert into public.congregation_memberships values(pg_temp.id('c'),pg_temp.id('admin'),pg_temp.id('m1'),'administrador'),(pg_temp.id('c'),pg_temp.id('brother'),pg_temp.id('m2'),'irmao');
insert into public.meeting_templates(id,congregation_id,name,kind,weekday,local_time) values(pg_temp.id('t'),pg_temp.id('c'),'Modelo fictício','meio_de_semana',3,'19:30');
insert into public.template_parts(id,congregation_id,template_id,section,title,position,eligibility) values
(pg_temp.id('p1'),pg_temp.id('c'),pg_temp.id('t'),'Abertura','Presidente',0,'irmaos_batizados'),
(pg_temp.id('p2'),pg_temp.id('c'),pg_temp.id('t'),'Estudo','Leitor',1,'irmaos_batizados'),
(pg_temp.id('p3'),pg_temp.id('c'),pg_temp.id('t'),'Encerramento','Oração',2,'irmaos_batizados');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('admin')::text,true);
select public.create_week(pg_temp.id('c'),'2035-03-19');
insert into public.assignments(id,congregation_id,meeting_id,part_id,member_id,locked)
select pg_temp.id('own'),pg_temp.id('c'),meeting_id,id,pg_temp.id('m2'),true from public.meeting_parts where position=0;
insert into public.assignments(id,congregation_id,meeting_id,part_id,member_id)
select pg_temp.id('another'),pg_temp.id('c'),meeting_id,id,pg_temp.id('m1') from public.meeting_parts where position=1;
select set_config('request.jwt.claim.sub',pg_temp.id('brother')::text,true);
select public.respond_assignment(pg_temp.id('own'),'pendente','confirmada');
select pg_temp.ok((select status='confirmada' and locked and member_id=pg_temp.id('m2') from public.assignments where id=pg_temp.id('own')),'resposta altera apenas status da própria designação');
select pg_temp.ok((select count(*)=1 from public.assignment_history where assignment_id=pg_temp.id('own') and action='UPDATE' and status='confirmada'),'confirmação fica na auditoria do próprio irmão');
select pg_temp.fails($q$select public.respond_assignment(pg_temp.id('another'),'pendente','recusada')$q$,'42501','irmão não responde por outra pessoa');
select pg_temp.fails($q$select public.respond_assignment(pg_temp.id('absent'),'pendente','confirmada')$q$,'42501','ID ausente não revela dados');
select pg_temp.fails($q$select public.respond_assignment(pg_temp.id('own'),'pendente','recusada')$q$,'40001','resposta antiga não sobrescreve a atual');
select pg_temp.fails($q$select public.respond_assignment(pg_temp.id('own'),'confirmada','pendente')$q$,'P0001','não permite status arbitrário');
select pg_temp.fails($q$select public.respond_assignment(pg_temp.id('own'),'confirmada',null)$q$,'P0001','resposta nula é rejeitada');
select public.respond_assignment(pg_temp.id('own'),'confirmada','recusada');
select pg_temp.ok((select status='recusada' from public.assignments where id=pg_temp.id('own')),'recusa é persistida');
with changed as (update public.assignments set status='confirmada' returning *) select pg_temp.ok(count(*)=0,'irmão continua sem UPDATE geral') from changed;
select pg_temp.ok((select count(*)=0 from public.member_phones),'RPC de resposta não libera telefones');
select set_config('request.jwt.claim.sub',pg_temp.id('admin')::text,true);
select pg_temp.ok((select status='recusada' from public.assignments where id=pg_temp.id('own')),'designador/admin enxerga a recusa');
update public.meetings set starts_at='2020-01-01 12:00Z';
select set_config('request.jwt.claim.sub',pg_temp.id('brother')::text,true);
select pg_temp.fails($q$select public.respond_assignment(pg_temp.id('own'),'recusada','confirmada')$q$,'P0001','reunião passada não pode ser respondida');
select set_config('request.jwt.claim.sub',pg_temp.id('admin')::text,true);
delete from public.assignments where id=pg_temp.id('own');
select set_config('request.jwt.claim.sub',pg_temp.id('brother')::text,true);
select pg_temp.fails($q$select public.respond_assignment(pg_temp.id('own'),'recusada','confirmada')$q$,'42501','designação removida não pode ser respondida');
set local role anon;
select pg_temp.fails($q$select public.respond_assignment(pg_temp.id('another'),'pendente','confirmada')$q$,'42501','anônimo não chama RPC de resposta');
rollback;
