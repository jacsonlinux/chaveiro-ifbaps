# Backend

Backend Node.js/TypeScript do Sistema de Controle de Chaves do IFBA Campus
Porto Seguro.

## Papel atual

O processo `keychain-ifbaps-sync-worker` hospeda o worker de scraping read-only
do SUAP e grava a copia normalizada no Firestore. A PWA publicada nao consome
estes endpoints: ela usa
Firebase Authentication e Firebase Web SDK/Firestore diretamente, protegida por
Security Rules. Os endpoints abaixo permanecem transitorios para operacao,
diagnostico e compatibilidade do backend, e nao devem ser tratados como a API
de negocio da PWA.

## Scripts

```bash
npm install
npm run check
npm run build
npm start
npm run suap:schedule:dry-run
npm run suap:people:scrape
npm run healthcheck
npm run pm2:reload
npm run pm2:status
```

## Endpoints iniciais

- `GET /health`: status do servico e configuracao nao sensivel.
- `GET /api/reservations`: lista reservas normalizadas pelo provider ativo. Para
  perfil `usuario`, remove dados pessoais do responsavel antes da resposta.
- `POST /api/reservations/sync`: executa sincronizacao manual pelo provider ativo.
- `GET /api/reservations/sync/status`: status seguro do agendador de sync.
- `GET /api/reservations/sync/events`: lista ultimos eventos seguros de sync
  para `admin`, sem reservas, HTML bruto, cookies ou dados pessoais.
- `GET /api/keys/availability`: lista disponibilidade de chaves derivadas das
  reservas sincronizadas, sem expor dados pessoais do solicitante.
- `GET /api/key-catalog`, `GET /api/rooms`, `GET /api/keys` e
  `GET /api/key-room-links`: leem a projecao derivada pelo worker. A PWA nao
  usa endpoints de cadastro.
- Endpoints `POST`, `PATCH`, `DELETE` e `reactivate` de catalogo sao legados e
  permanecem somente para compatibilidade/testes internos.
- `GET /api/key-movements`: lista movimentacoes de chaves, com filtros por
  `keyId`, `roomId`, `status`, `dateField=checkedOutAt|returnedAt`, `from` e
  `to`.
- `POST /api/key-movements/withdrawals`: registra retirada de chave.
- `POST /api/key-movements/returns`: registra devolucao de chave.
- `GET /api/key-occurrences`: lista ocorrencias e ajustes de chaves.
- `POST /api/key-occurrences`: registra ocorrencia ou ajuste de estado.
- `GET /api/reports/operations`: retorna resumo operacional para
  `portaria/admin`, com retiradas e devolucoes por periodo, retiradas abertas,
  atrasos atuais e ocorrencias.
- `GET /auth/suap/login` e `GET /auth/suap/callback`: fluxo legado, desativado
  quando `AUTH_MODE=firebase`.
- `GET /auth/session`: retorna a identidade autenticada sem tokens; em modo
  Firebase exige `Authorization: Bearer <ID token>`.
- `POST /auth/logout`: encerra a sessao legada; no modo Firebase o logout e
  feito pelo Firebase Web SDK.
- `POST /auth/sessions/cleanup`: remove sessoes expiradas da aplicacao para
  `admin`, retornando apenas o contador removido.
- `GET /api/users`: lista usuarios conhecidos pela aplicacao para `admin`, com
  filtros opcionais `search` e `role=usuario|portaria|admin`.
- `PATCH /api/users/:id/roles`: atualiza perfis de usuario para `admin`.

## Configuracao

O backend le configuracao publica de processo e configuracao sensivel do arquivo
externo definido por `EXTERNAL_ENV_PATH`, com padrao:

```text
/etc/keychain-ifbaps/.env
```

Nao coloque segredos no repositorio. Use `backend/.env.example` apenas como
referencia de nomes de variaveis.

## Operacao com PM2

Na VM, o backend deve ser iniciado pelo PM2 usando:

```bash
npm run pm2:reload
```

Esse script compila o backend, carrega `backend/ecosystem.config.cjs`, atualiza
os processos `keychain-ifbaps-backend` e `keychain-ifbaps-sync-worker` e executa
`npm run healthcheck`. O primeiro atende HTTP; o segundo executa somente o
scheduler de scraping. A
configuracao PM2 aponta apenas para `EXTERNAL_ENV_PATH=/etc/keychain-ifbaps/.env`;
porta, credenciais e demais valores sensiveis devem continuar somente no arquivo
externo.

