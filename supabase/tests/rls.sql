begin;
create function pg_temp.id(label text) returns uuid language sql immutable as $$ select md5(label)::uuid $$;
create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;
create function pg_temp.expect_error(statement text, expected text, label text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when others then
   if sqlstate = expected then raise notice 'PASS: %', label; return; end if;
   raise exception 'FAIL: % (expected %, got %: %)', label, expected, sqlstate, sqlerrm;
 end;
 raise exception 'FAIL: % (operation was allowed)', label;
end $$;

insert into auth.users values (pg_temp.id('admin')), (pg_temp.id('designer')), (pg_temp.id('brother')), (pg_temp.id('other')), (pg_temp.id('outsider'));
insert into public.congregations(id,name) values (pg_temp.id('A'),'Congregação Horizonte Fictícia'), (pg_temp.id('B'),'Congregação Jardim Fictícia');
insert into public.members(id,congregation_id,name,category) values
 (pg_temp.id('admin-member'),pg_temp.id('A'),'Caio Exemplo','anciao'),
 (pg_temp.id('designer-member'),pg_temp.id('A'),'Davi Exemplo','servo_ministerial'),
 (pg_temp.id('brother-member'),pg_temp.id('A'),'Luan Exemplo','irmao_batizado'),
 (pg_temp.id('sister-member'),pg_temp.id('A'),'Lia Exemplo','irma'),
 (pg_temp.id('other-member'),pg_temp.id('B'),'Nilo Exemplo','anciao');
insert into public.congregation_memberships values
 (pg_temp.id('A'),pg_temp.id('admin'),pg_temp.id('admin-member'),'administrador'),
 (pg_temp.id('A'),pg_temp.id('designer'),pg_temp.id('designer-member'),'designador'),
 (pg_temp.id('A'),pg_temp.id('brother'),pg_temp.id('brother-member'),'irmao'),
 (pg_temp.id('B'),pg_temp.id('other'),pg_temp.id('other-member'),'administrador');
insert into public.member_phones values (pg_temp.id('A'),pg_temp.id('admin-member'),'5511000000001'),(pg_temp.id('A'),pg_temp.id('brother-member'),'5511000000002'),(pg_temp.id('B'),pg_temp.id('other-member'),'5511000000003');
insert into public.meeting_templates(id,congregation_id,name,kind,weekday,local_time) values
 (pg_temp.id('ta'),pg_temp.id('A'),'Modelo fictício','meio_de_semana',3,'19:30'),
 (pg_temp.id('tb'),pg_temp.id('B'),'Modelo fictício','fim_de_semana',0,'09:00');
insert into public.template_parts(id,congregation_id,template_id,section,title,position,eligibility) values
 (pg_temp.id('tpa'),pg_temp.id('A'),pg_temp.id('ta'),'Abertura','Presidente',0,'irmaos_batizados');
insert into public.meetings(id,congregation_id,template_id,starts_at) values
 (pg_temp.id('ma'),pg_temp.id('A'),pg_temp.id('ta'),'2035-03-21 22:30Z'),
 (pg_temp.id('mb'),pg_temp.id('B'),pg_temp.id('tb'),'2035-03-25 12:00Z');
insert into public.meeting_parts(id,congregation_id,meeting_id,template_part_id,section,title,position,eligibility) values
 (pg_temp.id('pa'),pg_temp.id('A'),pg_temp.id('ma'),pg_temp.id('tpa'),'Abertura','Presidente',0,'irmaos_batizados'),
 (pg_temp.id('pa2'),pg_temp.id('A'),pg_temp.id('ma'),null,'Encerramento','Oração',1,'irmaos_batizados'),
 (pg_temp.id('pa3'),pg_temp.id('A'),pg_temp.id('ma'),null,'Estudo','Dirigente',2,'somente_anciaos'),
 (pg_temp.id('pb'),pg_temp.id('B'),pg_temp.id('mb'),null,'Abertura','Presidente',0,'somente_anciaos');
insert into public.assignments(id,congregation_id,meeting_id,part_id,member_id,locked) values
 (pg_temp.id('aa'),pg_temp.id('A'),pg_temp.id('ma'),pg_temp.id('pa'),pg_temp.id('brother-member'),true),
 (pg_temp.id('aa2'),pg_temp.id('A'),pg_temp.id('ma'),pg_temp.id('pa2'),pg_temp.id('designer-member'),false),
 (pg_temp.id('ab'),pg_temp.id('B'),pg_temp.id('mb'),pg_temp.id('pb'),pg_temp.id('other-member'),false);

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('brother')::text,true);
select pg_temp.check_true((select count(*)=1 from public.congregations),'irmão só lê a própria congregação');
select pg_temp.check_true((select count(*)=1 from public.members),'irmão só lê o próprio cadastro');
select pg_temp.check_true((select count(*)=1 from public.congregation_memberships),'irmão só lê seu vínculo');
select pg_temp.check_true((select count(*)=0 from public.member_phones),'irmão não lê nenhum telefone, nem o próprio');
select pg_temp.check_true((select count(*)=1 from public.assignments),'irmão só lê a própria designação');
select pg_temp.check_true((select count(*)=1 from public.meetings),'irmão lê apenas reuniões com sua designação');
select pg_temp.check_true((select count(*)=1 from public.meeting_parts),'irmão lê apenas a própria parte');
select pg_temp.check_true((select count(*)=1 from public.assignment_history),'irmão só lê seu histórico');
select pg_temp.check_true((select count(*)=0 from public.meeting_templates),'irmão não lê modelos internos');
select pg_temp.check_true((select count(*)=0 from public.template_parts),'irmão não lê partes dos modelos');
select pg_temp.expect_error($q$insert into public.member_phones values (pg_temp.id('A'),pg_temp.id('sister-member'),'5511000000004')$q$,'42501','irmão não grava telefone');
select pg_temp.expect_error($q$insert into public.assignments(congregation_id,meeting_id,part_id,member_id) values(pg_temp.id('A'),pg_temp.id('ma'),pg_temp.id('pa3'),pg_temp.id('admin-member'))$q$,'42501','irmão não cria designação');
with changed as (update public.congregation_memberships set role='administrador' where user_id=pg_temp.id('brother') returning *) select pg_temp.check_true(count(*)=0,'irmão não promove seu perfil') from changed;
with changed as (update public.assignments set locked=false returning *) select pg_temp.check_true(count(*)=0,'irmão não altera designação') from changed;
insert into public.unavailability(congregation_id,member_id,starts_on,ends_on) values(pg_temp.id('A'),pg_temp.id('brother-member'),'2034-01-01','2034-01-03');
select pg_temp.expect_error($q$insert into public.unavailability(congregation_id,member_id,starts_on,ends_on) values(pg_temp.id('A'),pg_temp.id('admin-member'),'2034-01-01','2034-01-03')$q$,'42501','irmão não altera disponibilidade de outro');

