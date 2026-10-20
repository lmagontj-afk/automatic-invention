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

Implementadas as etapas 1 a 3:

- Base Next.js, TypeScript, Tailwind, tema claro/escuro e estrutura PWA.
- Migração PostgreSQL/Supabase, clientes Auth preparados e RLS com testes de integração.
- Motor puro de sugestão e ranking, com revisão e testes unitários.

As telas de operação e o fluxo de login ainda não foram implementados. A página inicial é apenas a base visual, sem dados reais. Não publique esta etapa como um produto operacional.

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

## Motor de sugestão (etapa 3)

`src/lib/suggest.ts` exporta `suggest`, `rankCandidates`, `isEligible` e `changePartEligibility`. Não depende do Supabase ou do navegador. [Revisão do algoritmo e limites](docs/suggestion-review.md).

```ts
import { suggest, type SuggestInput } from "./src/lib/suggest";

const data: SuggestInput = {
  congregationId: "horizonte-ficticia",
  meeting: { id: "reuniao-1", congregationId: "horizonte-ficticia", date: "2026-10-21" },
  members: [{
    id: "caio", congregationId: "horizonte-ficticia", name: "Caio Exemplo",
    category: "anciao", active: true, unavailability: [],
  }],
  parts: [{ id: "presidente", congregationId: "horizonte-ficticia", meetingId: "reuniao-1", eligibility: "irmaos_batizados" }],
  existing: [],
  history: [],
};
const proposal = suggest(data);
// complete: todas as partes preenchidas; partial: faltas explicitadas em unfilled.
// blocked: trava inválida, com conflicts e SEM assignments para persistir.
```

Passe datas civis `AAAA-MM-DD` no fuso da congregação, e um registro por designação no histórico (não por evento de auditoria). O motor considera apenas o passado confirmado, descarta outra congregação e não duplica pessoas na reunião. Maximiza o preenchimento antes de equilibrar frequência; recência e ID desempatarão. Travas válidas permanecem; designações destravadas são recalculadas. Uma trava vazia permanece vazia. Uma trava incompatível com os dados atuais exige revisão manual.

Para alterar uma regra, use `changePartEligibility`: o retorno contém partes atualizadas, designações limpas e uma lista de removidos. O banco faz a mesma limpeza ao persistir a regra. Ranking para um seletor considera os outros slots ocupados; o gerador completo pode reorganizar todos os slots destravados. Nenhum retorno deve ser gravado sem sessão, autorização e validação transacional pelo banco.

## Verificações

```sh
npm run lint
npm run typecheck
npm test                # 67 testes; 62 do motor, incluindo 400 cenários contra oráculo exaustivo
npm run test:rls         # políticas e invariantes no PostgreSQL, com Docker
npm run build
```

A CI executa essas verificações. O teste RLS local não substitui a validação futura do login e das chamadas HTTP contra o seu projeto Supabase. Nenhum projeto hospedado foi criado, alterado ou publicado por esta entrega.

## Telas e persistência (etapa 4)

A tela Semana gera as reuniões a partir dos modelos, oferece busca de pessoas, destaques de sugestões, travas e conflitos no rascunho. **Salve a reunião** para gravar as escolhas. Regras são salvas imediatamente e removem ocupantes incompatíveis. Irmãos cadastra pessoas e indisponibilidades; Histórico apresenta a auditoria; Ajustes permite editar modelos e vincular contas Auth a perfis.

Aplique também `202610200002_workflows.sql`. As RPCs de cadastro, modelos, criação da semana e designações são transacionais e executam com as permissões do usuário. A gravação do quadro exige a revisão atual da reunião; se outro editor alterar os dados, atualize antes de tentar de novo. As cópias de reuniões mantêm títulos e horários anteriores; a regra do modelo propaga para o futuro. Partes retiradas de um modelo são desativadas, preservando referências antigas.

O login usa e-mail/senha do Supabase Auth. Crie as contas pelo painel antes de vinculá-las; cadastro público permanece desabilitado. O callback PKCE usa `/auth/callback`, que deve constar das URLs permitidas. Recuperação/invites são administrados pelo painel do Supabase neste MVP.

Sem configuração, **Abrir demonstração** permite experimentar as telas com dados fictícios em memória. A demonstração não grava no banco e perde as alterações ao sair/recarregar. Telefones demonstrativos ficam vazios.

```sh
npm run test:e2e
```

Os testes Playwright exercitam os fluxos em Chromium com viewport de celular. Use o Chromium instalado ou `npx playwright install chromium` (Linux pode precisar de `npx playwright install --with-deps chromium`). Para indicar outro executável, defina `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Os testes de UI usam a demonstração; autorização e transações são exercitadas separadamente no PostgreSQL. O login HTTP no Supabase hospedado precisa ser validado após configurar seu projeto.

## Avisos WhatsApp (etapa 5)

Depois de salvar, use **Abrir WhatsApp** junto a uma designação pendente, ou **Avisar todos da semana** para abrir uma lista agrupada por pessoa. Cadastre país + DDD + telefone em Irmãos. Os links `wa.me` incluem nome, parte, reunião, dia/data/horário locais e pedido de confirmação. Telefones ausentes/invalidos indicam o cadastro a corrigir.

Cada conversa é aberta por uma ação sua. Revise e envie no WhatsApp. Abrir um link não comprova envio nem muda o status da designação. A lista inclui só pendentes; o app não faz disparos automáticos. `NotificationTransport`, em `src/lib/notifications`, isola a preparação da ação do provedor. Uma futura integração oficial deverá implementar um adaptador e endpoint autenticado no servidor; chaves dessa API nunca devem ir ao navegador.

## Confirmação e recusa (etapa 6)

Aplique `202610200003_responses.sql`. Na tela Semana, cada pessoa logada pode confirmar ou recusar suas próprias designações antes do início da reunião. A RPC verifica identidade, congregação, designação atual e status esperado. Ela só altera o status; o perfil irmão continua sem permissão geral de atualizar designações. Respostas e substituições ficam na auditoria.

O designador vê recusas e até três substitutos elegíveis, respeitando disponibilidade, ocupação na reunião e histórico. Escolher um substituto altera o rascunho; **salve a reunião**. A nova designação começa pendente. Recusas anteriores para aquela parte continuam excluídas após substituição. Uma trava manual incompatível com uma recusa deve ser revisada, sem substituição automática.

Na demonstração, **Simular perfil de irmão** permite experimentar a visão restrita e responder como Caio Exemplo. Volte à administração para testar a substituição. Isso só simula dados fictícios; permissões reais são exercidas pelos testes SQL com o papel `authenticated`.