Para verificar o processo sem reiniciar:

```bash
npm run pm2:status
```

Para validar somente a API local:

```bash
npm run healthcheck
```

## Publicacao em container

`Dockerfile` prepara o backend com Chromium do Playwright. A imagem nao inclui
o arquivo de ambiente nem a conta de servico do Firebase. No provedor de
deploy, monte esses arquivos como secrets nos caminhos usados pelo container:

```text
/run/secrets/keychain-ifbaps.env
/run/secrets/keychain-ifbaps-firebase-adminsdk.json
```

No arquivo de ambiente montado, defina
`FIREBASE_SERVICE_ACCOUNT_PATH=/run/secrets/keychain-ifbaps-firebase-adminsdk.json`
e mantenha o processo como worker privado de sincronizacao. A API HTTP atual e
transitoria e nao deve ser publicada nem configurada no frontend; a PWA alvo
acessa o Firestore diretamente.

O container deve executar uma única instância do scheduler de sincronização.
Em uma implantação com mais de uma instância, mantenha o scheduler habilitado
em apenas uma delas ou adicione um lock distribuído antes de escalar.

## Autenticacao e autorizacao

`AUTH_MODE` controla a camada de autenticacao do backend:

- `disabled`: modo local/testes; o backend assume permissao administrativa.
- `trusted-header`: modo temporario para ambiente controlado ou proxy confiavel.
- `session`: modo legado; o backend cria sessao propria apos login OAuth/SUAP.
- `firebase`: modo esperado da PWA; o backend valida ID tokens Firebase e a
  allowlist de e-mails autorizados.

Variavel principal:

```text
AUTH_MODE=disabled
AUTH_ALLOWED_EMAILS=replace-with-authorized-email
AUTH_DEFAULT_ROLES=portaria
AUTH_SESSION_COOKIE_NAME=keychain_session
AUTH_OAUTH_STATE_COOKIE_NAME=keychain_oauth_state
AUTH_SESSION_TTL_MS=28800000
AUTH_COOKIE_SECURE=false
AUTH_ADMIN_IDENTIFIERS=admin-identification,admin@example.edu.br
AUTH_PORTARIA_IDENTIFIERS=portaria@example.edu.br
AUTH_SESSION_STORE=firestore
FIRESTORE_AUTH_SESSIONS_COLLECTION=auth_sessions
APP_FRONTEND_URL=http://localhost:4200/
CORS_ALLOWED_ORIGINS=http://localhost:4200
```

Em producao, a URL publica atual da PWA e:

```text
APP_FRONTEND_URL=https://keychain-ifbaps.web.app/
```

No modo `session` legado, o fluxo e:

```text
GET /auth/suap/login
  -> redireciona para o SUAP
GET /auth/suap/callback?code=...&state=...
  -> troca code por token no backend
  -> consulta /api/eu/
  -> cria cookie HTTP-only da aplicacao
  -> redireciona para APP_FRONTEND_URL?login=suap-ok
```

Variaveis OAuth/SUAP usadas somente pelo backend:

```text
SUAP_CLIENT_ID=...
SUAP_CLIENT_SECRET=...
SUAP_REDIRECT_URI=http://localhost:3000/auth/suap/callback
SUAP_AUTHORIZE_URL=https://suap.ifba.edu.br/o/authorize/
SUAP_TOKEN_URL=https://suap.ifba.edu.br/o/token/
SUAP_ME_URL=https://suap.ifba.edu.br/api/eu/
SUAP_OAUTH_SCOPE=
```

O backend tambem aceita os aliases ja usados em alguns ambientes:
`SUAP_OAUTH_AUTHORIZE_URL`, `SUAP_OAUTH_TOKEN_URL` e `SUAP_OAUTH_ME_URL`.

No modo `trusted-header`, as permissoes sao derivadas destes headers:

```text
x-keychain-user-id
x-keychain-user-name
x-keychain-user-email
x-keychain-user-roles
```

Perfis iniciais:

- `usuario`: pode consultar reservas e disponibilidade.
- `portaria`: pode consultar e registrar retirada/devolucao e ocorrencias.
- `admin`: pode consultar, acompanhar a sincronizacao, listar usuarios
  conhecidos pela aplicacao e ajustar perfis. Nao cadastra salas, chaves ou
  reservas pela PWA.

