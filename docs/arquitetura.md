# Arquitetura Inicial

Documento de orientacao tecnica para o Sistema Web de Controle de Chaves do
IFBA Campus Porto Seguro.

> **Decisao arquitetural atualizada:** a arquitetura alvo nao possui API propria
> para a PWA. O backend atua como worker de scraping/sincronizacao e escreve no
> Firestore; o Angular le e grava o Firestore diretamente com Firebase SDK e
> Security Rules. O servidor HTTP existente e apenas uma implementacao
> transitoria e nao deve ser ampliado antes da migracao autorizada.

## 1. Contexto

Hoje o controle de chaves da portaria e manual. O objetivo do sistema e
digitalizar a retirada, devolucao, disponibilidade, ocorrencias e historico das
chaves.

O SUAP deve continuar sendo a fonte oficial para reserva de salas e ambientes.
O sistema de chaves deve complementar o SUAP, cuidando da operacao fisica da
chave.

## 2. Caminhos e estrutura

O workspace atual usado nesta fase inicial e:

```text
/opt/keychain-ifbaps
```

Estrutura alvo recomendada para o projeto:

```text
/opt/keychain-ifbaps
|-- backend/
|   |-- src/
|   |-- package.json
|   |-- tsconfig.json
|   |-- ecosystem.config.cjs
|   `-- README.md
|-- frontend/
|   |-- src/
|   |-- angular.json
|   |-- package.json
|   |-- tsconfig.json
|   |-- firebase.json
|   `-- README.md
|-- docs/
|   `-- arquitetura.md
|-- scripts/
|   |-- backend-restart.sh
|   `-- frontend-deploy.sh
|-- README.md
|-- AGENTS.md
`-- .gitignore
```

Nao criar pastas `dev/`, `production/` ou `deploy/` dentro do repositorio neste
momento. Para este projeto, a separacao de ambiente deve ser feita por
configuracao, variaveis de ambiente, PM2 e processo de publicacao do frontend.

Arquivos sensiveis estao fora do repositorio:

```text
/etc/keychain-ifbaps/.env
/etc/keychain-ifbaps/keychain-ifbaps-firebase-adminsdk-fbsvc-9a18ddb436.json
```

Regras:

- Nao versionar credenciais reais.
- Nao copiar arquivos sensiveis para o repositorio.
- Nao imprimir valores secretos em logs, testes ou respostas.
- Criar apenas exemplos sem valores reais, como `.env.example`, se necessario.

## 3. Separacao de responsabilidades

```text
SUAP web read-only
  -> Backend worker Node.js/TypeScript na VM via PM2
  -> Firestore/Firebase
  -> Angular PWA no Firebase Hosting
```

### Frontend

Responsavel por:

- Interface web responsiva.
- Experiencia PWA.
- Telas de consulta.
- Telas operacionais da portaria.
- Leitura e escrita dos dados operacionais pelo Firebase Web SDK.
- Build estatico publicado no Firebase Hosting.

O frontend nao deve guardar segredos nem implementar sozinho regras criticas de
permissao, retirada, devolucao ou bloqueio por reserva.

### Backend

Responsavel por:

- Autenticacao web do SUAP para a conta autorizada.
- Coleta, normalizacao, cache e persistencia de reservas externas.
- Escrita da sincronizacao no Firestore com Firebase Admin SDK.
- Registro de eventos e falhas da sincronizacao.
- Execucao na VM gerenciada por PM2.

As regras de acesso da PWA ficam nas Firestore Security Rules. As operacoes de
retirada, devolucao e ocorrencia sao gravadas pelo Firebase Web SDK em
documentos protegidos por essas regras e, quando necessario, por transacoes do
Firestore. Salas, chaves e vinculos sao escritos exclusivamente pelo worker,
como projecao derivada do SUAP; a PWA somente le esses documentos.

## 4. Execucao e publicacao

### Worker de sincronizacao na VM com PM2

O backend deve rodar na VM do projeto, gerenciado por PM2.

Responsabilidades operacionais:

- Ler configuracoes privadas em `/etc/keychain-ifbaps`.
- Usar service account do Firebase Admin SDK apenas no backend.
- Executar o worker de scraping e sincronizacao sem depender de acesso publico.
- Escrever no Firestore com Firebase Admin SDK.
- Manter logs operacionais sem imprimir segredos.
- Ter configuracao PM2 em `backend/ecosystem.config.cjs`.

Operacao inicial:

- `npm run pm2:reload` compila o backend, inicia ou recarrega o processo
  `keychain-ifbaps-backend` pelo PM2 e executa health check.
- `npm run pm2:status` mostra o processo PM2 e executa health check.
- `npm run healthcheck` consulta `GET /health` e imprime somente configuracao
  nao sensivel.
- A configuracao PM2 deve conter apenas `EXTERNAL_ENV_PATH`; porta, credenciais,
  tokens e service account ficam fora do repositorio em `/etc/keychain-ifbaps`.

Base inicial implementada (camada transitoria, nao arquitetura alvo da PWA):

- Servidor HTTP Node.js/TypeScript em `backend/`.
- `GET /health` com status e configuracao nao sensivel.
- `GET /api/reservations` usando provider de reservas ativo.
- `POST /api/reservations/sync` para sincronizacao manual do provider ativo.
- `GET /api/key-catalog` e endpoints legados de catalogo permanecem apenas como
  camada interna/transitoria; nao sao consumidos pela PWA e nao autorizam
  cadastro de salas ou chaves no frontend.
- `GET /api/keys/availability` usando a projecao derivada das reservas
  sincronizadas, com calculo da janela de bloqueio.
- `GET /api/key-movements`, `POST /api/key-movements/withdrawals` e
  `POST /api/key-movements/returns` para historico inicial de retirada e
  devolucao de chaves com store `memory|firestore`.
- `GET /api/key-movements` aceita filtros por chave, sala, status e periodo de
  retirada ou devolucao (`dateField`, `from`/`to`) para consulta operacional de
  historico.
- `GET /api/key-occurrences` e `POST /api/key-occurrences` para ocorrencias e
  ajustes auditaveis de estado de chave com store `memory|firestore`.
- `GET /api/key-occurrences` aceita filtros por chave, sala, tipo e periodo da
  ocorrencia (`from`/`to`) para auditoria operacional.
- `GET /api/reports/operations` resume retiradas, devolucoes, atrasos atuais e
  ocorrencias por periodo para portaria/admin.
- Carregamento de configuracao externa em `/etc/keychain-ifbaps/.env`.
- `backend/.env.example` somente com nomes e placeholders.

### Frontend no Firebase Hosting

O frontend Angular deve ser compilado como aplicacao estatica e publicado no
Firebase Hosting. A URL publica atual da PWA e
`https://keychain-ifbaps.web.app`.

