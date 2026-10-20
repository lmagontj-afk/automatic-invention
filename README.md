# Quadro semanal

PWA mobile-first em português do Brasil para organizar as designações de reuniões do meio de semana e do fim de semana. Next.js App Router, TypeScript, Tailwind, Supabase (PostgreSQL/Auth/RLS), Vitest e Playwright. Todos os exemplos e nomes da demonstração são fictícios; não há conteúdo ou logotipos de organizações.

## Rodar localmente

Requer Node.js **22.13+** (validado em Node 24) e npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Preencha `.env.local` com `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` do seu projeto (a chave anon legada também funciona). Sem essas variáveis, use **Abrir demonstração**. Ela funciona em memória, sem gravar no Supabase, e perde as alterações ao sair/recarregar. **Simular perfil de irmão** mostra a visão restrita de Caio Exemplo para testar respostas.

## Configurar Supabase

1. Crie um projeto Supabase. Aplique **todas** as migrações de `supabase/migrations`, na ordem dos nomes, pelo SQL Editor ou pela CLI instalada:

   ```sh
   supabase link --project-ref SEU_PROJECT_REF
   supabase db push
   ```

   Para a stack completa local, instale a CLI Supabase, execute `supabase start` e aplique as migrações com `supabase db reset` (esse último comando apaga dados locais). `supabase/config.toml` usa PostgreSQL 17.

2. Em Authentication, desabilite o cadastro público. Crie as contas com e-mail/senha, ou convide-as pelo painel e estabeleça o acesso antes do uso. Recuperação de senha e convites são administrados pelo painel neste MVP. Configure a URL do site e permita `https://seu-dominio/auth/callback` como redirecionamento; o callback trata a troca de código PKCE e rejeita links inválidos.
3. Copie URL e chave **pública/publishable** para `.env.local`. Nunca coloque a service role ou credenciais do banco no navegador, no Git ou em variáveis `NEXT_PUBLIC_*`.
4. Provisione a congregação e o primeiro administrador pelo SQL Editor em uma transação. Substitua o marcador pelo UUID real de uma conta **já criada no Auth**. Os nomes abaixo são exemplos fictícios.

   ```sql
   begin;
   do $$
   declare c uuid; m uuid;
   begin
     insert into public.congregations(name,timezone)
       values ('Congregação Horizonte Fictícia','America/Sao_Paulo') returning id into c;
     insert into public.members(congregation_id,name,category)
       values (c,'Caio Exemplo','anciao') returning id into m;
     insert into public.congregation_memberships(congregation_id,user_id,member_id,role)
       values (c,'UUID-DO-USUARIO-AUTH'::uuid,m,'administrador');
   end $$;
   commit;
   ```

5. Entre no app. Em **Irmãos**, cadastre pessoas, categorias e indisponibilidades. Em **Ajustes**, crie/edite os dois modelos e associe outras contas Auth aos cadastros e perfis. O administrador gerencia vínculos; o designador organiza as reuniões. Evite remover ou rebaixar seu único administrador; a recuperação desse acesso requer o SQL Editor.
6. Na tela **Semana**, selecione a semana e use **Criar reuniões da semana**. A operação é idempotente para cada modelo/horário: repetir não apaga o quadro existente. A migração registra a tabela `meetings` na publicação `supabase_realtime`, quando ela existe, para avisar sobre alterações concorrentes. O botão Atualizar continua disponível mesmo sem Realtime.

As migrações são: `202610200001_initial.sql` (domínio e RLS), `202610200002_workflows.sql` (transações, revisões e modelos) e `202610200003_responses.sql` (respostas restritas).

## Usar o quadro

- **Semana:** cartões das reuniões, busca de designados, destaque dos mais indicados, alertas de duplicação/elegibilidade/indisponibilidade e travas manuais. **Sugerir designados** prepara um rascunho; **Salvar reunião** grava. Navegar/recarregar descarta rascunhos não salvos.
- **Irmãos:** cadastro, categoria, telefone WhatsApp, visitante e indisponibilidades inclusivas. O perfil irmão vê apenas o próprio cadastro e pode editar suas indisponibilidades.
- **Histórico:** auditoria de criações, alterações, respostas e remoções, filtrável por pessoa. O perfil irmão vê apenas seus registros.
- **Ajustes:** tema, modelos, dias, horários, partes, funções, grupos de demonstrações/estudos e regras. O administrador também vincula contas a perfis.