`trusted-header` nao deve ser exposto diretamente na internet sem um componente
confiavel removendo/assinando esses headers. O modo `session` deve substituir
esse modo quando o callback OAuth estiver configurado no SUAP.

## Usuarios da aplicacao

`USER_STORE` define onde os usuarios autenticados pelo SUAP ficam registrados:

- `memory`: uso local/testes, sem persistencia apos restart.
- `firestore`: persiste usuarios conhecidos pela aplicacao.

Variaveis principais:

```text
USER_STORE=firestore
FIRESTORE_USERS_COLLECTION=users
```

No callback OAuth/SUAP, o backend consulta `/api/eu/`, cria ou atualiza o
usuario local e registra `firstSeenAt`, `lastLoginAt`, perfis, campus, nome e
email. O token OAuth nao e salvo nesse cadastro.

Administradores podem ajustar perfis de usuarios ja autenticados por:

```bash
curl -X PATCH http://localhost:3010/api/users/2180715/roles \
  -H 'content-type: application/json' \
  -b cookies-admin.txt \
  -d '{"roles":["usuario","portaria"]}'
```

O backend sempre mantem o perfil basico `usuario`. Um administrador nao pode
remover o proprio perfil `admin` pela API, para evitar perda acidental de acesso.
Perfis concedidos manualmente ficam preservados em logins SUAP posteriores; os
perfis derivados de `AUTH_ADMIN_IDENTIFIERS` e `AUTH_PORTARIA_IDENTIFIERS`
continuam servindo como bootstrap/garantia operacional.

`AUTH_SESSION_STORE` define onde as sessoes HTTP-only da aplicacao ficam
mantidas:

- `memory`: uso local/testes; logins caem quando o backend reinicia.
- `firestore`: recomendado na VM; preserva sessoes entre restarts e prepara o
  caminho para mais de uma instancia.

Sessoes expiradas sao invalidadas e removidas quando consultadas. Para limpar
sessoes expiradas que nao voltaram a ser acessadas, um administrador pode chamar
`POST /auth/sessions/cleanup`; a resposta informa apenas quantos registros foram
apagados, sem expor IDs, cookies ou dados de usuario.

`APP_FRONTEND_URL` e publico e define para onde o navegador volta depois do
callback legado. No modo `firebase`, a PWA envia o ID token no cabecalho
`Authorization` e o backend valida a origem em `CORS_ALLOWED_ORIGINS`.
Em producao, essa allowlist deve conter somente
`https://keychain-ifbaps.web.app`.

`SUAP_REDIRECT_URI` e diferente: ele deve apontar para o callback publico do
backend, por exemplo `https://<backend-publico>/auth/suap/callback`, e precisa
ser cadastrado exatamente igual na aplicacao OAuth do SUAP.

## Persistencia de reservas e ocupacoes

`RESERVATION_STORE` define onde a copia estruturada atual das reservas fica
mantida:

- `memory`: uso local/testes, sem persistencia apos restart.
- `firestore`: persiste reservas normalizadas e eventos de sincronizacao.

Variaveis principais:

```text
RESERVATION_STORE=firestore
RESERVATION_CACHE_TTL_MS=300000
RESERVATION_ABSENCE_CONFIRMATION_SYNCS=2
RESERVATION_SYNC_EVENT_RETENTION_DAYS=90
FIREBASE_SERVICE_ACCOUNT_PATH=/etc/keychain-ifbaps/keychain-ifbaps-firebase-adminsdk-fbsvc-9a18ddb436.json
FIRESTORE_RESERVATIONS_COLLECTION=reservations
FIRESTORE_OCCUPANCIES_COLLECTION=occupancies
FIRESTORE_SYNC_EVENTS_COLLECTION=reservation_sync_events
```

O JSON da service account fica fora do repositorio e e lido somente pelo
backend.

`reservations` e a colecao de compatibilidade atual. `occupancies` e o modelo
unificado para aulas nativas e reservas SUAP confirmadas; no inicio da
refatoracao, as reservas sincronizadas tambem sao projetadas nessa colecao para
preparar a PWA para a leitura unificada sem depender do SUAP.

## Projecao operacional derivada do SUAP