Responsabilidades operacionais:

- Manter `frontend/firebase.json` com configuracao do hosting.
- Nao armazenar segredos administrativos no bundle.
- Usar somente configuracao publica do Firebase Authentication/Firestore.
- Assinar em tempo real as colecoes operacionais do Firestore necessarias para
  disponibilidade de chaves, reservas e movimentacoes. Assim, uma retirada ou
  devolucao registrada pela portaria deve refletir nas demais telas abertas,
  inclusive na consulta publica autenticada, sem refresh manual.

Base inicial implementada/transitoria:

- Aplicacao Angular em `frontend/`, com Angular Material para componentes
  operacionais consistentes e acessiveis.
- URL publica definida no Firebase Hosting:
  `https://keychain-ifbaps.web.app`.
- Tela operacional da portaria com disponibilidade de chaves, retiradas
  abertas/atrasadas, ocorrencias recentes e formularios de retirada, devolucao e
  ocorrencia.
- Painel de detalhe da chave selecionada para portaria/admin, mostrando status,
  salas vinculadas, reserva bloqueadora e alerta de reserva `suspect_absent`
  quando existir.
- Areas por perfil para operacao, reservas normalizadas, movimentacoes,
  ocorrencias e administracao de usuarios/sincronizacao.
- Historico filtrado de movimentacoes para portaria/admin, com periodo de
  retirada ou devolucao, chave, sala e status.
- Historico filtrado de ocorrencias para portaria/admin, com periodo, chave,
  sala e tipo.
- Area `Relatorios` para portaria/admin, consumindo o resumo operacional do
  backend.
- Area `Reservas` com resumo de estados das reservas, sinalizacao segura de
  sincronizacao e ultimos eventos de sync para administradores.
- Login iniciado pelo Firebase Authentication e estado consultado por
  `GET /auth/session` com ID token no cabecalho `Authorization`.
- Painel administrativo de usuarios com ajuste de perfis e filtros por texto e
  papel (`usuario`, `portaria`, `admin`) aplicados tambem em `GET /api/users`.
- Acao administrativa na PWA para limpar sessoes expiradas por meio do backend.
- Catalogo administrativo com busca por texto e filtro por estado para salas,
  chaves e vinculos.
- Configuracao publica do Firebase por `public/runtime-config.js`, manifest PWA,
  service worker Angular e `firebase.json` para hosting estatico. A chamada da
  API Node existente e transitoria e sera removida na migracao aprovada.
- O frontend nao contem segredos; `client_secret`, service account, senha SUAP e
  tokens permanecem no backend/runtime externo.

## 5. Stack prevista

Worker backend:

- Node.js.
- TypeScript.
- Firebase Admin SDK.
- Firestore.

Frontend:

- Angular.
- TypeScript.
- Angular Material ou biblioteca equivalente.
- PWA.
- Angular Service Worker quando aplicavel.

Infraestrutura:

- Firebase Firestore.
- Firebase Hosting, se adequado ao deploy.
- Firebase Authentication, se adequado ao modelo de login.
- Firebase Cloud Messaging apenas se notificacoes push forem priorizadas.

## 6. Perfis de acesso

### Usuario autenticado

