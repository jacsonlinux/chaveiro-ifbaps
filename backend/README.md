# Backend

Backend Node.js/TypeScript do Sistema de Controle de Chaves IFBA/IFBAPS.

## Scripts

```bash
npm install
npm run check
npm run build
npm start
```

## Endpoints iniciais

- `GET /health`: status do servico e configuracao nao sensivel.
- `GET /api/reservations`: lista reservas normalizadas pelo provider ativo.
- `POST /api/reservations/sync`: executa sincronizacao manual pelo provider ativo.
- `GET /api/reservations/sync/status`: status seguro do agendador de sync.
- `GET /api/keys/availability`: lista disponibilidade provisoria de chaves,
  usando reservas sincronizadas e sem expor dados pessoais do solicitante.
- `GET /api/key-catalog`: retorna o catalogo local atual de salas, chaves e
  vinculos.
- `GET /api/rooms` e `POST /api/rooms`: lista e cadastra salas.
- `GET /api/keys` e `POST /api/keys`: lista e cadastra chaves.
- `GET /api/key-room-links` e `POST /api/key-room-links`: lista e cadastra
  vinculos entre chaves e salas.
- `GET /api/key-movements`: lista movimentacoes de chaves.
- `POST /api/key-movements/withdrawals`: registra retirada de chave.
- `POST /api/key-movements/returns`: registra devolucao de chave.

## Configuracao

O backend le configuracao publica de processo e configuracao sensivel do arquivo
externo definido por `EXTERNAL_ENV_PATH`, com padrao:

```text
/etc/keychain-ifbaps/.env
```

Nao coloque segredos no repositorio. Use `backend/.env.example` apenas como
referencia de nomes de variaveis.

## Persistencia de reservas

`RESERVATION_STORE` define onde a copia estruturada das reservas fica mantida:

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
FIRESTORE_SYNC_EVENTS_COLLECTION=reservation_sync_events
```

O JSON da service account fica fora do repositorio e e lido somente pelo
backend.

## Persistencia do catalogo local

`KEY_CATALOG_STORE` define onde salas, chaves fisicas e vinculos sala-chave
ficam mantidos:

- `memory`: uso local/testes, sem persistencia apos restart.
- `firestore`: persiste o catalogo local em colecoes dedicadas.

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
```

Antes de usar esse provider na VM, instale o navegador do Playwright:

```bash
npx playwright install chromium
```

A leitura monta a URL do relatorio sempre da data atual para frente. Nao deve
raspar periodos passados.

`POST /api/reservations/sync` grava a copia estruturada no store ativo e registra
um evento de sincronizacao com contadores. Reservas ausentes em uma sincronizacao
sao marcadas primeiro como `suspect_absent`; somente depois do numero configurado
de sincronizacoes consecutivas ausentes passam para `absent`. Elas nao sao
tratadas como canceladas automaticamente.

## Agendamento de sincronizacao

O agendador interno fica desligado por padrao e pode ser habilitado por
configuracao externa:

```text
RESERVATION_SYNC_SCHEDULE_ENABLED=true
RESERVATION_SYNC_INTERVAL_MS=900000
RESERVATION_SYNC_BACKOFF_MIN_MS=60000
RESERVATION_SYNC_BACKOFF_MAX_MS=1800000
```

Em caso de falha, o scheduler usa backoff exponencial limitado pelo maximo
configurado. O endpoint de status mostra apenas metadados, contadores e mensagem
de erro segura; nao retorna reservas nem dados pessoais.

## Disponibilidade provisoria de chaves

`GET /api/keys/availability` calcula a disponibilidade operacional usando as
reservas normalizadas do provider ativo.

Enquanto nao existir cadastro local completo de salas, chaves e vinculos, o
backend cria um catalogo provisorio a partir de todas as salas retornadas pela
sincronizacao. Isso evita limitar a operacao a exemplos vistos no relatorio,
como A06 ou C02. Quando o catalogo local tiver chaves cadastradas, ele substitui
essa derivacao provisoria.

Variavel principal:

```text
KEY_RESERVATION_BLOCK_MINUTES=30
```

Regra atual: uma chave com estado base `disponivel` fica
`bloqueada_por_reserva` quando houver reserva ativa, alterada ou em conflito
para uma sala vinculada, a partir de 30 minutos antes do inicio da reserva ate o
fim previsto. Reservas canceladas ou ausentes nao bloqueiam. Estados locais como
`retirada`, `em_manutencao`, `perdida` ou `danificada` prevalecem sobre o
bloqueio calculado.

## Catalogo local

O backend possui stores `memory` e `firestore` para cadastro local de salas,
chaves fisicas e vinculos sala-chave sem depender do SUAP. Em desenvolvimento,
`memory` facilita testes rapidos. Na VM, `firestore` deve ser usado para manter
o catalogo apos restart.

Esses endpoints ainda fazem parte do MVP backend e precisam receber autenticacao
e autorizacao antes de uso operacional aberto.

Exemplo de cadastro local:

```bash
curl -X POST http://localhost:3000/api/rooms \
  -H 'content-type: application/json' \
  -d '{"id":"a06","name":"A06 - SALA DE AULA - Bloco A (PS)","campus":"PS","externalRefs":["A06"]}'

curl -X POST http://localhost:3000/api/keys \
  -H 'content-type: application/json' \
  -d '{"id":"patrimonio-a06","code":"CH-A06","label":"Chave Patrimonio A06"}'

curl -X POST http://localhost:3000/api/key-room-links \
  -H 'content-type: application/json' \
  -d '{"keyId":"patrimonio-a06","roomId":"a06"}'
```

Quando houver chaves cadastradas localmente, `GET /api/keys/availability` usa
esse catalogo local e deixa o catalogo provisorio derivado das reservas apenas
como fallback.

## Movimentacoes de chaves

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
- a chave precisa estar `disponivel` no calculo de disponibilidade;
- uma reserva ativa, alterada ou em conflito pode impedir retirada direta;
- a retirada muda o estado base da chave para `retirada`;
- a devolucao fecha a retirada aberta e volta o estado base para `disponivel`;
- cada registro guarda responsavel, operador da portaria, horarios e
  observacoes opcionais.

Esses endpoints ainda fazem parte do MVP backend e precisam receber autenticacao
e autorizacao antes de uso operacional aberto.