`KEY_CATALOG_STORE` define onde o worker mantem a projecao de salas, chaves
derivadas e vinculos sala-chave:

- `memory`: uso local/testes, sem persistencia apos restart.
- `firestore`: persiste a projecao derivada em colecoes dedicadas.

Variaveis principais:

```text
KEY_CATALOG_STORE=firestore
FIRESTORE_ROOMS_COLLECTION=rooms
FIRESTORE_KEYS_COLLECTION=keys
FIRESTORE_KEY_ROOM_LINKS_COLLECTION=key_room_links
```

## Persistencia de movimentacoes

`KEY_MOVEMENT_STORE` define onde retiradas/devolucoes ficam mantidas:

- `memory`: uso local/testes, sem persistencia apos restart.
- `firestore`: persiste o historico operacional de movimentacoes.

Variaveis principais:

```text
KEY_MOVEMENT_STORE=firestore
FIRESTORE_KEY_MOVEMENTS_COLLECTION=key_movements
```

## Ocorrencias de chaves

Consulta de historico:

```bash
curl 'http://localhost:3000/api/key-occurrences?from=2026-07-28T00:00:00.000-03:00&to=2026-07-28T23:59:59.999-03:00&type=ocorrencia'
```

Filtros aceitos:

- `keyId`: chave fisica.
- `roomId`: sala.
- `type`: `ocorrencia` ou `ajuste_admin`.
- `from` e `to`: periodo ISO aplicado sobre `occurredAt`.

`KEY_OCCURRENCE_STORE` define onde ocorrencias e ajustes ficam mantidos:

- `memory`: uso local/testes, sem persistencia apos restart.
- `firestore`: persiste o historico de ocorrencias.

Variaveis principais:

```text
KEY_OCCURRENCE_STORE=firestore
FIRESTORE_KEY_OCCURRENCES_COLLECTION=key_occurrences
```

`POST /api/key-occurrences` registra `ocorrencia` ou `ajuste_admin`. Quando
`targetStatus` e informado, o backend altera o estado base da chave e guarda o
estado anterior no historico. `bloqueada_por_reserva` nao pode ser gravado
manualmente, pois e calculado pelas reservas. Uma chave com retirada aberta nao
pode ser liberada para `disponivel` por ocorrencia.

## Providers de reserva

`SUAP_RESERVATION_PROVIDER` define o provider ativo:

- `local`: provider local sem dependencia do SUAP. Padrao atual.
- `api`: reservado para API oficial do SUAP, quando existir endpoint autorizado.
- `web-readonly`: reservado para leitura controlada da interface web do SUAP.

O provider `web-readonly` concentra a leitura automatizada server-side e impede
que o frontend ou outras partes do sistema dependam diretamente do SUAP.

## SUAP web read-only

A automacao web read-only usa Playwright no backend, atras das configuracoes:

```text
SUAP_RESERVATION_PROVIDER=web-readonly
SUAP_WEB_READONLY_ENABLED=true
SUAP_RESERVATION_REPORT_URL=https://suap.ifba.edu.br/comum/sala/reservasala_relat/
SUAP_RESERVATION_SYNC_WINDOW_DAYS=30
SUAP_RESERVATION_START_TIME=07:00
SUAP_RESERVATION_END_TIME=17:00
SUAP_RESERVATION_CAMPUS_ID=27
SUAP_RESERVATION_STATUS=deferida
SUAP_ROOM_SCHEDULE_SYNC_ENABLED=true
SUAP_ROOM_SCHEDULE_SYNC_WINDOW_DAYS=7
SUAP_ROOM_SCHEDULE_SYNC_MAX_ROOMS=34
```

A listagem administrativa de salas agendáveis do campus Porto Seguro é a fonte
read-only de salas usada pelo worker:

```text
SUAP_ROOMS_URL=https://suap.ifba.edu.br/admin/comum/sala/?agendavel__exact=1&all=&predio__uo=27
```

O worker reutiliza a sessão autenticada read-only, percorre a paginação e faz
upsert em `rooms/{suapRoomId}`. Não há cadastro manual na PWA. A sincronização
validada em 28/07/2026 retornou 34 salas nessa fonte e manteve a cópia de 20
reservas futuras.

