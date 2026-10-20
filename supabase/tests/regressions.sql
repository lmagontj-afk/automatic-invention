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
select public.create_week(pg_temp.id('c'),'2020-01-06');
select public.create_week(pg_temp.id('c'),'2035-03-19');
insert into public.assignments(congregation_id,meeting_id,part_id,member_id,status)
 select p.congregation_id,p.meeting_id,p.id,pg_temp.id('m2'),'confirmada'
 from public.meeting_parts p join public.meetings m on m.id=p.meeting_id where p.position=0;
update public.members set category='irma' where id=pg_temp.id('m2');
select pg_temp.ok((select count(*)=1 from public.assignments),'categoria nova remove só a designação futura');
select pg_temp.ok((select a.status='confirmada' and m.starts_at<now() from public.assignments a join public.meetings m on m.id=a.meeting_id),'participação passada continua disponível no histórico');
update public.members set active=false where id=pg_temp.id('m2');
insert into public.unavailability(congregation_id,member_id,starts_on,ends_on) values(pg_temp.id('c'),pg_temp.id('m2'),'2020-01-01','2040-12-31');
select pg_temp.ok((select count(*)=1 from public.assignments),'inativação e indisponibilidade não apagam o passado');
select pg_temp.ok((select count(*)=1 from public.assignment_history where action='DELETE'),'auditoria registra somente a remoção futura');
update public.meeting_parts p set eligibility='qualquer_pessoa'
 from public.meetings m where p.meeting_id=m.id and m.starts_at<now() and p.position=0;
select pg_temp.ok((select count(*)=1 from public.assignments),'editar regra passada mantendo elegibilidade não reavalia atividade ou disponibilidade atuais');
update public.meeting_parts p set eligibility='somente_anciaos'
 from public.meetings m where p.meeting_id=m.id and m.starts_at<now() and p.position=0;
select pg_temp.ok((select count(*)=0 from public.assignments),'edição explícita da regra continua removendo ocupantes inelegíveis');
select pg_temp.fails($q$update public.congregation_memberships set role='irmao' where user_id=pg_temp.id('admin')$q$,'P0001','último administrador não pode rebaixar o próprio acesso');
select pg_temp.fails($q$delete from public.congregation_memberships where user_id=pg_temp.id('admin')$q$,'P0001','último administrador não pode excluir o próprio vínculo');
select pg_temp.ok((select role='administrador' from public.congregation_memberships where user_id=pg_temp.id('admin')),'rejeição preserva o acesso administrativo');
update public.congregation_memberships set role='administrador' where user_id=pg_temp.id('brother');
update public.congregation_memberships set role='irmao' where user_id=pg_temp.id('admin');
select set_config('request.jwt.claim.sub',pg_temp.id('brother')::text,true);
select pg_temp.ok((select count(*)=1 from public.congregation_memberships where role='administrador'),'transferência de administração continua permitida');
select pg_temp.fails($q$delete from public.congregation_memberships where user_id=pg_temp.id('brother')$q$,'P0001','novo último administrador também é protegido');
rollback;