select set_config('request.jwt.claim.sub',pg_temp.id('designer')::text,true);
select pg_temp.check_true((select count(*)=2 from public.member_phones),'designador lê telefones apenas da congregação A');
select pg_temp.check_true((select count(*)=2 from public.assignments),'designador lê designações apenas da congregação A');
select pg_temp.check_true((select count(*)=4 from public.members),'designador lê membros apenas de A');
select pg_temp.check_true((select count(*)=2 from public.assignment_history),'designador lê histórico apenas de A');
select pg_temp.check_true((select count(*)=1 from public.meetings),'designador não lê reuniões de B');
select pg_temp.check_true((select count(*)=3 from public.meeting_parts),'designador não lê partes de B');
select pg_temp.check_true((select count(*)=1 from public.meeting_templates),'designador não lê modelos de B');
select pg_temp.check_true((select count(*)=1 from public.congregation_memberships),'designador não lê vínculos alheios');
select pg_temp.expect_error($q$insert into public.members(congregation_id,name,category) values(pg_temp.id('B'),'Intruso fictício','anciao')$q$,'42501','designador não grava em B');
with changed as (update public.members set name='Alteração indevida' where congregation_id=pg_temp.id('B') returning *) select pg_temp.check_true(count(*)=0,'designador não atualiza B') from changed;
with changed as (delete from public.assignments where congregation_id=pg_temp.id('B') returning *) select pg_temp.check_true(count(*)=0,'designador não exclui em B') from changed;
with changed as (update public.congregation_memberships set role='administrador' where user_id=pg_temp.id('designer') returning *) select pg_temp.check_true(count(*)=0,'designador não promove seu perfil') from changed;
select pg_temp.expect_error($q$insert into public.member_phones values(pg_temp.id('A'),pg_temp.id('other-member'),'5511000000004')$q$,'23503','FK impede telefone apontando para membro de B');
select pg_temp.expect_error($q$insert into public.meetings(congregation_id,template_id,starts_at) values(pg_temp.id('A'),pg_temp.id('tb'),'2035-01-01Z')$q$,'23503','FK impede modelo de B em A');
select pg_temp.expect_error($q$insert into public.assignments(congregation_id,meeting_id,part_id,member_id) values(pg_temp.id('A'),pg_temp.id('ma'),pg_temp.id('pa3'),pg_temp.id('sister-member'))$q$,'P0001','banco rejeita categoria inelegível');
select pg_temp.expect_error($q$insert into public.assignments(congregation_id,meeting_id,part_id,member_id) values(pg_temp.id('A'),pg_temp.id('ma'),pg_temp.id('pa3'),pg_temp.id('other-member'))$q$,'P0001','banco rejeita designado de outra congregação');
select pg_temp.expect_error($q$insert into public.assignments(congregation_id,meeting_id,part_id,member_id) values(pg_temp.id('A'),pg_temp.id('ma'),pg_temp.id('pa3'),pg_temp.id('designer-member'))$q$,'P0001','servo não preenche somente anciãos');
select pg_temp.expect_error($q$insert into public.assignments(congregation_id,meeting_id,part_id,member_id) values(pg_temp.id('A'),pg_temp.id('ma'),pg_temp.id('pa2'),pg_temp.id('brother-member'))$q$,'23505','banco rejeita duplicata na reunião');
select pg_temp.expect_error($q$delete from public.assignment_history$q$,'42501','histórico é imutável para designador');