A agenda individual da sala (`/comum/sala/solicitar_reserva/{id}/`) e lida como
complemento para aulas nativas e outras ocupacoes exibidas no calendario. O
normalizador usa classificacao conservadora entre `aula_regular`, `evento` e
`outro`. A configuracao versionada do PM2 habilita essa leitura para as 34 salas
catalogadas do Campus Porto Seguro, com janela futura de 7 dias. O limite deve
ser reduzido se o SUAP apresentar lentidao ou erro de carga.

Para validar essa fonte sem alterar o SUAP, iniciar o worker ou gravar no
Firestore, use depois do build:

```bash
SUAP_ROOM_SCHEDULE_SYNC_MAX_ROOMS=2 npm run suap:schedule:dry-run
```

O comando usa a configuracao externa de login read-only, sobrescreve apenas em
memoria a flag da agenda e imprime um resumo sanitizado com quantidade de salas,
codigos, horarios e classificacoes. Nao imprime nomes, finalidades, cookies,
tokens ou credenciais. A selecao do dry-run permanece restrita a salas ativas,
agendaveis e identificadas como campus `PS`.

Antes de usar esse provider na VM, instale o navegador do Playwright:

```bash
npx playwright install chromium
```

A leitura monta a URL do relatorio sempre da data atual para frente. Nao deve
raspar periodos passados. O relatorio paginado continua sendo a fonte de
reservas. A listagem administrativa será a fonte de salas agendáveis, inclusive
as que não possuem reserva futura. A06, C02 ou qualquer outra sala vista em
exemplo sao apenas linhas retornadas pelo SUAP, nao uma lista fixa.

Nao cadastrar uma URL `solicitar_reserva/<id>` para cada sala. Quando a leitura
de agenda estiver habilitada, o worker deve usar dinamicamente o `scheduleUrl`
obtido da listagem administrativa de salas, respeitando limites de cadencia e
quantidade.

### Pessoas do campus (snapshot read-only)

O script abaixo le uma unica vez a listagem administrativa de servidores do
campus Porto Seguro e grava um snapshot, sem alterar o SUAP:

```bash
npm run suap:people:scrape
```

O snapshot contem dados pessoais reais (nomes, matriculas, e-mails) e e gravado
por padrao em `/etc/keychain-ifbaps/pessoas-ps.json` com permissao restrita ao
dono. O arquivo versionado no repositorio e `scripts/pessoas-ps.json`, uma copia
do snapshot gerado em 19/08/2026 (121 pessoas: professores e tecnicos, com nome,
cargo, situacao e e-mail normalizados em minusculo). `scripts/pessoas-ps.example.json`
mantem apenas dados ficticios. Para escrever em outro caminho, defina
`PEOPLE_JSON_PATH`.

A fonte e a listagem administrativa read-only

```text
/admin/rh/servidor/?excluido__exact=0&setoruo=27
```

O script percorre a paginacao (sete paginas atualmente), extrai nome, matricula
(entre parenteses), e-mail, cargo e situacao, e classifica cada pessoa como
`professor` ou `tecnico` pelo cargo. Estagiarios e excluidos nao entram no
snapshot final. Esse arquivo e somente uma fonte de apoio para decisao futura de
cadastro de pessoas; a PWA nao consome esse snapshot hoje.

`GET /api/reservations` le somente a copia persistida no Firestore (com cache em
memoria). Ele nao inicia raspagem quando a copia estiver vazia. A raspagem fica
restrita ao scheduler e ao `POST /api/reservations/sync`, que grava a copia
estruturada no store ativo e registra
um evento de sincronizacao com contadores. Reservas ausentes em uma sincronizacao
sao marcadas primeiro como `suspect_absent`; somente depois do numero configurado
de sincronizacoes consecutivas ausentes passam para `absent`. Elas nao sao
tratadas como canceladas automaticamente.

## Agendamento de sincronizacao

O agendador interno fica desligado por padrao e pode ser habilitado por
configuracao externa:

```text
RESERVATION_SYNC_SCHEDULE_ENABLED=true
RESERVATION_SYNC_INTERVAL_MS=300000
RESERVATION_SYNC_BACKOFF_MIN_MS=60000
RESERVATION_SYNC_BACKOFF_MAX_MS=1800000
RESERVATION_SYNC_WINDOW_START=07:00
RESERVATION_SYNC_WINDOW_END=18:00
```

