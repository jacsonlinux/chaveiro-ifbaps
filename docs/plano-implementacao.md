# Plano de Implementacao

Plano atualizado para o sistema complementar de controle de chaves do IFBA
Campus Porto Seguro.

Escopo atual: somente Campus Porto Seguro (`PS` no SUAP, `campus=27` nos
filtros ja mapeados). Outros campi exigem decisao e configuracao especificas.

## Objetivo aprovado

Construir uma PWA Angular minimalista para a portaria, hospedada no Firebase
Hosting e alimentada diretamente pelo Firestore. Um backend worker mantem no
Firestore uma copia read-only de salas, aulas nativas e reservas futuras obtidas
por scraping autorizado do SUAP. A PWA relaciona ocupacoes programadas, salas e
chaves fisicas para controlar retiradas e devolucoes.

O SUAP continua sendo o sistema oficial de reservas. Servidores, alunos e
demais usuarios continuam solicitando, deferindo e acompanhando reservas no
SUAP. O nosso sistema nao cria, altera, cancela ou aprova reservas.

## Arquitetura definitiva

```text
SUAP oficial
  -> backend Playwright read-only
  -> normalizacao e deduplicacao
  -> cache em memoria do worker
  -> Firestore (copia estruturada e dados operacionais)
  -> PWA Angular no Firebase Hosting
  -> retirada e devolucao de chaves
```

Os fluxos visuais oficiais ficam em [diagramas.md](diagramas.md) e devem ser
atualizados junto com qualquer mudanca de regra, colecao, integracao ou perfil.

Responsabilidades:

- Firebase Authentication: autenticar operadores da PWA.
- Backend worker: autenticar no SUAP, executar scraping, normalizar os dados e
  escrever a copia sincronizada no Firestore. Nao e uma API de negocio da PWA.
- Firestore Security Rules: proteger leituras e escritas da PWA conforme o
  usuario autenticado e seu perfil.
- Firestore: persistir reservas sincronizadas, salas agendaveis, projecao de
  chaves e historico operacional.
- SUAP: permanecer como fonte oficial e imutavel das reservas.
- PWA: autenticar no Firebase Authentication, ler o snapshot do Firestore e
  registrar retiradas, devolucoes e ocorrencias diretamente no Firestore. Nao
  acessar SUAP nem disparar scraping.

## Estado atual

```text
Backend worker/scraping de reservas: implementado em processo PM2 separado
Leitura de salas agendaveis: implementada; primeira sincronizacao retornou 34 salas
Stores Firestore: implementados para reservas, projecao operacional e movimentos
Scraping Playwright: ativo na VM em modo web-readonly, com janela futura
Cache/sync: ativos; a ultima sincronizacao validada persistiu 20 reservas sem falhas
Firebase Authentication: implementado no backend e na PWA; login Google validado
manualmente com as contas autorizadas
PWA Angular: migrada para Firebase Web SDK/Firestore direto, com regras
publicadas; validacao autenticada de operacoes ainda pendente
Angular Material: integrado na tela de login e nas acoes principais da operacao
Skill de UX da portaria: criada
Deploy PWA: https://keychain-ifbaps.web.app
API Node publica: nao faz parte da arquitetura alvo e nao deve ser publicada
para consumo da PWA
Progresso tecnico revisado: scraping de reservas e salas, projecao Firestore e
operacao da PWA validados. A proxima etapa planejada e a refatoracao para
ocupacoes cronologicas (`occupancies`) e inclusao de aulas nativas.
```

## Fases

| Fase | Status | Resultado esperado |
| --- | --- | --- |
| 1. Limpeza arquitetural | Concluida | Fronteiras entre SUAP, backend, Firestore e PWA definidas |
| 2. Autenticacao da PWA | Concluida | Firebase Auth, perfis portaria/admin e regras publicadas; login e movimentos testados |
| 3. Contratos e persistencia | Concluida | Firestore, acesso direto do Angular e regras de leitura/escrita publicados |
| 4. Scraping read-only | Concluida | Reservas e listagem paginada de salas implementadas com Playwright read-only |
| 5. Sincronizacao | Concluida | Scheduler, cache, upsert, eventos, projeção atual e lote Firestore ativos |
| 6. Regras sala-chave | Concluida | Projeção usa todas as salas agendáveis retornadas pelo SUAP |
| 7. PWA da portaria | Concluida | Login, operação, retirada e devolução publicados e testados |
| 8. Operacao e deploy | Concluida | Hosting, Rules, backend e worker publicados e validados |

## Fase 1: limpeza arquitetural

- Manter o SUAP fora do fluxo de usuarios da PWA.
- Manter credenciais SUAP somente no backend e fora do repositorio.
- Nao criar uma API propria para servir a PWA.
- Usar `keychain-ux-portaria-minimal` para orientar as telas operacionais.
- Manter o provider de reservas substituivel por API oficial no futuro.
- Remover ou deixar explicitamente legado o fluxo OAuth/SUAP de login da PWA.

Progresso: fronteiras registradas na arquitetura, fluxo legado SUAP isolado do
login da PWA e skill de UX criada.