Cada pessoa ocupa um slot. Demonstrações usam titular + ajudante; estudos usam dirigente + leitor, com o mesmo identificador de grupo. Há um slot para cada função, e as categorias/regras se aplicam individualmente. Os modelos iniciais contêm apenas títulos funcionais editáveis; não incluem textos de publicações.

Regras alteradas são salvas imediatamente e removem designados que deixaram de ser elegíveis, **inclusive travados**, com auditoria. Salve o rascunho antes de editar uma regra. Alterar a regra do modelo propaga para reuniões futuras já criadas; títulos, ordem, inclusão/remoção de partes e horários novos valem para semanas geradas depois. As cópias antigas preservam a programação original. Os visitantes pertencem ao cadastro da congregação anfitriã e só entram em partes que os permitem.

As gravações do quadro são transacionais e exigem a revisão atual da reunião. Se outro editor ou uma resposta alterar o quadro, atualize antes de refazer a alteração. Uma pessoa inalterada preserva ID e confirmação; uma substituição cria nova designação pendente e mantém o histórico anterior.

## Sugestões e revisão do motor

`src/lib/suggest.ts` contém `suggest`, `rankCandidates`, `isEligible` e `changePartEligibility`. É um módulo puro, sem rede ou relógio. [Revisão e limites do algoritmo](docs/suggestion-review.md).

O emparelhamento maximiza o número de partes preenchidas **antes** de minimizar a soma das frequências históricas. Recência e ID desempatarão. Não duplica pessoas na mesma reunião, respeita categorias, disponibilidade, visitantes, recusas por parte e travas. A mesma pessoa pode participar de reuniões diferentes.

O chamador passa datas civis `AAAA-MM-DD` no fuso da congregação. A frequência usa uma linha por designação passada confirmada, nunca os eventos brutos de auditoria. Pendentes, recusadas, mesma reunião e datas iguais/futuras não contam. As exclusões de recusas são consolidadas pelo último evento de cada designação e sobrevivem à substituição.

`complete` significa preenchimento total; `partial` explicita vagas e motivos; `blocked` indica travas incompatíveis e não retorna designações graváveis. Uma trava vazia é preservada. `changePartEligibility` é uma operação separada, que retorna ocupantes removidos por uma edição explícita de regra. O banco também aplica as regras e a limpeza.

## Avisos e respostas

Depois de salvar, use **Abrir WhatsApp** na designação pendente, ou **Avisar todos da semana**. A lista agrupa todas as partes pendentes da pessoa na semana. Cadastre país + DDD + telefone em Irmãos. O link `wa.me` inclui nome, parte, reunião, dia/data/horário locais e pedido de confirmação.

Cada conversa abre mediante sua ação. Revise e envie no WhatsApp. Abrir o link não comprova envio e não muda a confirmação. Telefones ausentes ou inválidos apontam o cadastro a corrigir. `NotificationTransport`, em `src/lib/notifications`, isola a ação do provedor; uma futura API oficial deverá usar adaptador e endpoint autenticado no servidor, sem chaves no cliente.

A pessoa logada confirma ou recusa apenas suas próprias designações, antes do início da reunião. A RPC verifica identidade, congregação, ID e status esperado e só altera o status. O designador vê recusas e até três substitutos disponíveis. Escolha um e **salve a reunião**. Uma recusa não destrava silenciosamente uma parte manual: revise a trava se a sugestão for bloqueada.

## PDF, imagem e consulta offline

Na Semana, **Exportar PDF** abre um quadro formatado. Na nova janela, use **Salvar como PDF / imprimir** e escolha o destino PDF do navegador/sistema. **Baixar imagem** gera PNG com quebra de linhas para nomes/títulos longos. Quadros grandes demais para uma imagem indicam o uso de PDF, que pagina o conteúdo. As exportações usam somente as designações salvas e não incluem telefones, tokens, UUIDs de usuários ou auditoria. O perfil irmão exporta apenas suas próprias partes.

Para usar offline, expanda **Consultar sem internet**, marque a opção de dispositivo de confiança e use **Salvar semana offline** enquanto conectado. O app confirma a ativação do service worker e guarda uma cópia da semana por até **24 horas**. Ao perder a conexão, a navegação para o início abre o visualizador estático; também é possível usar **Abrir cópia salva**.