Em caso de falha, o scheduler usa backoff exponencial limitado pelo maximo
configurado. O endpoint de status mostra apenas metadados, contadores e mensagem
de erro segura; nao retorna reservas nem dados pessoais. Depois de cada ciclo,
o proximo horario calculado e persistido novamente em `sync_status/current`,
para que o diagnostico nao exiba o horario do ciclo anterior.

## Reset operacional da PWA

Para preparar novos testes, o script abaixo remove somente os dados operacionais
da PWA: `key_movements`, `key_locks` e `key_occurrences`. Salas, chaves,
vinculos, usuarios, reservas e ocupacoes do SUAP sao preservados.

Primeiro execute a simulacao:

```bash
./scripts/reset-pwa-operational-data.sh
```

Para confirmar a exclusao:

```bash
./scripts/reset-pwa-operational-data.sh --confirm-reset-pwa-data
```

O argumento de confirmacao e obrigatorio. O comando nao aceita colecoes
arbitrarias e nao imprime credenciais, cookies ou identificadores de documentos.

## Disponibilidade provisoria de chaves

`GET /api/keys/availability` calcula a disponibilidade operacional usando as
reservas normalizadas do provider ativo.

O worker cria uma projecao a partir de todas as salas retornadas pela listagem
administrativa. Isso evita limitar a operacao a exemplos vistos no relatorio,
como A06 ou C02. A PWA recebe essa projecao somente para leitura.

Configuracao legada mantida apenas por compatibilidade:

```text
KEY_RESERVATION_BLOCK_MINUTES=0
```

Essa variavel pertence a regra antiga de bloqueio antecipado. O backend aceita a
variavel para nao quebrar ambientes existentes, mas a disponibilidade ja segue a
regra cronologica: uma chave com estado base `disponivel` fica
`bloqueada_por_reserva` somente quando houver aula nativa ou reserva SUAP
confirmada para uma sala vinculada durante o intervalo real da ocupacao,
considerando `startsAt <= agora < endsAt`.
Reservas `suspect_absent` nao bloqueiam, mas podem aparecer como alerta
sanitizado quando estao no horario de uso. Reservas `canceled` ou `absent` nao
bloqueiam nem geram alerta na disponibilidade. Estados locais como `retirada`,
`em_manutencao`, `perdida` ou `danificada` prevalecem sobre o
bloqueio calculado.

Os endpoints legados de catalogo permanecem somente para compatibilidade do
backend e testes internos. Eles nao fazem parte da PWA e nao devem ser usados
para cadastrar dados operacionais. O worker com Firebase Admin SDK e o unico
componente autorizado a atualizar a projecao.

## Movimentacoes de chaves

Consulta de historico:

```bash
curl 'http://localhost:3000/api/key-movements?from=2026-07-28T00:00:00.000-03:00&to=2026-07-28T23:59:59.999-03:00&status=devolvida'
```

Filtros aceitos:

- `keyId`: chave fisica.
- `roomId`: sala.
- `status`: `retirada` ou `devolvida`.
- `from` e `to`: periodo ISO aplicado sobre `checkedOutAt`.

Retirada:

```bash
curl -X POST http://localhost:3000/api/key-movements/withdrawals \
  -H 'content-type: application/json' \
  -d '{"keyId":"patrimonio-a06","roomId":"a06","responsibleName":"Pessoa Responsavel","actorName":"Portaria"}'
```

Devolucao:

```bash
curl -X POST http://localhost:3000/api/key-movements/returns \
  -H 'content-type: application/json' \
  -d '{"keyId":"patrimonio-a06","actorName":"Portaria"}'
```

Regras atuais:

- a chave precisa existir e estar vinculada a sala informada;
- a chave, a sala e o vinculo nao podem estar desativados;
- a chave precisa estar `disponivel` no calculo de disponibilidade;
- uma reserva ativa, alterada ou em conflito pode impedir retirada direta;
- a retirada muda o estado base da chave para `retirada`;
- o sistema nao usa previsao de retorno: nao ha estado `atrasada` derivado de
  horario esperado;
- a devolucao fecha a retirada aberta e volta o estado base para `disponivel`;
- cada registro guarda responsavel, operador da portaria, horarios e
  observacoes opcionais.

Esses endpoints ainda fazem parte do MVP backend e precisam usar `AUTH_MODE`
adequado antes de uso operacional aberto.