Pode consultar somente a situacao atual das chaves pela PWA publica: disponivel
na portaria ou retirada por uma pessoa responsavel. Esse perfil nao pode
registrar retirada, devolucao, ocorrencia, alterar perfis, consultar diagnostico
de sincronizacao ou acessar dados operacionais restritos. A consulta publica usa
Firebase Authentication e Firestore Security Rules; nao acessa SUAP, service
account, cookies ou qualquer segredo.

### Portaria

Pode:

- Visualizar chaves.
- Registrar retirada.
- Registrar retirada avulsa individual ou em lote, vinculando varias chaves
  disponiveis a mesma pessoa em uma unica operacao da interface.
- Registrar devolucao.
- Consultar historico operacional.
- Registrar ocorrencias.
- Identificar chaves atrasadas, perdidas ou danificadas.
- Ver reservas relacionadas, quando houver integracao com SUAP.
- Acessar areas de movimentacoes e ocorrencias na PWA.

### Administrador

Pode gerenciar:

- Chaves.
- Ambientes.
- Vinculos sala-chave.
- Usuarios.
- Perfis e permissoes.
- Configuracoes.
- Historico.
- Area de administracao da PWA.
- Relatorios.
- Integracoes.

A autorizacao deve ser aplicada no backend, nao apenas por ocultacao visual no
frontend.

Implementacao atual:

- O backend possui `AUTH_MODE=disabled|trusted-header|session|firebase`.
- `disabled` e apenas para desenvolvimento/testes.
- `trusted-header` e uma ponte temporaria para ambiente controlado ou proxy
  confiavel e nao deve ser usado na PWA publica.
- `firebase` e o modo esperado de operacao da PWA: o frontend autentica pelo
  Firebase Authentication, envia um ID token ao backend e o Firebase Admin
  valida assinatura, projeto, expiracao e e-mail verificado.
- A consulta publica aceita usuarios Google autenticados e verificados. Escritas
  operacionais continuam restritas aos perfis `portaria` e `admin`.
- O backend atribui o perfil inicial configurado em `AUTH_DEFAULT_ROLES` e
  aplica permissoes no servidor. A interface nao consegue elevar privilegios.
- `session` permanece apenas como compatibilidade para o fluxo legado OAuth/SUAP
  e nao e o login da PWA de portaria.
- As sessoes da aplicacao podem usar `AUTH_SESSION_STORE=memory|firestore`.
  `memory` serve para desenvolvimento; `firestore` e o modo esperado na VM para
  preservar logins entre restarts e preparar execucao com mais de uma instancia.
- Sessoes expiradas sao removidas quando consultadas. Administradores tambem
  podem executar `POST /auth/sessions/cleanup` para apagar sessoes expiradas que
  nao voltaram a ser acessadas; a resposta deve expor apenas contadores.
- O primeiro acesso Firebase cria ou atualiza um usuario local da aplicacao, com
  store `memory|firestore`, registrando identidade basica, perfis atribuidos e
  horarios de primeiro/ultimo login.
- Permissoes iniciais:
  - `usuario`: consulta publica somente leitura da situacao das chaves.
  - `portaria`: consulta e movimenta chaves.
  - `admin`: acompanha sincronizacao, lista usuarios e ajusta perfis; nao
    cadastra salas, chaves ou reservas.
- Endpoints de catalogo, sincronizacao e movimentacao passam por guard de
  permissao backend quando `AUTH_MODE=trusted-header`, `session` ou `firebase`.
- `PATCH /api/users/:id/roles` permite ajuste administrativo inicial dos papeis
  `usuario`, `portaria` e `admin`. O backend preserva `usuario`, impede que um
  admin remova o proprio `admin` e mantem perfis manuais em logins SUAP
  posteriores.
- A PWA administrativa permite buscar usuarios autenticados e filtrar por papel
  antes de ajustar perfis; o backend tambem aceita `search` e `role` em
  `GET /api/users`, reduzindo trafego e erro operacional quando a lista crescer.
- A PWA administrativa nao possui cadastro de salas, chaves ou vinculos. Esses
  documentos sao somente leitura e derivados pelo worker.
- As Security Rules permitem leitura autenticada de `rooms`, `keys`,
  `key_room_links` e `key_movements` para a consulta publica. `reservations`,
  `sync_status`, `reservation_sync_events`, `key_occurrences` e escritas de
  movimentacao permanecem restritos a portaria/admin conforme a regra especifica.

## 7. Estados da chave

Estados iniciais recomendados:

```text
disponivel
bloqueada_por_reserva
retirada
atrasada
em_manutencao
perdida
danificada
```

Esses estados representam a situacao operacional atual da chave.

Os documentos derivados podem ser atualizados ou substituidos pelo worker quando
a janela futura do SUAP mudar. A PWA nao desativa, edita ou exclui esses itens.

## 8. Eventos auditaveis

Toda movimentacao importante deve gerar registro historico.

Eventos iniciais:

```text
retirada
devolucao
ocorrencia
bloqueio
liberacao
ajuste_admin
```

