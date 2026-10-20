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
- Não implemente etapas 4+ sem nova solicitação do usuário.