-- This rule change must remove even a manually locked but now invalid assignment.
update public.template_parts set eligibility='somente_anciaos' where id=pg_temp.id('tpa');
select pg_temp.check_true((select count(*)=0 from public.assignments where id=pg_temp.id('aa')),'mudança de regra no modelo limpa designado inelegível travado');
select pg_temp.check_true((select eligibility='somente_anciaos' from public.meeting_parts where id=pg_temp.id('pa')),'regra propaga para reunião futura');
select pg_temp.check_true((select count(*)=1 from public.assignment_history where assignment_id=pg_temp.id('aa') and action='DELETE'),'remoção automática deixa histórico');
insert into public.assignments(congregation_id,meeting_id,part_id,member_id) values(pg_temp.id('A'),pg_temp.id('ma'),pg_temp.id('pa'),pg_temp.id('admin-member'));
select pg_temp.expect_error($q$insert into public.assignments(congregation_id,meeting_id,part_id,member_id) values(pg_temp.id('A'),pg_temp.id('ma'),pg_temp.id('pa3'),pg_temp.id('admin-member'))$q$,'23505','mesma pessoa não ocupa duas partes diferentes');
insert into public.unavailability(congregation_id,member_id,starts_on,ends_on) values(pg_temp.id('A'),pg_temp.id('admin-member'),'2035-03-21','2035-03-21');
select pg_temp.check_true((select count(*)=0 from public.assignments where member_id=pg_temp.id('admin-member')),'indisponibilidade inclusiva remove designação conflitante');
select pg_temp.expect_error($q$insert into public.assignments(congregation_id,meeting_id,part_id,member_id) values(pg_temp.id('A'),pg_temp.id('ma'),pg_temp.id('pa'),pg_temp.id('admin-member'))$q$,'P0001','banco rejeita indisponibilidade');
update public.members set category='irmao_batizado' where id=pg_temp.id('designer-member');
update public.meeting_parts set eligibility='anciaos_e_servos' where id=pg_temp.id('pa2');
select pg_temp.check_true((select count(*)=0 from public.assignments),'regra nova remove servo que deixou de ser elegível');
select pg_temp.expect_error($q$update public.members set congregation_id=pg_temp.id('B') where id=pg_temp.id('sister-member')$q$,'P0001','não permite mover registros entre congregações');