Cada evento deve registrar, no minimo:

- Usuario que executou a acao.
- Pessoa responsavel pela chave, quando aplicavel.
- Chave.
- Ambiente.
- Data e horario.
- Origem da acao.
- Observacao, quando aplicavel.

## 9. Integracao com SUAP

O SUAP deve ser tratado como fonte oficial das reservas de ambientes.

Situacao atual:

- Existe uma aplicacao OAuth registrada no SUAP para este projeto:
  `keychain-ifbaps`.
- O tipo da aplicacao e `confidential` com fluxo `authorization-code`.
- O `client_secret` deve ficar somente no backend, carregado de arquivo externo
  em `/etc/keychain-ifbaps`, e nunca no frontend ou no repositorio.
- O redirect URI local de desenvolvimento aponta para o callback do backend:
  `http://localhost:3000/auth/suap/callback`.
- A URL de callback de producao ainda precisa ser definida.
- A existencia da aplicacao OAuth nao confirma, por si so, endpoint ou escopo
  oficial para consultar reservas de ambientes. Ela nao e o mecanismo de login
  da PWA de portaria.

Validacao realizada:

- O fluxo OAuth com SUAP foi testado com callback temporario local em
  `http://localhost:3010/auth/suap/callback`.
- O SUAP solicitou autorizacao do usuario, retornou um `code`, o backend de
  teste trocou esse `code` por token em `/o/token/` e consultou `/api/eu/`.
- A resposta de `/api/eu/` retornou os campos institucionais esperados para o
  usuario autenticado: `identificacao`, `nome`, `email` e `campus`.
- O teste confirma apenas a viabilidade tecnica do OAuth SUAP para uma
  integracao auxiliar; ele nao define a autenticacao dos operadores da PWA.
- O fluxo OAuth legado permanece isolado em `GET /auth/suap/login` e
  `GET /auth/suap/callback` quando explicitamente habilitado, mas nao e usado
  no modo `firebase`.
- O token OAuth, quando usado, fica somente no backend e nao e enviado para a
  PWA. O login da PWA usa ID token do Firebase validado pelo backend.
- Codigos OAuth, tokens e `client_secret` sao temporarios/sensiveis e nao devem
  ser registrados em logs, documentacao ou commits.

Fluxo esperado:

```text
Usuario reserva ambiente no SUAP
        |
Backend consulta reservas autorizadas
        |
Sistema associa reserva ao ambiente local
        |
Sistema identifica a chave vinculada
        |
Portaria entrega a chave ao responsavel
        |
Sistema registra retirada e devolucao
```

Regras:

- A PWA nao deve capturar senha do SUAP nem executar login web do scraper.
- A PWA nao deve armazenar nem enviar diretamente o `client_secret` do SUAP.
- A integracao deve usar API/OAuth/token autorizado pela instituicao.
- `/api/eu/` pertence ao fluxo OAuth legado e nao e necessario para o scraping
  read-only de salas e reservas.
- Scraping ou automacao da interface web do SUAP nao devem ser primeira opcao.
- Qualquer alternativa nao oficial precisa de autorizacao institucional.
- Se a leitura automatizada da interface web for autorizada, ela deve ser
  somente leitura. O sistema de chaves nao deve criar, alterar ou cancelar
  reservas no SUAP por automacao web.

## 10. Leitura de salas e reservas do SUAP

Enquanto nao houver API REST oficial confirmada para reservas e salas, a
estrategia aceita para avaliacao tecnica e leitura controlada da interface web
do SUAP, apenas com autorizacao institucional e apenas para consulta.

Decisao atual:

- A implementacao deve avancar com `SuapWebReadOnlyReservationProvider` como
  estrategia inicial para reservas, mantendo `SuapApiReservationProvider`
  previsto para substituicao futura quando houver API oficial.
- A proxima implementacao adicionara um leitor read-only da listagem
  administrativa de salas agendáveis do campus Porto Seguro.
- A integracao web deve ser estritamente read-only: consultar reservas, coletar
  campos necessarios, normalizar e disponibilizar ao sistema de chaves.
- Criacao, alteracao ou cancelamento de reservas no SUAP ficam fora do escopo da
  automacao.
- A conta institucional autorizada foi confirmada para a etapa de validacao;
  a formalizacao e a revisao periodica continuam sendo requisito para uso
  operacional em producao.
- O contrato de provider e a automacao web read-only ja existem no backend,
  atras de feature flag e configuracao externa.

Objetivo:

```text
SUAP reservas
  -> backend coleta dados autorizados
  -> backend normaliza salas e reservas
  -> cache rapido em memoria
  -> persistencia estruturada no Firestore
  -> PWA Angular le e grava o Firestore com Firebase Web SDK e Security Rules
```

Essa integracao deve ser implementada como provider isolado, para permitir troca
por API oficial no futuro sem refazer regras de negocio:

```text
ReservationProvider
  -> LocalReservationProvider
  -> SuapApiReservationProvider
  -> SuapWebReadOnlyReservationProvider
```

