# Plano de refatoracao: ocupacoes cronologicas e retirada avulsa

Data: 29/07/2026  
Status: implementacao iniciada.

Progresso em 29/07/2026:

- Fase 0 aprovada pelo responsavel do projeto.
- Fase 1 iniciada no backend com o tipo `NormalizedOccupancy`, conversao de
  reservas SUAP para ocupacoes e regra cronologica centralizada.
- Persistencia Firestore preparada para gravar `occupancies` em paralelo com
  `reservations`, mantendo compatibilidade com a PWA atual.
- Disponibilidade operacional do backend ajustada para ler `occupancies` como
  fonte principal, com fallback temporario para `reservations`.
- Testes unitarios cobrem inicio inclusivo, fim exclusivo e retirada antes de
  ocupacao futura.
- Fase 2 iniciada com parser de salas preservando `roomCode`, `active`,
  `schedulable`, `scheduleUrl`, campus/predio e ordenacao natural no catalogo.
- Fase 3 iniciada com captura do link `Visualizar`, extracao de
  `requestExternalId` em `/comum/sala/ver_solicitacao/{id}/` e IDs de reserva
  mais estaveis por solicitacao/data quando esse link esta disponivel.
- Fase 4 iniciada com parser/normalizador isolado da agenda da sala
  (`/comum/sala/solicitar_reserva/{id}/`), convertendo entradas futuras em
  `occupancies` com classificacao conservadora. O Playwright agora executa por
  `scheduleUrl` no worker PM2, limitado as salas ativas/agendaveis do PS.

## Objetivo

Refatorar o sistema do IFBA Campus Porto Seguro (`PS`) para tratar corretamente
tres fluxos:

1. Aulas nativas vindas do SUAP.
2. Reservas SUAP nao regulares.
3. Retiradas avulsas registradas pela portaria.

Aulas nativas e reservas SUAP sao ocupacoes programadas do ambiente. Retirada
avulsa e apenas movimentacao fisica da chave na portaria. O bloqueio da chave
deve seguir a cronologia real da ocupacao: `startsAt <= agora < endsAt`. Nao
deve existir regra de bloquear minutos antes.

Todos os filtros, fontes e validacoes deste plano devem considerar somente o
Campus Porto Seguro. Nos links SUAP ja analisados, isso aparece como campus
`PS` e parametro `campus=27`.

## Cadencia das raspagens

Nem toda raspagem deve ter a mesma frequencia. A frequencia depende da natureza
do dado e do risco operacional para a portaria.

| Rotina | Frequencia proposta | Motivo |
| --- | --- | --- |
| Reservas SUAP do dia e proximos dias | Continua, inicialmente a cada 15 minutos, configuravel | Reservas podem ser criadas, alteradas, deferidas ou canceladas durante o dia. |
| Aulas nativas | Baixa/media frequencia, conforme fonte encontrada | Grade academica muda menos que reservas avulsas, mas precisa refletir ajustes de horario e sala. |
| Salas/chaves agendaveis | Inicial, manual e eventual | Cadastro de sala muda pouco e nao precisa consultar o SUAP a todo momento. |
| Detalhe de solicitacao | Sob demanda ou apenas para registros novos/alterados | Evita abrir detalhe de todas as reservas em todo ciclo. |
| Reconciliacao | Eventual, em horario de menor uso | Serve para corrigir divergencias sem sobrecarregar o SUAP. |

Diretriz: a rotina continua deve ser reservada para dados que mudam ao longo do
dia e afetam diretamente a entrega da chave. Dados cadastrais e dados de baixa
mudanca devem usar sincronizacao manual, diaria, semanal ou por evento.

## Fase 0: alinhamento e congelamento

Objetivo: garantir que a implementacao so comece depois da aprovacao deste
plano.

Atividades:

- revisar este documento com o responsavel do projeto;
- confirmar a remocao definitiva da regra de bloqueio antecipado;
- confirmar que a PWA nao cadastra salas, chaves, reservas ou aulas;
- confirmar que SUAP continua sendo fonte oficial de aulas e reservas;
- definir que retirada avulsa e sempre dado operacional local.
- confirmar que suporte a outros campi fica fora desta refatoracao.

Entrega:

- plano aprovado ou ajustado.

Criterio de parada:

- nenhuma alteracao de codigo antes da aprovacao.

## Fase 1: modelo de dominio

Objetivo: criar um contrato unico para ocupacoes programadas.

Atividades:

- definir o tipo `Occupancy`;
- separar `sourceKind` em `aula_regular`, `reserva_deferida`,
  `solicitacao_reserva`, `aula_extra`, `contraturno`, `evento`,
  `auditorio_ginasio` e `outro`;
- manter `reservations` temporariamente como compatibilidade;
- criar ou documentar a colecao `occupancies`;
- definir identificador estavel por origem;
- definir `blocksKey` calculado por status e cronologia.

Regra central:

```text
bloqueia = status confirmado && startsAt <= agora < endsAt
```

Entrega:

- tipos/backend prontos para receber ocupacoes;
- modelo Firestore documentado;
- testes unitarios do calculo cronologico.

Criterio de parada:

- nenhum dado antigo duplicado na mesma colecao;
- reservas atuais continuam legiveis pela PWA.

## Fase 2: salas e chaves

Objetivo: estabilizar o cadastro derivado de salas e chaves.

Status: em implementacao. O backend ja extrai codigo operacional da sala,
opcoes dinamicas da listagem SUAP e link `Solicitar/Ver Reservas`; a rotina
continua restrita ao Campus Porto Seguro (`PS`, `campus=27`).

Atividades:

- manter a listagem administrativa de salas como fonte primaria;
- sincronizar todas as salas agendaveis do Campus Porto Seguro na configuracao
  inicial;
- coletar e persistir as opcoes da sala: ativa, agendavel e link
  `Solicitar/Ver Reservas`;
- manter atualizacao manual e rotina eventual, por exemplo diaria fora do
  horario de pico ou semanal, conforme necessidade operacional;
- refletir mudancas feitas por administrador do SUAP sem apagar historico local;
- garantir ordenacao por codigo natural, como A01, A02, B01, C01;
- manter `rooms`, `keys` e `key_room_links` somente leitura para a PWA;
- marcar sala ausente como inativa somente apos confirmacao.

Entrega:

- catalogo completo de salas/chaves no Firestore;
- estado atual de `active`, `schedulable` e `scheduleUrl` persistido por sala;
- nenhuma dependencia de salas fixas no codigo.

Criterio de parada:

- sala sem reserva tambem aparece para retirada avulsa;
- sala removida do SUAP nao apaga historico.
- sala desativada ou nao agendavel e sinalizada como restrita/indisponivel para
  nova retirada, salvo regra operacional futura.

## Fase 3: scraping de reservas SUAP

Objetivo: melhorar a confiabilidade das reservas nao regulares.

Status: em implementacao. O relatorio comum continua sendo a fonte operacional
principal; o parser ja preserva o link de visualizacao da solicitacao e usa o ID
da solicitacao como identificador de origem. Paginas de detalhe ainda devem ser
acessadas apenas sob demanda ou para registros novos/alterados, evitando custo
alto em todo ciclo de 15 minutos.

Atividades:

- capturar o link `Visualizar` do relatorio comum;
- extrair `requestExternalId` de `/comum/sala/ver_solicitacao/{id}/`;
- usar paginas administrativas de solicitacoes como fonte complementar;
- usar paginas administrativas de reservas quando trouxerem dados melhores;
- consultar sempre de hoje em diante;
- nao reprocessar historico antigo;
- preservar paginacao e filtros por campus, data, hora e situacao;
- garantir que os filtros permanecam restritos a Porto Seguro (`PS`,
  `campus=27`);
