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
