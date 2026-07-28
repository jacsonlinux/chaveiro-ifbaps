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
FIREBASE_SERVICE_ACCOUNT_PATH=/etc/keychain-ifbaps/keychain-ifbaps-firebase-adminsdk-fbsvc-9a18ddb436.json
FIRESTORE_RESERVATIONS_COLLECTION=reservations
FIRESTORE_SYNC_EVENTS_COLLECTION=reservation_sync_events
```

O JSON da service account fica fora do repositorio e e lido somente pelo
backend.

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
sao marcadas como `absent`; elas nao sao tratadas como canceladas imediatamente.