- executar continuamente, inicialmente a cada 15 minutos, com intervalo
  configuravel e backoff em caso de falha.

Entrega:

- reservas futuras normalizadas em `occupancies`;
- IDs estaveis usados no upsert;
- fixtures sanitizadas para parser.

Criterio de parada:

- alteracao de horario ou sala deve atualizar documento existente quando o SUAP
  expuser identificador de ocorrencia suficiente; com o relatorio comum atual,
  o backend ja estabiliza por solicitacao/data e registra `requestExternalId`;
- cancelamento so ocorre com evidencia explicita do SUAP.

## Fase 4: aulas nativas

Objetivo: incluir aulas regulares como ocupacoes programadas.

Status: habilitada de forma controlada no worker PM2. Ja existe normalizador
testado para texto sanitizado da agenda atual da sala, e o Playwright visita
`scheduleUrl` somente de salas ativas/agendaveis do PS. A execucao completa de
29/07/2026 leu as 34 salas do catalogo e normalizou 104 ocupacoes na janela de
7 dias: 54 `aula_regular`, 25 `evento` e 25 `outro`. O dry-run nao escreveu no
Firestore. A rotina continua com limite explicito de 34 salas e intervalo geral
de 15 minutos, sujeito a backoff em falhas.

Atividades:

- investigar fonte mais estavel de aulas nativas no SUAP;
- priorizar pagina administrativa ou endpoint estruturado se existir;
- usar agenda por sala apenas como fallback controlado;
- limitar a coleta por periodo futuro, descartando datas anteriores a data de
  inicio da janela;
- definir frequencia apos identificar a fonte: diaria/por turno se for fonte
  estavel e barata, semanal/manual se for grade sem mudanca frequente, ou
  seletiva por sala se depender de calendario individual;
- manter a flag habilitada somente no worker PM2 depois da validacao controlada;
- limitar a execucao por `SUAP_ROOM_SCHEDULE_SYNC_MAX_ROOMS` e janela futura;
- executar `SUAP_ROOM_SCHEDULE_SYNC_MAX_ROOMS=2 npm run suap:schedule:dry-run`
  apos o build para conferir a fonte sem gravar Firestore;
- confirmar no resultado apenas contagens, codigos, horarios e classificacoes,
  sem expor nomes ou finalidades pessoais;
- manter o filtro explicito de campus `PS` antes de qualquer ativacao continua;
- classificar aulas como `aula_regular`;
- classificar eventos/projetos/atendimentos obvios como `evento` e entradas
  incertas como `outro`;
- relacionar aula a sala, dia, horario, professor/turma/disciplina quando
  disponivel.

Entrega:

- parser/normalizador de aulas futuras no mesmo modelo `occupancies`;
- integracao controlada do worker com a agenda por sala atras de feature flag;
- regras de privacidade definidas para dados de professor/turma.

Resultado da validacao controlada:

- a fonte de agenda respondeu com sucesso para as 34 salas selecionadas;
- a filtragem de campus `PS` foi aplicada antes da selecao;
- datas passadas ficaram fora da janela normalizada;
- a classificacao inicial produziu as tres categorias esperadas;
- os casos `evento` e `outro` foram preservados com classificacao conservadora;
- a PWA ja consome a colecao `occupancies` para a agenda operacional;
- o primeiro ciclo persistido do worker deve ser conferido no `sync_status` e no
  Firestore antes de considerar a fase encerrada.

Diagnostico controlado disponivel:

```text
backend: npm run build
backend: SUAP_ROOM_SCHEDULE_SYNC_MAX_ROOMS=2 npm run suap:schedule:dry-run
```

O comando autentica somente para leitura, consulta o catalogo de salas do PS e
as agendas limitadas pela configuracao. Ele nao executa `sync()`, nao escreve
`occupancies`, nao inicia PM2 e nao envia formularios ao SUAP.