Selecao por configuracao:

```text
SUAP_RESERVATION_PROVIDER=local|api|web-readonly
```

### Autenticacao da leitura web

Preferencias, nesta ordem:

1. API oficial com OAuth e escopo autorizado.
2. Endpoint JSON interno autorizado pela DTI/SUAP.
3. Sessao web institucional autorizada, usada pelo backend somente para leitura.

Se for necessaria sessao web para raspagem, ela deve ficar confinada ao backend.
Cookies, tokens, storage state, senhas e qualquer artefato de sessao devem ficar
fora do repositorio, preferencialmente em `/etc/keychain-ifbaps`, com permissao
restrita. O frontend nao deve receber cookies ou tokens do SUAP.

Nao usar senha pessoal permanente de servidor como mecanismo estrutural sem
autorizacao formal. Se a instituicao permitir uma conta tecnica ou fluxo
delegado, essa decisao deve ser documentada antes da implementacao.

Variaveis externas esperadas para a prova de conceito read-only:

```text
SUAP_URL
SUAP_URL_LOGIN
SUAP_USERNAME
SUAP_PASSWD
SUAP_RESERVATION_PROVIDER=web-readonly
SUAP_RESERVATION_REPORT_URL
SUAP_RESERVATION_SYNC_WINDOW_DAYS
SUAP_RESERVATION_START_TIME
SUAP_RESERVATION_END_TIME
SUAP_RESERVATION_CAMPUS_ID
SUAP_RESERVATION_STATUS
```

Essas variaveis devem ficar somente em `/etc/keychain-ifbaps/.env` ou outro
arquivo externo equivalente, nunca no repositorio.

URLs iniciais identificadas para avaliacao:

- Relatorio/listagem: `/comum/sala/reservasala_relat/`.
- Salas agendáveis do campus: `/admin/comum/sala/?agendavel__exact=1&all=&predio__uo=27`.
- Pagina por sala: `/comum/sala/solicitar_reserva/<sala_id>/`.

Inferencia tecnica atual: o numero final em `solicitar_reserva/<numero>/`
parece ser o identificador interno da sala/ambiente no SUAP. O relatorio deve
ser priorizado para leitura geral se apresentar filtros e tabela de reservas; as
salas agendáveis devem ser lidas pela listagem administrativa; as paginas por
sala podem servir apenas para diagnostico controlado.

Nao deve existir lista fixa de salas no codigo ou na configuracao. A listagem
administrativa paginada deve ser percorrida para coletar todas as salas
agendáveis do campus. URLs `solicitar_reserva/<id>` nao devem ser cadastradas uma
a uma para tentar cobrir o campus; elas sao apenas apoio diagnostico quando for
necessario entender um ambiente especifico.

Exemplo de filtros observados no relatorio:

```text
data_inicio=01/07/2026
data_fim=31/07/2026
hora_inicio=07:00
hora_fim=17:00
campus=27
situacao=deferida
```

Esse exemplo serve apenas para entender a tela. Na implementacao operacional, a
janela de datas deve ser gerada pelo backend a cada sincronizacao, em vez de
manter um periodo fixo no codigo. A raspagem nao deve consultar periodos
anteriores ao dia corrente; `data_inicio` deve ser sempre a data atual na zona
`America/Sao_Paulo`, e `data_fim` deve ser calculada por janela futura
configuravel.

A listagem observada contem paginacao, com indicacao de total e links de paginas
como `1`, `2`, `3`, `4`, `...`, `24`. A automacao read-only deve percorrer todas
as paginas do resultado filtrado, respeitando intervalo, campus e situacao, e
normalizar cada linha sem salvar HTML bruto.

Base tecnica implementada:

- Cliente Playwright server-side para login web e abertura do relatorio.
- Extracao apenas de textos das celulas da tabela, sem persistir HTML bruto.
- Paginacao por link `proximo`/`próximo`.
- Cache inicial em memoria no `SuapWebReadOnlyReservationProvider`.
- `POST /api/reservations/sync` aciona a sincronizacao quando
  `SUAP_RESERVATION_PROVIDER=web-readonly` e `SUAP_WEB_READONLY_ENABLED=true`.
- `GET /api/reservations` usa o cache do provider e a copia persistida; ele nao
  inicia scraping quando a copia estiver vazia.

Campos visiveis na tabela de listagem:

- Sala.
- Solicitante.
- Instituicao do solicitante.
- Data da solicitacao.
- Situacao da solicitacao.
- Periodo.
- Previsao de publico.
- Reserva cancelada.
- Gratuito.

Formatos de periodo ja observados:

```text
03/07/2026 | Horario: 14:00 - 17:00
15:00 as 17:00 do dia 09/07/2026
```

O parser deve aceitar variacoes com acento, como `às`, e converter para
`startsAt`/`endsAt` no modelo normalizado.

### Dados coletados

Coletar apenas os campos necessarios para operacao das chaves:

