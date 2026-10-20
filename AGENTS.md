# Convenções do projeto

App mobile-first em português do Brasil para designações de reuniões. Dados de exemplo devem ser fictícios; não adicione logotipos ou conteúdo protegido de organizações.

## Comandos

Use Node.js 22.13+ (validado também em Node 24) e npm. Na raiz:

- Instalação reproduzível: `npm ci`
- Desenvolvimento: `npm run dev`
- Lint: `npm run lint`
- Tipos: `npm run typecheck`
- Testes: `npm test`
- Produção: `npm run build` e `npm start`

A configuração npm mantém o cache em `/tmp`, sem exigir escrita no diretório pessoal.

## Trabalho

- Use o checkout existente; cada tarefa na nuvem já é isolada. Não crie worktrees sem solicitação.
- Implemente em etapas; execute lint, typecheck e testes e corrija falhas antes de cada commit.
- Não avance para a etapa seguinte com verificações falhando.
- TypeScript estrito; funções de domínio puras em `src/lib`, testes Vitest junto ao módulo.
- App Router em `src/app`; componentes interativos pequenos em `src/components`.
- Uma cor de destaque, contraste AA, foco visível, alvos de toque >=44px, texto >=16px e respeito a reduced motion.
- Nenhum segredo no cliente ou no Git. Nunca use service role no navegador.
- O isolamento das congregações e as permissões devem ser garantidos por RLS no banco, não apenas pela interface.
- Não instale dependências sem necessidade. Preserve o lockfile com `npm ci`.
- Etapas 4 a 7 autorizadas. Valide e faça um commit por etapa. Nenhum envio automático de mensagem ou publicação sem autorização.

## Banco

- Migrações versionadas em `supabase/migrations`. Nunca aplique o bootstrap de testes em produção.
- Testes reais de políticas: `npm run test:rls` (Docker disponível; baixa PostgreSQL 17 por digest, cria container efêmero sem rede/portas e o remove ao terminar).
- `npm test` não exige Docker nem Supabase. Execute também `npm run test:rls` ao alterar migrações/permissões.
- Clientes Supabase usam a sessão do usuário e a chave pública. Autorize no banco; nenhuma chave privilegiada no app.
- Cadastros de visitantes também pertencem à congregação anfitriã; `allows_visitor` restringe as partes.

## Motor de sugestão

- Leia `docs/suggestion-review.md` antes de alterar `src/lib/suggest.ts`.
- Prioridade: máximo de partes preenchidas, depois menor frequência histórica. Não substitua o emparelhamento por uma escolha gulosa sem manter a garantia e os testes exaustivos.
- Travas inválidas bloqueiam a proposta; edição explícita de elegibilidade pode limpar travas inválidas. Não confunda essas operações.
- Converta `starts_at` para a data civil no fuso da congregação. Não use `toISOString().slice(0,10)` como data local.
- Não conte linhas de auditoria como participações: consolide por designação e status. Registros recusados, pendentes e futuros não compõem frequência passada.

## Navegador

- `npm run test:e2e`: Playwright em viewport de celular. Usa Chromium de `/usr/bin/chromium` quando disponível; alternativa: `npx playwright install chromium`, ou `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
- A demonstração é explicitamente fictícia e não grava dados no Supabase. A segurança real é verificada nos testes SQL.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Exportação e offline

- O conteúdo exportado e o documento do snapshot devem usar a projeção explícita em `weekly-document.ts`, sem telefones, tokens, perfis ou auditoria. Metadados de escopo (usuário, congregação e perfil) ficam fora do documento para invalidar a cópia ao trocar de acesso. O irmão só pode exportar suas próprias partes.
- PDF usa a impressão do navegador; PNG usa Canvas. Não adicione bibliotecas pesadas apenas para captura.
- A cópia offline requer consentimento, expira em 24h, é somente leitura e deve ser apagada ao sair/trocar conta, congregação ou perfil. Não faça cache de respostas Supabase ou rotas de autenticação.
- O service worker guarda só arquivos públicos do visualizador. Ao mudar os arquivos estáticos offline, aumente a versão `quadro-shell-*` em `public/sw.js` para invalidar o cache anterior.
- `npm run test:e2e` precisa continuar verificando perda de rede real no contexto do navegador, expiração, exclusão e exportação, além dos fluxos de designação.