Criterio de parada:

- aulas bloqueiam apenas durante o horario real;
- ausencia temporaria de aula nao libera chave por falha de scraping.
- worker nao abre todas as agendas individuais em intervalos curtos sem
  configuracao explicita de cadencia e limites.

## Fase 5: regras de disponibilidade

Objetivo: substituir a regra antiga por disponibilidade cronologica.

Status: implementado no backend para o calculo de disponibilidade. A variavel
legada de minutos pode existir em configuracao por compatibilidade, mas nao
altera a regra vigente.

Atividades:

- manter a configuracao antiga apenas como legado e remover seu efeito na regra;
- calcular estado por prioridade:
  indisponivel fisico, retirada aberta, atraso, manutencao/perda/dano,
  ocupacao ativa, disponivel;
- liberar bloqueio programado automaticamente apos `endsAt`;
- manter chave indisponivel se existir movimento aberto;
- validar retirada avulsa contra conflito cronologico com ocupacao futura,
  usando a previsao de retorno quando informada.

Entrega:

- servico de disponibilidade com regra `startsAt <= agora < endsAt`;
- testes para antes, durante e depois da ocupacao.

Criterio de parada:

- nenhuma referencia funcional a bloqueio antecipado por minutos;
- retirada avulsa antes de ocupacao futura e permitida quando nao ha conflito
  com o uso solicitado.

## Fase 6: PWA da portaria

Objetivo: refletir as novas regras sem complicar a rotina do porteiro.

Status: implementacao iniciada no frontend. A disponibilidade operacional e a
agenda diaria passaram a usar `occupancies` diretamente, mantendo
`reservations` apenas na area administrativa de diagnostico. O calculo da PWA
foi ajustado para `startsAt <= agora < endsAt`, sem janela de 30 minutos, e o
listener recalcula o relogio periodicamente para liberar/bloquear a chave mesmo
sem nova alteracao no Firestore.

Atividades:

- tela inicial continua focada nas reservas/ocupacoes do dia;
- retirada avulsa continua em tela propria;
- exibir status simples: disponivel, retirada, aguardando devolucao,
  bloqueada por ocupacao atual, indisponivel;
- mostrar detalhes de aula/reserva somente quando necessario;
- manter operacao em poucos cliques;
- garantir atualizacao em tempo real via Firestore.

Entrega:

- UI atualizada para ocupacoes cronologicas;
- mensagens e modais coerentes com aula, reserva e avulsa.

Progresso atual:

- listener de disponibilidade le `occupancies`;
- agenda da portaria filtra ocupacoes do dia;
- salas `active/schedulable` sao sinalizadas e nao permitem retirada avulsa
  quando estiverem restritas;
- regra de 30 minutos nao existe mais no calculo da PWA;
- retirada avulsa nao herda mais automaticamente uma ocupacao futura como se
  fosse uma reserva vinculada;
- previsao de retorno avulsa que ultrapassa o inicio da proxima ocupacao
  conhecida e recusada;
- build Angular passou em 29/07/2026;
- Hosting e Security Rules foram publicados em `https://keychain-ifbaps.web.app`
  em 29/07/2026;
- smoke test headless carregou a tela de login publicada com HTTP 200;
- validacao autenticada dos cenarios reais e revisao visual responsiva ainda
  faltam.

Criterio de parada:

- porteiro consegue identificar se a chave esta livre agora;
- a tela nao sugere bloqueio antes do horario real da ocupacao.

## Fase 7: seguranca, auditoria e privacidade

Objetivo: preservar separacao entre SUAP, Firestore e PWA.

Atividades:

- manter credenciais SUAP somente no backend;
- impedir escrita da PWA em `rooms`, `keys`, `key_room_links` e `occupancies`;
- registrar `operatorUserId`, pessoa que retirou, identificacao, data/hora,
  chave, sala e origem da movimentacao;