A cópia é somente leitura, não sincroniza automaticamente e informa quando foi gerada. Não há edição ou fila de alterações offline. O service worker guarda apenas arquivos públicos do visualizador: **não faz cache de chamadas Supabase, cookies, páginas de autenticação ou respostas com dados pessoais**. Os nomes/designações da semana ficam separadamente no armazenamento local, sem telefones. Somente uma semana fica salva por vez.

Quem tiver acesso ao dispositivo poderá consultar a cópia consentida durante sua validade, mesmo sem rede; por isso, salve apenas em dispositivo confiável. Expiração, saída, troca de usuário/congregação/perfil ou **Apagar cópia offline** removem a cópia. Mudanças de permissão no servidor não podem revogar uma cópia enquanto o dispositivo está desconectado; a validade de 24 horas limita essa janela. Exportações já baixadas são arquivos sob responsabilidade de quem as recebeu.

PWA e consulta offline exigem HTTPS e navegador com service worker (localhost também funciona). Armazenamento privado/bloqueado pode impedir a cópia, com erro visível. O tema segue o sistema até uma escolha manual. Para alterar os arquivos públicos offline em versões futuras, aumente a versão do cache em `public/sw.js`.

## Segurança e testes

Cada congregação é isolada por RLS e chaves estrangeiras compostas. Telefones ficam em tabela própria, acessível apenas a administradores e designadores. O perfil irmão não tem UPDATE geral em designações. O histórico é imutável para os perfis do app. Os clientes Supabase usam a sessão do usuário e a chave pública; nenhuma chave privilegiada é usada no app.

```sh
npm run lint
npm run typecheck
npm test
npm run test:rls
npm run test:e2e
npm run build
```

- **Vitest:** domínio, elegibilidade, motor, notificações, datas, exportações e escopo/expiração offline. O motor foi comparado com busca exaustiva independente em 400 cenários, com e sem travas.
- **RLS/transações/respostas:** requer Docker ativo e acesso ao Docker Hub na primeira execução. Aplica as migrações reais em PostgreSQL 17 descartável, sem portas externas, e assume o papel `authenticated` com UUIDs fictícios. Testa isolamento, telefones, escalada de privilégios, vínculos cruzados, rollback, idempotência, concorrência por revisão e respostas próprias. O container é removido ao terminar.
- **Playwright:** Chromium com viewport de celular, sugestões, conflitos, cadastros, regras, confirmação/recusa/substituição, PNG, impressão/PDF e perda de rede real, além de expiração e exclusão de cópias. Usa a demonstração. Se necessário, instale o navegador com `npx playwright install --with-deps chromium`, ou informe `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Chromium em `/usr/bin/chromium` é detectado automaticamente.

`supabase/tests/bootstrap.sql` simula somente os papéis e `auth.users`/`auth.uid()` do Supabase. **Nunca o aplique no projeto real.** Os testes SQL validam políticas no banco, mas não substituem uma validação HTTP do login, das chamadas RPC e do Realtime no seu Supabase. Essa validação requer seu projeto configurado. Nenhum projeto hospedado foi criado, modificado ou publicado nesta implementação.

A CI executa lint, tipos, Vitest, SQL, Playwright e build. Convenções e comandos adicionais estão no [AGENTS.md](AGENTS.md).

## Publicar

1. Configure e migre o Supabase conforme as instruções acima.
2. Em um provedor compatível com Next.js, defina as duas variáveis públicas do Supabase **antes do build**. Use `npm ci` e `npm run build`. Em hospedagem Node própria, execute `npm start` atrás de HTTPS; em uma plataforma com integração Next.js, use a integração do provedor.
3. Configure Site URL e redirecionamento `/auth/callback` no Auth para o domínio final. Confirme que cadastro público está desabilitado e que as contas estão vinculadas aos perfis corretos.
4. Valide com contas distintas de duas congregações: login, criação/salvamento, acesso restrito, confirmação, recusa/substituição e avisos manuais. Verifique instalação PWA, impressão, PNG e cópia offline em um celular real. Teste o logout e a exclusão da cópia local.

## Fora do MVP

- Envio pela API oficial do WhatsApp, disparos automáticos e comprovantes de entrega.
- Otimização global entre semanas, regras de parentesco/pares preferidos e controle de comparecimento efetivo.
- Cadastro público, gestão de convites/senhas dentro do app e provisionamento autônomo de congregações.
- Edição/sincronização offline e revogação remota instantânea de cópias desconectadas.