- identificador externo da reserva, se existir;
- sala ou ambiente;
- campus;
- data;
- horario de inicio e fim;
- responsavel;
- finalidade ou observacao operacional, quando necessaria;
- situacao da reserva;
- data/hora da ultima sincronizacao;
- origem da coleta.

Nao persistir HTML bruto, cookies, tokens, documentos pessoais, telefones ou
dados que nao sejam necessarios ao controle da chave.

### Cache e persistencia

Recomendacao inicial:

- Firestore como fonte persistente da copia estruturada das reservas;
- cache em memoria no backend para respostas rapidas ao frontend;
- JSON local apenas para desenvolvimento, testes ou fallback temporario.

Colecao sugerida:

```text
reservations/
  {reservationId}
```

Campos minimos sugeridos:

```text
externalId
source
roomName
roomExternalId
campus
startsAt
endsAt
responsibleName
responsibleIdentifier
purpose
status
fingerprint
firstSeenAt
lastSeenAt
lastSyncedAt
deletedOrCanceledAt
rawVersion
```

Quando o SUAP nao fornecer identificador estavel, gerar `reservationId` por
fingerprint deterministico com campos estaveis, como sala, data, horario,
responsavel e finalidade normalizada.

### Sincronizacao

Politica inicial recomendada:

- sincronizacao agendada a cada 5 a 15 minutos durante horario operacional;
- sincronizacao manual para administrador/portaria em caso de divergencia;
- janela de busca limitada, por exemplo reservas de hoje ate os proximos 7 ou
  15 dias;
- a janela operacional nunca deve iniciar antes do dia corrente;
- cache com TTL curto, por exemplo 1 a 5 minutos, para evitar consulta ao SUAP
  a cada abertura de tela;
- backoff e alerta operacional quando o SUAP estiver indisponivel ou a tela
  mudar.

Estado atual: a sincronizacao web read-only ja possui cliente Playwright,
normalizacao, cache em memoria, persistencia Firestore, eventos de
sincronizacao, confirmacao de ausencias apos sincronizacoes consecutivas,
agendador interno e backoff estruturado. Ainda falta politica final de
retencao/monitoramento.

Persistencia inicial:

- `RESERVATION_STORE=memory|firestore`.
- `KEY_CATALOG_STORE=memory|firestore`.
- `KEY_MOVEMENT_STORE=memory|firestore`.
- Colecao de reservas: `reservations`.
- Colecao de eventos de sync: `reservation_sync_events`.
- Colecao de salas agendaveis projetadas: `rooms`.
- Colecoes de chaves e vinculos projetados: `keys` e `key_room_links`.
- Colecao de movimentacoes: `key_movements`.
- Colecao de bloqueios atomicos de retirada: `key_locks`.
- Upsert idempotente por `externalId`.
- Alteracao detectada por mudanca de `fingerprint`.
- Reserva que desaparece da janela de sync e marcada primeiro como
  `suspect_absent`; so passa para `absent` depois de sincronizacoes ausentes
  consecutivas configuradas por `RESERVATION_ABSENCE_CONFIRMATION_SYNCS`.
- Reserva ausente nao e tratada como cancelada automaticamente.
- `GET /api/reservations` usa cache de curto prazo e a copia persistida para
  evitar consultar o SUAP a cada abertura de tela.
- `GET /api/reservations/sync/status` expoe estado do agendador, ultimo sucesso,
  ultima falha, proxima execucao e contadores sem retornar dados pessoais.
- `GET /api/reservations/sync/events` expoe os ultimos eventos de sync para
  administradores, apenas com provider, horario, contadores e metadados seguros,
  sem reservas completas, HTML bruto, cookies ou dados pessoais.
- O agendador interno e controlado por `RESERVATION_SYNC_SCHEDULE_ENABLED` e usa
  backoff exponencial configuravel apos falhas.

Novas reservas, alteracoes e cancelamentos:

- nova reserva: `externalId` ou `fingerprint` ainda nao visto;
- alteracao: mesmo identificador com `fingerprint` diferente;
- ausencia: reserva previamente ativa deixa de aparecer em uma sincronizacao e
  vira `suspect_absent`;
- confirmacao de ausencia: a reserva continua ausente por sincronizacoes
  consecutivas suficientes e vira `absent`;
- cancelamento: a reserva aparece no SUAP com situacao cancelada;
- conflitos: reservas sobrepostas para a mesma sala devem ser preservadas e
  sinalizadas, nao descartadas silenciosamente.

Para evitar falso cancelamento por falha temporaria, uma reserva ausente em uma
sincronizacao nao deve ser imediatamente apagada. Marcar como suspeita ou
ausente e confirmar em sincronizacao posterior antes de mudar para cancelada ou
inativa.

### Consistencia e duplicidade

Regras de consistencia:

- usar upsert idempotente por `externalId` ou `fingerprint`;
- manter `firstSeenAt`, `lastSeenAt` e `lastSyncedAt`;
- preservar historico de mudancas relevantes;
- nunca depender apenas do cache em memoria para regra operacional critica;
- registrar evento de sincronizacao com contadores de criadas, atualizadas,
  inalteradas, ausentes, canceladas e com erro;