- limitar dados pessoais de ocupacoes conforme perfil;
- registrar eventos de sincronizacao sem HTML bruto, cookies ou segredos.

Entrega:

- Security Rules atualizadas se necessario;
- eventos auditaveis revisados.

Progresso atual:

- Security Rules publicadas com validacao de formato e ator para retiradas,
  devolucoes, locks e ocorrencias;
- criacao direta de movimento aceita somente o estado `retirada`;
- devolucao exige atualizacao de uma retirada aberta pelo operador autenticado;
- lock nao pode ser substituido por uma segunda retirada concorrente.

Criterio de parada:

- usuario publico segue somente leitura;
- portaria/admin escrevem apenas o que corresponde ao perfil.

## Fase 8: migracao e compatibilidade

Objetivo: trocar o motor interno sem quebrar a aplicacao publicada.

Status: em implementacao. O backend grava `reservations` e `occupancies` em
paralelo, e a disponibilidade operacional do backend e da PWA usa `occupancies`.
`reservations` permanece apenas na area administrativa e como compatibilidade
transitoria do backend.

Atividades:

- popular `occupancies` em paralelo com `reservations`;
- comparar resultados entre colecoes;
- validar a leitura da PWA contra a copia sincronizada de `occupancies`;
- manter `reservations` somente para diagnostico administrativo durante a
  transicao;
- remover compatibilidades antigas somente apos validacao do Firestore.

Entrega:

- Firestore com ocupacoes normalizadas;
- PWA consumindo a projecao nova.

Criterio de parada:

- reservas atuais continuam aparecendo;
- aulas nativas aparecem quando a fonte estiver integrada;
- nenhuma duplicidade operacional visivel para a portaria.

## Fase 9: validacao real

Objetivo: provar que a regra funciona com dados reais do SUAP.

Checklist oficial: [docs/checklist-validacao.md](checklist-validacao.md).

Atividades:

- testar uma sala sem ocupacao;
- testar uma sala antes de ocupacao futura;
- testar uma sala durante ocupacao ativa;
- testar uma sala depois do horario final;
- testar retirada avulsa com uma chave;
- testar retirada avulsa em lote;
- testar devolucao;
- validar uma execucao continua de reservas em dois ou mais ciclos de 15
  minutos;
- validar uma sincronizacao manual/eventual de salas;
- comparar Firestore, PWA e tela visual do SUAP.

Entrega:

- checklist de validacao preenchido;
- ajustes finais documentados.

Criterio de parada:

- comportamento aprovado em desktop e mobile;
- sem divergencia relevante entre SUAP sincronizado e PWA.

Progresso em 29/07/2026: dois ciclos continuos consecutivos do worker foram
observados sem falhas, ambos visitando 34 salas e persistindo 104 ocupacoes de
agenda e 20 reservas. A validacao autenticada da PWA continua pendente.

## Ordem recomendada

1. Aprovar este plano.
2. Implementar modelo `occupancies` e testes. Concluido para backend.
3. Ajustar scraping de reservas com IDs estaveis. Concluido para relatorio
   atual.
4. Ajustar regras cronologicas de disponibilidade. Concluido no backend.
5. Integrar aulas nativas.
6. Ajustar PWA para consumo direto de ocupacoes. Em implementacao.
7. Validar Firestore, regras, build e deploy.

## Pontos de atencao

- Aulas nativas podem exigir fonte diferente do relatorio comum.
- Coletar agenda por sala para todas as salas pode pesar no SUAP; deve ser
  fallback com limite de frequencia.
- O intervalo de 15 minutos deve ser configuravel; se o SUAP ficar lento ou
  instavel, o worker deve aplicar backoff e preservar a ultima copia confiavel.
- Mudancas no HTML do SUAP podem quebrar parser.
- Falha de sincronizacao nunca deve liberar uma chave por conta propria.
- Retirada avulsa precisa considerar previsao de retorno para evitar conflito
  com ocupacao futura.