## Fase 2: autenticacao Firebase

- Usar Firebase Authentication com provedor Google.
- Aceitar inicialmente somente `AUTH_ALLOWED_EMAILS`.
- Exigir e-mail verificado.
- Atribuir `portaria` por `AUTH_DEFAULT_ROLES`; manter `admin` controlado.
- Persistir usuario e ultimo login no Firestore.
- Fazer a autorizacao efetiva das leituras e escritas pela Security Rules do
  Firestore, sem confiar em campos editaveis no cliente.

Progresso: Firebase Web SDK, login Google, Security Rules e os dois perfis
autorizados foram publicados. Os logins e os fluxos de retirada/devolucao foram
testados manualmente.

## Fase 3: dados e acesso direto ao Firestore

Colecoes principais:

```text
rooms
keys
key_room_links
reservations
occupancies
key_movements
key_locks
key_occurrences
users
reservation_sync_events
sync_status/current
```

Regras:

- `reservations` e a copia read-only atual das reservas do SUAP.
- `occupancies` e a colecao alvo para unificar aulas nativas e reservas
  confirmadas, mantendo `reservations` apenas como compatibilidade durante a
  transicao.
- `key_room_links` relaciona a chave fisica a uma sala local.
- O estado efetivo da chave combina estado local, retirada aberta e reserva
  bloqueadora.
- `key_locks` garante atomicidade para impedir duas retiradas simultaneas da
  mesma chave no cliente Firestore.
- O frontend consulta e grava somente documentos do Firestore por meio do SDK
  Firebase; nao existe API propria de negocio no caminho da PWA.
- Dados pessoais de reservas sao limitados por Security Rules e pelo modelo de
  dados publicado para cada perfil.

Progresso: stores do backend continuam alimentando o Firestore; serviço de dados
do Angular, documentos, regras, bloqueio atomico por `key_locks` e configuração
de índices foram implementados. A refatoracao cronologica foi iniciada no
backend: reservas sincronizadas tambem passam a ser projetadas em
`occupancies`, preparando a unificacao futura com aulas nativas. A estabilizacao
do catalogo de salas tambem foi iniciada: o backend preserva codigo operacional,
campus/predio, `active`, `schedulable`, `scheduleUrl` e ordenacao natural. A
raspagem de reservas agora preserva o link `Visualizar`, `requestExternalId` e
usa identificador mais estavel por solicitacao/data quando o SUAP disponibiliza
esse link.
Na validacao real registrada, reservas, salas e chaves foram sincronizadas no
Firestore; leituras autorizadas retornaram 200 e escritas indevidas de
sala/reserva retornaram 403. As transacoes de retirada e devolucao foram
testadas.

Documentacao: `docs/diagramas.md` passa a ser a referencia oficial para os
fluxos de arquitetura, sincronizacao, retirada/devolucao, autenticacao,
Firestore, estados e notificacoes. O requisito de bloqueio 30 minutos antes foi
registrado como decisao pendente porque conflita com a regra cronologica atual.

## Fase 4: scraping read-only do SUAP

- Usar `/comum/sala/reservasala_relat/` como fonte geral.
- Gerar `data_inicio` sempre com a data atual em `America/Sao_Paulo`.
- Consultar somente a janela futura configurada.
- Percorrer todas as paginas do relatorio.
- Coletar apenas campos necessarios para a operacao.
- Nunca enviar formularios de reserva nem alterar o SUAP.
- Nao manter lista fixa de salas A06, C02 ou qualquer outro exemplo.
- Usar conta institucional/t tecnica autorizada, nao senha pessoal sem
  autorizacao formal.

Progresso: cliente Playwright, parser, normalizacao e testes com fixtures
sanitizadas existem. A VM usa `SUAP_RESERVATION_PROVIDER=web-readonly`, com
conta institucional autorizada, janela futura e nenhuma URL fixa de sala. A
listagem administrativa de salas ja foi adicionada como segunda leitura
read-only e validada com 34 salas retornadas.

## Fase 5: cache e sincronizacao

- Firestore e a fonte persistente da copia estruturada.
- Cache em memoria serve respostas rapidas e tem TTL curto.
- Scheduler de reservas/ocupacoes deve sincronizar continuamente, inicialmente
  a cada 15 minutos, com intervalo configuravel conforme validacao operacional.
- Salas/chaves agendaveis devem sincronizar na configuracao inicial, por acao
  manual e em rotina eventual de intervalo maior.
- Essa sincronizacao tambem deve atualizar as opcoes administrativas da sala no
  SUAP, como ativa, agendavel e link `Solicitar/Ver Reservas`, pois essas
  opcoes podem mudar ao longo do tempo.
- Aulas nativas devem ter frequencia propria, definida depois da fonte SUAP ser
  confirmada.
- Falhas nao devem apagar ou liberar chaves automaticamente.
- Novo registro: `externalId` ou fingerprint ainda nao visto.
- Alteracao: mesmo identificador com fingerprint diferente.
- Ausencia: `suspect_absent` primeiro; `absent` somente apos confirmacoes.
- Cancelamento so deve ser marcado quando o SUAP fornecer evidencia explicita;
  ausencia nao equivale automaticamente a cancelamento.
