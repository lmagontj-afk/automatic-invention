# Quadro semanal

App mobile-first em português do Brasil para organizar designações de reuniões. Implementação inicial em etapas, com dados exclusivamente fictícios.

## Rodar localmente

Requer Node.js 22.13+ e npm.

```sh
npm ci
npm run dev
```

Abra o endereço mostrado pelo Next.js. Para validar e executar em produção:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

## PWA e publicação

Publique em um provedor compatível com Next.js, usando `npm ci` e `npm run build`. Execute `npm start` em um servidor Node ou use a integração Next.js do provedor. HTTPS é necessário para instalação PWA (localhost também permite desenvolvimento).

O manifesto, os ícones originais e o service worker básico estão disponíveis em produção. O tema segue o sistema até uma escolha manual. A consulta offline será acrescentada na etapa 7; o worker atual não armazena dados autenticados.

## Escopo atual

Etapa 1: base Next.js, TypeScript, Tailwind, tema e estrutura PWA. Banco e motor serão documentados nas próximas etapas.

Fora desta entrega inicial: telas operacionais, notificações WhatsApp, confirmação/recusa, PDF/imagem e consulta offline. Integração com API oficial do WhatsApp ficará fora do MVP.

## Supabase (etapa 2)

1. Crie um projeto Supabase. Em **Authentication**, desabilite o cadastro público e crie/convide os usuários autorizados. Configure a URL do site e as URLs de redirecionamento HTTPS do seu deploy. O fluxo de login será implementado na etapa 4.
2. Aplique `supabase/migrations/202610200001_initial.sql` no SQL Editor, ou use a CLI Supabase com `supabase link` e `supabase db push`. Para a stack Supabase local, use a CLI instalada, `supabase start` e `supabase db reset` (destrói dados locais).
3. Copie `.env.example` para `.env.local` e preencha URL do projeto e chave **publishable** (ou chave legada anon). No deploy, configure as mesmas variáveis antes do build. Nunca use a service role no cliente.
4. O primeiro administrador é provisionado pelo operador no SQL Editor, em uma transação. Use o UUID real de um usuário já criado em Auth no lugar do marcador abaixo. Não habilite uma política pública de criação de congregações.

```sql
begin;
do $$
declare c uuid; m uuid;
begin
  insert into public.congregations(name) values ('Congregação Horizonte Fictícia') returning id into c;
  insert into public.members(congregation_id,name,category)
    values (c,'Caio Exemplo','anciao') returning id into m;
  insert into public.congregation_memberships(congregation_id,user_id,member_id,role)
    values (c,'UUID-DO-USUARIO-AUTH'::uuid,m,'administrador');
end $$;
commit;
```

Cadastre os outros vínculos como administrador; designadores não podem promover perfis. Telefones (somente dígitos, país + DDD + número) ficam em `member_phones`, fora da tabela de nomes. O perfil irmão só consulta seu cadastro, suas partes/designações/histórico e reuniões relacionadas, e pode editar suas indisponibilidades. Nenhum perfil do app apaga o histórico. Confirmação/recusa pelo irmão será uma operação restrita na etapa 6, ainda não liberada.

Modelos têm tipo, dia (0=domingo), horário local e partes ordenadas com regra de elegibilidade. Cada pessoa ocupa um slot: demonstrações usam titular e ajudante; estudos usam dirigente e leitor, unidos pelo mesmo `group_key`. Reuniões guardam horário absoluto e cópias das partes. O app deverá criar essas cópias em uma transação na etapa 4. Títulos são texto editável, sem conteúdo protegido pré-carregado. Visitantes são cadastros fictícios/locais na congregação anfitriã com `is_visitor=true`; só entram em partes com `allows_visitor=true`.

Chaves estrangeiras compostas impedem referências entre congregações. O banco impede duplicação por reunião, inelegibilidade e indisponibilidade (datas inclusivas, no fuso IANA da congregação). Alterar a regra de uma parte remove designações inválidas, inclusive travadas, com auditoria. Alterar regras do modelo propaga para reuniões futuras; reuniões passadas mantêm suas regras. Mudanças em disponibilidade, categoria, atividade e fuso também revalidam designações. Substituir uma pessoa requer excluir e inserir na mesma transação, preservando o histórico anterior. Transações são serializadas por congregação via advisory lock.

### Testar RLS sem credenciais

```sh
npm run test:rls
```

Requer Docker em execução e acesso ao Docker Hub na primeira execução. O teste aplica a migração real a um PostgreSQL 17 descartável, assume o papel `authenticated` com UUIDs de sessão fictícios e testa leituras, escritas, escalada de privilégios, telefones, referências cruzadas e invariantes. O bootstrap em `supabase/tests/bootstrap.sql` simula somente `auth.users`/`auth.uid()` e papéis: **não deve ser aplicado no Supabase**. Esse teste valida as políticas no banco, não o fluxo de login, JWT HTTP ou a stack completa hospedada.