select set_config('request.jwt.claim.sub',pg_temp.id('admin')::text,true);
select pg_temp.check_true((select count(*)=3 from public.congregation_memberships),'admin lê vínculos de A');
select pg_temp.check_true((select count(*)=2 from public.member_phones),'admin lê só telefones de A');
update public.congregation_memberships set role='designador' where user_id=pg_temp.id('brother');
select pg_temp.check_true((select role='designador' from public.congregation_memberships where user_id=pg_temp.id('brother')),'admin gerencia perfis de A');
select pg_temp.expect_error($q$insert into public.congregation_memberships values(pg_temp.id('B'),pg_temp.id('outsider'),pg_temp.id('other-member'),'administrador')$q$,'42501','admin A não cria vínculo em B');
select pg_temp.expect_error($q$insert into public.congregation_memberships values(pg_temp.id('A'),pg_temp.id('outsider'),pg_temp.id('other-member'),'irmao')$q$,'23503','FK impede vincular membro de B em A');
select pg_temp.expect_error($q$delete from public.assignment_history$q$,'42501','admin também não apaga auditoria');

-- Visitors are scoped to the local directory and accepted only by explicit parts.
insert into public.members(id,congregation_id,name,category,is_visitor) values(pg_temp.id('visitor'),pg_temp.id('A'),'Orador Visitante Fictício','anciao',true);
delete from public.unavailability where member_id=pg_temp.id('admin-member');
select pg_temp.expect_error($q$insert into public.assignments(congregation_id,meeting_id,part_id,member_id) values(pg_temp.id('A'),pg_temp.id('ma'),pg_temp.id('pa3'),pg_temp.id('visitor'))$q$,'P0001','visitante não preenche parte sem permissão');
update public.meeting_parts set allows_visitor=true where id=pg_temp.id('pa3');
insert into public.assignments(congregation_id,meeting_id,part_id,member_id) values(pg_temp.id('A'),pg_temp.id('ma'),pg_temp.id('pa3'),pg_temp.id('visitor'));
select pg_temp.check_true((select count(*)=1 from public.assignments where member_id=pg_temp.id('visitor')),'visitante pode ser designado em parte permitida');
update public.members set active=false where id=pg_temp.id('visitor');
select pg_temp.check_true((select count(*)=0 from public.assignments where member_id=pg_temp.id('visitor')),'inativação remove designação');
select pg_temp.expect_error($q$update public.congregations set timezone='Fuso/Inexistente' where id=pg_temp.id('A')$q$,'P0001','fuso inválido é rejeitado');

select set_config('request.jwt.claim.sub',pg_temp.id('outsider')::text,true);
select pg_temp.check_true((select count(*)=0 from public.congregations),'usuário sem vínculo não lê congregações');
select pg_temp.check_true((select count(*)=0 from public.members),'usuário sem vínculo não lê membros');
select pg_temp.check_true((select count(*)=0 from public.member_phones),'usuário sem vínculo não lê telefones');
select pg_temp.check_true((select count(*)=0 from public.assignment_history),'usuário sem vínculo não lê histórico');
set local role anon;
select pg_temp.expect_error($q$select * from public.members$q$,'42501','anônimo não lê membros');
select pg_temp.expect_error($q$select * from public.assignments$q$,'42501','anônimo não lê designações');
select pg_temp.expect_error($q$select * from public.member_phones$q$,'42501','anônimo não lê telefones');
rollback;