- Gravar eventos com contadores e erro sanitizado.
- Publicar o estado atual do scheduler em `sync_status/current` para consulta
  administrativa na PWA, sem expor credenciais, cookies ou HTML do SUAP.
- Dividir batches Firestore para respeitar o limite de operacoes.

Progresso: store, TTL, eventos, scheduler, backoff e batches fragmentados
existem, incluindo o diagnostico persistido em `sync_status/current`. O
scraping agora roda em processo PM2 separado do servidor HTTP. A VM foi
validada com uma sincronizacao real de 20 reservas, zero
falhas e janela futura. A leitura operacional foi ajustada para nunca iniciar
scraping quando o cache estiver vazio. Falta validar paginação com volume maior.

Auditoria historica do Firestore em 28/07/2026: `20` reservas, `51` eventos de
sync, `2` salas, `2` chaves, `2` vinculos e `0` falhas no ultimo status
persistido naquele momento. Depois disso, a leitura administrativa de salas foi
validada com 34 salas e passou a ampliar a cobertura para salas sem reserva
futura.

## Fase 6: relacao reserva, sala e chave

- A sala e a unidade de integracao entre SUAP e chave fisica.
- Aulas nativas e reservas sincronizadas podem bloquear uma chave vinculada
  somente durante o intervalo cronologico da ocupacao.
- O bloqueio começa no horario de inicio e termina no horario final da aula ou
  reserva, considerando `startsAt <= agora < endsAt`.
- A PWA exibe ao perfil `portaria` o responsavel, a sala, a data e o horario;
  a entrega fisica continua sendo uma decisao operacional do porteiro.
- Uma entrega durante o intervalo de bloqueio fica vinculada ao `externalId` da
  reserva ou ocupacao exibida; estados fisicos indisponiveis continuam recusando
  novas retiradas.
- Salas agendaveis sao lidas da listagem administrativa do SUAP; chaves e
  vinculos continuam sendo projetados pelo worker. Nao existe cadastro na PWA.
- A tela deve indicar conflito ou reserva desatualizada sem ocultar o estado
  fisico da chave.

Progresso: regra de bloqueio cronologico e projecao automatica existem. A
origem dos dados de sala e reserva permanece o SUAP; nenhum dado deve ser criado
manualmente na PWA. O backend ja projeta reservas em `occupancies`; falta
evoluir a leitura operacional para essa colecao como fonte principal e integrar
aulas nativas.

## Fase 7: PWA da portaria

Tela principal:

- lista ou tabela responsiva de sala e chave;
- status disponivel, reservada, retirada, atrasada, manutencao, perdida ou
  danificada;
- responsavel e horario quando retirada;
- previsao de devolucao;
- reserva bloqueadora quando aplicavel;
- busca por sala/codigo;
- filtros de status;
- acao direta de retirar, devolver e abrir detalhe.

Detalhes e historico ficam em drawer/dialog e area secundaria. A portaria nao
deve navegar por varias paginas para uma retirada normal.

Progresso: login Firebase, cartão de login, ações Angular Material e Firebase
SDK/Firestore direto foram integrados. A PWA publicada passou smoke test visual
em navegador limpo, sem erros de pagina, e a leitura autenticada foi validada
via Firebase/Firestore real. Login Google, retirada e devolução foram testados.
A tela pública foi
verificada em desktop (1440x900) e mobile (390x844), sem overflow horizontal ou
sobreposição. O estado vazio agora identifica
explicitamente a ausência de dados na sincronização, sem encaminhar para
cadastro.

O popup do provedor Google foi iniciado no Hosting, com abertura correta no
dominio Firebase e sem erro de pagina. As duas contas autorizadas foram
validadas manualmente, sem automatizar ou expor credenciais.

## Fase 8: operacao e deploy

- Confirmar provedor Google no Firebase Authentication.
- Manter o worker de scraping na VM com secrets montados fora da imagem; ele nao
  precisa de URL publica para a PWA.
- Manter e validar Security Rules e indices do Firestore.
- Configurar runtime public da PWA sem segredos.
- Manter scraping somente com a conta institucional autorizada já confirmada.
- Ativar PM2 e scheduler apos smoke test.
- Testar login, lista de chaves, retirada, devolucao, reserva bloqueadora e
  falha de sincronizacao.
- Publicar somente depois de `npm run check`, build Angular, higiene de segredos
  e `git diff --check`.

Progresso: build Angular, deploy do Hosting e publicação das Security Rules foram
validados. Em 28/07/2026, o site público respondeu `HTTP 200`, o smoke test
headless não encontrou erros de página e o healthcheck confirmou backend e worker
online com provider `web-readonly`, Firestore e scheduler ativo. O lock atômico,
login Google, retirada e devolução foram testados.

## Bloqueios e decisoes pendentes

- Monitorar a cobertura da listagem de salas e tratar mudanças de layout do SUAP.
- Monitorar IDs estáveis, deduplicação e alterações de layout do SUAP.
- Definir cadencia final por fonte de sincronizacao.
- Formalizar politica de exibicao de dados pessoais.