- aplicar validacao de privacidade antes de expor dados ao frontend.

Falhas de sincronizacao nao devem liberar automaticamente uma chave bloqueada
por reserva conhecida. O sistema deve usar a ultima copia confiavel e sinalizar
dados possivelmente desatualizados para portaria/admin.

### Limites da automacao web

A automacao web, se aprovada, deve ser conservadora:

- somente leitura;
- sem active scan, fuzzing ou testes agressivos;
- sem escrita no SUAP;
- sem scraping fora do escopo de reservas de salas;
- sem logs com HTML bruto, cookies, tokens ou dados sensiveis;
- com feature flag para desligamento imediato.

### Plano de implementacao

O plano de fases, progresso e pendencias de implementacao fica em
[docs/plano-implementacao.md](plano-implementacao.md).

## 11. Regra de reserva e bloqueio

Regra operacional adotada:

- Aulas nativas e reservas confirmadas do SUAP sao ocupacoes programadas do
  ambiente. Ambas podem bloquear a chave vinculada somente durante o intervalo
  cronologico da ocupacao, considerando `startsAt <= agora < endsAt`.
- Retirada avulsa nao e reserva e nao altera o SUAP. Ela e uma movimentacao
  local da portaria, permitida apenas quando a chave esta disponivel, nao tem
  retirada aberta e nao existe aula ou reserva confirmada conflitante com o uso
  solicitado.
- A PWA exibe `bloqueada_por_reserva` e o responsavel, data e horario para a
  portaria.
- Esse sinal nao e uma trava fisica nem substitui a conferencia do porteiro.
  A entrega deve ser feita somente ao responsavel confirmado no SUAP.
- Fora do intervalo real da ocupacao, retirada sem reserva pode ser registrada
  quando a chave estiver disponivel e nao houver conflito cronologico com outra
  ocupacao programada conhecida.

Casos que precisam de regra explicita:

- Chave ja retirada antes do inicio do bloqueio.
- Retirada direta com aula ou reserva futura proxima.
- Reserva cancelada no SUAP.
- Reserva alterada no SUAP.
- Reservas sobrepostas.
- Chaves mestras.
- Uma chave para varios ambientes.
- Varias chaves para um mesmo ambiente.

Recomendacao: retirada sem reserva so deve ser permitida quando nao comprometer
uma aula nativa ou reserva futura conhecida.

Implementacao inicial:

- `GET /api/keys/availability` calcula disponibilidade de chaves no backend.
- O worker projeta todas as salas agendáveis retornadas pela listagem
  administrativa paginada do campus, inclusive as que não possuem reserva
  futura. Isso não é cadastro manual e não transforma a PWA em sistema de
  reservas.
- A projeção não limita a operação a exemplos como A06 ou C02: qualquer sala
  retornada pela listagem do SUAP pode aparecer.
- As colecoes da projecao sao somente leitura para clientes Firebase; apenas o
  backend com Admin SDK pode atualiza-las.
- Aulas nativas confirmadas e reservas `active`, `changed` e `conflicted` podem
  bloquear a chave somente durante seu intervalo de inicio e fim; reservas
  `suspect_absent` nao bloqueiam, mas aparecem como alerta operacional
  sanitizado quando estao no horario de uso; reservas `canceled` e `absent` nao
  bloqueiam nem geram alerta na disponibilidade.
- A resposta geral de disponibilidade nao deve expor nome, matricula ou outro
  dado pessoal do solicitante.
- `POST /api/key-movements/withdrawals` registra retirada somente quando a
  chave existe, esta vinculada a sala informada, nao possui retirada aberta e
  esta `disponivel`. Na PWA, uma chave `bloqueada_por_reserva` pode ser
  registrada somente apos confirmacao explicita do porteiro, vinculando o
  movimento a reserva exibida; a conferencia fisica do responsavel continua
  sendo da portaria.
- `POST /api/key-movements/returns` fecha a retirada aberta da chave e volta o
  estado base da chave para `disponivel`.
- A liberacao por fim de aula ou reserva e cronologica: depois de `endsAt`, o
  bloqueio programado nao deve mais impedir retirada avulsa. Essa liberacao nao
  substitui a devolucao fisica; se houver movimento aberto, atraso, manutencao,
  perda ou dano, o estado fisico continua prevalecendo.
- Quando uma retirada vinculada a reserva e devolvida, a reserva pode continuar
  visivel na lista do dia apenas como historico operacional, com acao
  desabilitada. A chave volta a ficar disponivel para retirada avulsa assim que
  o `key_locks/{keyId}` e removido, desde que nao exista outra reserva ativa
  dentro da janela de bloqueio.
- A retirada avulsa em lote cria uma movimentacao auditavel por chave, todas
  com a mesma pessoa responsavel, identificacao, operador e previsao opcional
  de retorno. O lote nao substitui o historico individual de cada chave.
