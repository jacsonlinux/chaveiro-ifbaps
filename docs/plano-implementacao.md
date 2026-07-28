# Plano de Implementacao

Plano atualizado para o sistema complementar de controle de chaves do IFBA
Campus Porto Seguro.

## Objetivo aprovado

Construir uma PWA Angular minimalista para a portaria, hospedada no Firebase
Hosting e alimentada diretamente pelo Firestore. Um backend worker mantem no
Firestore uma copia read-only das reservas futuras obtidas por scraping
autorizado do SUAP. A PWA relaciona reservas, salas e chaves fisicas para
controlar retiradas e devolucoes.

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

Responsabilidades:

- Firebase Authentication: autenticar operadores da PWA.
- Backend worker: autenticar no SUAP, executar scraping, normalizar os dados e
  escrever a copia sincronizada no Firestore. Nao e uma API de negocio da PWA.
- Firestore Security Rules: proteger leituras e escritas da PWA conforme o
  usuario autenticado e seu perfil.
- Firestore: persistir reservas sincronizadas, catalogo e historico operacional.
- SUAP: permanecer como fonte oficial e imutavel das reservas.
- PWA: autenticar no Firebase Authentication, ler o snapshot do Firestore e
  registrar retiradas, devolucoes e ocorrencias diretamente no Firestore. Nao
  acessar SUAP nem disparar scraping.

## Estado atual

```text
Backend worker/scraping: implementado dentro do processo atual
Stores Firestore: implementados para reservas, catalogo e movimentos
Scraping Playwright: ativo na VM em modo web-readonly, com janela futura
Cache/sync: ativos; a ultima sincronizacao validada persistiu 20 reservas sem falhas
Firebase Authentication: implementado no backend e na PWA, aguardando validacao
interativa do provedor Google no navegador
PWA Angular: migrada para Firebase Web SDK/Firestore direto, com regras
publicadas; validacao autenticada de operacoes ainda pendente
Angular Material: integrado na tela de login e nas acoes principais da operacao
Skill de UX da portaria: criada
Deploy PWA: https://keychain-ifbaps.web.app
API Node publica: nao faz parte da arquitetura alvo e nao deve ser publicada
para consumo da PWA
Progresso tecnico revisado: migracao autorizada, implementada e publicada; faltam
validacoes autenticadas e cobertura operacional completa
```

## Fases

| Fase | Status | Resultado esperado |
| --- | --- | --- |
| 1. Limpeza arquitetural | Concluida | Fronteiras entre SUAP, backend, Firestore e PWA definidas |
| 2. Autenticacao da PWA | Parcial | Firebase Auth, perfil portaria e regras publicadas; login real pendente |
| 3. Contratos e persistencia | Parcial | Firestore e acesso direto do Angular implementados; regras/indices em validacao |
| 4. Scraping read-only | Parcial | Fonte futura, paginação e parser implementados; cobertura ampliada pendente |
| 5. Sincronizacao | Parcial | Scheduler, cache, upsert, eventos e lote Firestore ativos |
| 6. Regras sala-chave | Parcial | Relacionar reserva a sala e chave fisica sem dados ficticios em producao |
| 7. PWA da portaria | Parcial | Firebase SDK direto publicado; operacoes autenticadas pendentes |
| 8. Operacao e deploy | Parcial | Hosting e regras publicados; smoke E2E autenticado pendente |

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

Progresso: Firebase Web SDK, login Google, Security Rules e o perfil da única
conta autorizada foram publicados com `portaria` e `admin`, conforme a
configuração administrativa existente. A conta de teste autenticada leu o
perfil com status 200; falta validar o popup Google manualmente no navegador.

## Fase 3: dados e acesso direto ao Firestore

Colecoes principais:

```text
rooms
keys
key_room_links
reservations
key_movements
key_locks
key_occurrences
users
reservation_sync_events
sync_status/current
```

Regras:

- `reservations` e uma copia read-only do SUAP.
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
de índices foram implementados.
No projeto real existem 20 reservas e 1 perfil; leituras autorizadas retornaram
200 e escritas indevidas de sala/reserva retornaram 403. Falta validar
transações com um catálogo físico real.

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
conta institucional autorizada, janela futura e nenhuma URL fixa de sala.

## Fase 5: cache e sincronizacao

- Firestore e a fonte persistente da copia estruturada.
- Cache em memoria serve respostas rapidas e tem TTL curto.
- Scheduler deve sincronizar em intervalo de 5 a 15 minutos, conforme validacao
  operacional.
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
existem, incluindo o diagnostico persistido em `sync_status/current`. A VM foi
validada com uma sincronizacao real de 20 reservas, zero
falhas e janela futura. A leitura operacional foi ajustada para nunca iniciar
scraping quando o cache estiver vazio. Falta separar definitivamente o worker
de scraping do servidor HTTP e validar paginação com volume maior.

Auditoria do Firestore em 28/07/2026: `20` reservas, `11` eventos de sync,
`1` perfil autorizado e `0` falhas no ultimo status persistido. As colecoes
fisicas `rooms`, `keys` e `key_room_links` continuam vazias, sem dados
inventados; o ultimo status registrou `20` reservas sincronizadas.

## Fase 6: relacao reserva, sala e chave

- A sala e a unidade de integracao entre SUAP e chave fisica.
- Reservas sincronizadas podem bloquear uma chave vinculada na janela definida.
- A janela começa 30 minutos antes do inicio e termina no fim da reserva.
- A PWA exibe ao perfil `portaria` o responsavel, a sala, a data e o horario;
  a entrega fisica continua sendo uma decisao operacional do porteiro.
- Uma entrega durante a janela de bloqueio exige confirmacao explicita na PWA e
  fica vinculada ao `externalId` da reserva; estados fisicos indisponiveis
  continuam recusando novas retiradas.
- O catalogo provisoriamente derivado serve apenas para testes.
- Em producao, salas e chaves devem estar cadastradas e vinculadas no catalogo
  Firestore.
- A tela deve indicar conflito ou reserva desatualizada sem ocultar o estado
  fisico da chave.

Progresso: regra de bloqueio e catalogo local existem. As coleções reais
`rooms`, `keys` e `key_room_links` ainda estão vazias; a conta autorizada agora
tem perfil administrativo para cadastrar todas as salas, chaves físicas e
vínculos. Nenhum dado fictício foi criado.

O roteiro operacional para esse cadastro esta em
`docs/catalogo-fisico.md`.

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
via Firebase/Firestore real. Faltam o login Google manual, dados físicos reais,
transações de retirada/
devolução e a revisão responsiva das telas autenticadas. A tela pública foi
verificada em desktop (1440x900) e mobile (390x844), sem overflow horizontal ou
sobreposição. O estado vazio agora identifica
explicitamente catálogo não configurado e encaminha administradores para o
cadastro.

O popup do provedor Google tambem foi iniciado em navegador limpo no Hosting,
com abertura correta no dominio Firebase e sem erro de pagina. A autenticacao
da conta autorizada continua pendente de confirmacao manual, sem automatizar ou
expor credenciais.

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
headless não encontrou erros de página e o healthcheck confirmou o worker online
com provider `web-readonly`, Firestore e scheduler ativo. O lock atomico tambem
foi testado com criacao/remoção `200`. A PWA não depende de URL HTTPS de API;
falta o smoke test manual do login Google e a validação de movimentação após o
cadastro físico.

## Bloqueios e decisoes pendentes

- Confirmar no navegador o login Google da PWA e o acesso da conta autorizada.
- Confirmar que o provedor Google esta habilitado no Firebase.
- Validar no navegador as Security Rules e o fluxo Google por perfil.
- Cadastrar salas e chaves fisicas e seus vinculos pela área administrativa.
- Definir janela e frequencia final da sincronizacao.
- Formalizar politica de exibicao de dados pessoais.
