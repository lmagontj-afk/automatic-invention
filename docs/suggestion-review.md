# Revisão do motor de sugestão — etapa 3

Revisado antes de iniciar as telas. Implementação em `src/lib/suggest.ts`, sem acesso ao banco, relógio, rede ou estado global.

## Decisões e invariantes

- A prioridade é **preencher o maior número possível de partes** com pessoas diferentes. Depois, minimizar a soma das frequências históricas de quem foi escolhido. Uma solução com menos partes preenchidas nunca vence por ter frequência menor.
- O problema é um emparelhamento bipartido de custo mínimo: cada parte e cada pessoa têm capacidade 1. Caminhos residuais permitem revisar escolhas anteriores. Uma escolha gulosa por ordem de tela não oferece essa garantia.
- A matriz de elegibilidade contém os 16 pares de categorias/regras. Indisponibilidade é inclusiva nas duas extremidades; pessoas inativas não participam. Visitantes precisam da categoria exigida e de permissão explícita na parte.
- Só contam registros confirmados, de reuniões anteriores à data civil alvo, da mesma congregação e de outra reunião. Uma designação é contada uma vez, mesmo que chegue repetida. Versões conflitantes do mesmo registro são rejeitadas. Não passe eventos brutos da tabela de auditoria como se fossem designações distintas.
- A recência desempata frequências iguais: quem participou há mais tempo vem antes. IDs tornam o resultado estável, independentemente da ordem de entrada. O peso da frequência é maior que todo o desempate possível somado.
- Travas válidas são reservadas antes do emparelhamento. Uma trava vazia é uma decisão manual de deixar o slot vazio. Uma trava inválida ou duplicada bloqueia a proposta inteira; não há `assignments` nesse resultado. A pessoa precisa revisar a trava.
- A **edição explícita de regra** é outra operação: limpa ocupantes que deixaram de ser elegíveis, inclusive uma trava. `changePartEligibility` retorna os removidos para a interface explicar a alteração; o trigger SQL também a impõe no banco.
- Entradas são preservadas; uma proposta não grava nada. As designações destravadas podem ser reorganizadas. Persistência e autorização continuam sendo responsabilidade da camada autenticada e do banco.

## Verificações realizadas

- 62 testes do módulo, cobrindo a matriz de elegibilidade, funções de ranking/edição, datas, visitantes, dados malformados, conflitos, imutabilidade e determinismo.
- Comparação com um algoritmo independente de busca exaustiva em **250 cenários sem travas e 150 com travas**. Conferidos máximo de partes preenchidas, mínimo de frequência total e ausência de duplicações.
- Regressão explícita: parte aberta + parte só para ancião, com um único ancião. O motor reatribui a parte aberta para não deixar a restrita vazia, mesmo quando isso custa mais histórico.
- Reunião representativa de 24 slots e 80 pessoas, com categorias e frequências variadas.
- Ajuste encontrado durante a revisão: quando a única pessoa elegível está reservada por uma trava em outra parte, o motivo do slot vazio deve ser **falta de pessoas distintas**, em vez de ausência de pessoas elegíveis. Há teste de regressão para essa distinção.

## Limites conhecidos

A otimização é por reunião, não por mês/semana inteira. A mesma pessoa pode ser designada em reuniões diferentes. Não há regras de parentesco, pares preferenciais ou intervalos mínimos entre participações. A janela de histórico é escolhida pelo chamador e deve ser a mesma para todos. Datas e dados do banco precisam ser convertidos para os tipos do módulo, incluindo a data no fuso da congregação. O histórico confirmado representa a frequência usada no MVP; não há controle de comparecimento efetivo.

O custo do algoritmo cresce com pessoas e slots; a estratégia é adequada ao quadro de uma congregação. Uma alteração futura de objetivo ou escala exige rever estes testes, especialmente a comparação exaustiva. Telas, persistência transacional de propostas, autenticação de ponta a ponta e confirmação/recusa ainda serão implementadas nas etapas seguintes.