- A retirada pode informar `expectedReturnAt`; quando a previsao de devolucao
  vence antes da devolucao real, a movimentacao aberta passa a ser exibida como
  `atrasada` e a disponibilidade da chave tambem reflete `atrasada`.
- `POST /api/key-occurrences` registra ocorrencia ou ajuste administrativo,
  guarda estado anterior e pode alterar o estado base para `em_manutencao`,
  `perdida`, `danificada`, `atrasada` ou `disponivel`.
- `bloqueada_por_reserva` nao pode ser gravado manualmente, pois e calculado a
  partir das reservas conhecidas.
- Uma chave com retirada aberta nao pode ser liberada para `disponivel` por
  ocorrencia; a devolucao precisa ser registrada no fluxo proprio.
- Cada movimentacao registra responsavel pela chave, operador da portaria,
  horario, origem `portaria` e observacoes opcionais.

## 12. Privacidade

Nem todo usuario deve ver todos os dados pessoais.

Para portaria e administrador, faz sentido visualizar o responsavel atual pela
chave. Para usuario comum, a interface pode mostrar apenas disponibilidade,
previsao de devolucao ou status de indisponibilidade, conforme politica interna.

Implementacao inicial: `GET /api/reservations` aplica privacidade no backend.
Usuarios com apenas perfil `usuario` recebem a reserva sem `responsibleName` e
`responsibleIdentifier`. Perfis `portaria` e `admin` recebem esses campos quando
existirem, pois precisam conferir a entrega fisica da chave.

Essa regra deve ser validada com a gestao do campus e, se necessario, com a DTI.

## 13. Autenticacao institucional

Decisao atual:

- A PWA usa Firebase Authentication com provedor Google.
- O backend valida o ID token com Firebase Admin e aplica a allowlist de
  e-mails autorizados.
- O SUAP nao autentica operadores da PWA; suas credenciais ficam isoladas no
  backend apenas para a leitura web autorizada das reservas.

Perfis de portaria e administrador devem ter concessao controlada. Nao devem
ser definidos apenas por informacao editavel no frontend.

Fluxo da PWA:

```text
Angular/PWA
  -> Firebase Authentication: login Google
  -> Firestore: Security Rules validam usuario e perfil
  -> Angular: consulta reservas/salas/chaves e registra movimentos
```

No desenvolvimento atual da VM, o worker roda sob PM2 e a PWA Angular roda em
`localhost:4200`. Em producao, a PWA fica em
`https://keychain-ifbaps.web.app`. O worker nao precisa de URL publica para a
PWA; somente o Firebase Authentication e o Firestore ficam expostos pelos
servicos oficiais do Firebase.

## 14. Ordem recomendada de desenvolvimento

Sequencia recomendada para reduzir retrabalho:

1. Backend base Node.js/TypeScript com configuracao, health check e leitura de
   ambiente.
2. Modelo local de usuarios, perfis e sessao da aplicacao.
3. Modelo de ambientes, chaves e vinculo ambiente-chave.
4. Modelo de movimentacoes, historico e ocorrencias.
5. Firebase Authentication e Security Rules para proteger o acesso direto ao
   Firestore.
6. Provider local/manual de reservas para desenvolver regras sem depender do
   SUAP.
7. Provider web read-only de reservas SUAP como estrategia atual autorizada,
   mantendo provider por API oficial como substituicao futura.
8. Persistencia Firestore da copia estruturada das reservas e eventos de
   sincronizacao.
9. Regras de bloqueio de chave com base em reservas normalizadas.
10. Firebase Authentication com ID token validado no backend.
11. Frontend/PWA consumindo diretamente as colecoes Firestore ja estabilizadas.
12. Telas operacionais da portaria, administracao e consulta.

Essa ordem prioriza o backend porque ele define contratos, seguranca,
autorizacao, integracao com SUAP, normalizacao das reservas e regras de negocio.
O frontend deve comecar depois que os endpoints principais estiverem definidos,
podendo usar mocks apenas para evoluir layout sem bloquear o backend.

## 15. Decisoes pendentes

- Confirmar endpoints do SUAP IFBA para reservas de ambientes caso uma API
  oficial seja disponibilizada no futuro.
- Confirmar escopos/permissoes da aplicacao OAuth legada somente se esse fluxo
  continuar sendo necessario para outra integracao.
- Manter registrada a autorizacao institucional para leitura web read-only de
  reservas.
- Rotacionar a credencial de scraping conforme a politica institucional.
- Definir janela e frequencia final de sincronizacao de reservas.
- Definir URL de callback de producao para OAuth/SUAP somente se o fluxo legado
  voltar a ser utilizado.
- Monitorar mudanças de layout e cobertura da listagem administrativa de salas.
- Confirmar que o novo scraper preserva IDs estáveis e não duplica documentos.
- Definir politica de exibicao de dados pessoais.
- Definir URL/dominio publico do backend.
- Validar que o build mais recente do Angular esta publicado no Firebase Hosting
  em `https://keychain-ifbaps.web.app` apos cada deploy.
