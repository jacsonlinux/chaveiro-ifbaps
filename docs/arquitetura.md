# Arquitetura Inicial

Documento de orientacao tecnica para o Sistema Web de Controle de Chaves do
IFBA Campus Porto Seguro.

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
|   |-- ecosystem.config.js
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
Angular PWA no Firebase Hosting
  -> Backend Node.js/TypeScript na VM via PM2
  -> Firestore/Firebase
  -> SUAP API, se houver endpoint autorizado
  -> SUAP web read-only, apenas como fallback autorizado
```

### Frontend

Responsavel por:

- Interface web responsiva.
- Experiencia PWA.
- Telas de consulta.
- Telas operacionais da portaria.
- Chamadas HTTP para o backend.
- Build estatico publicado no Firebase Hosting.

O frontend nao deve guardar segredos nem implementar sozinho regras criticas de
permissao, retirada, devolucao ou bloqueio por reserva.

### Backend

Responsavel por:

- Regras de negocio.
- Autorizacao e perfis.
- Auditoria das operacoes.
- Acesso aos dados.
- Integracao com Firebase/Firestore.
- Integracao com SUAP quando autorizada.
- Coleta, normalizacao, cache e persistencia de reservas externas.
- Validacao de conflitos de retirada, devolucao e reserva.
- Execucao na VM gerenciada por PM2.

## 4. Execucao e publicacao

### Backend na VM com PM2

O backend deve rodar na VM do projeto, gerenciado por PM2.

Responsabilidades operacionais:

- Ler configuracoes privadas em `/etc/keychain-ifbaps`.
- Usar service account do Firebase Admin SDK apenas no backend.
- Expor API HTTP para o frontend.
- Manter logs operacionais sem imprimir segredos.
- Ter configuracao PM2 em `backend/ecosystem.config.js`.

Base inicial implementada:

- Servidor HTTP Node.js/TypeScript em `backend/`.
- `GET /health` com status e configuracao nao sensivel.
- `GET /api/reservations` usando provider de reservas ativo.
- `POST /api/reservations/sync` para sincronizacao manual do provider ativo.
- `GET /api/key-catalog`, `GET/POST /api/rooms`, `GET/POST /api/keys` e
  `GET/POST /api/key-room-links` para catalogo local inicial com store
  `memory|firestore`.
- `GET /api/keys/availability` usando catalogo local quando existir ou catalogo
  provisorio derivado das reservas como fallback.
- `GET /api/key-movements`, `POST /api/key-movements/withdrawals` e
  `POST /api/key-movements/returns` para historico inicial de retirada e
  devolucao de chaves com store `memory|firestore`.
- `GET /api/key-occurrences` e `POST /api/key-occurrences` para ocorrencias e
  ajustes auditaveis de estado de chave com store `memory|firestore`.
- Carregamento de configuracao externa em `/etc/keychain-ifbaps/.env`.
- `backend/.env.example` somente com nomes e placeholders.

### Frontend no Firebase Hosting

O frontend Angular deve ser compilado como aplicacao estatica e publicado no
Firebase Hosting.

Responsabilidades operacionais:

- Manter `frontend/firebase.json` com configuracao do hosting.
- Nao armazenar segredos administrativos no bundle.
- Consumir a URL publica/autorizada do backend.
- Usar variaveis de ambiente de build apenas para valores publicos, como URL da
  API.

Base inicial implementada:

- Aplicacao Angular em `frontend/`.
- Tela operacional da portaria com disponibilidade de chaves, retiradas
  abertas/atrasadas, ocorrencias recentes e formularios de retirada, devolucao e
  ocorrencia.
- Login iniciado por `GET /auth/suap/login` e estado consultado por
  `GET /auth/session`.
- Configuracao publica de API por `public/runtime-config.js`, proxy local para
  `/api` e `/auth`, manifest PWA, service worker Angular e `firebase.json` para
  hosting estatico.
- O frontend nao contem segredos; `client_secret`, service account, senha SUAP e
  tokens permanecem no backend/runtime externo.

## 5. Stack prevista

Backend:

- Node.js.
- TypeScript.
- API HTTP/REST.
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

Pode consultar informacoes internas permitidas, como disponibilidade de chaves e
informacoes de ambientes, respeitando regras de privacidade.

### Portaria

Pode:

- Visualizar chaves.
- Registrar retirada.
- Registrar devolucao.
- Consultar historico operacional.
- Registrar ocorrencias.
- Identificar chaves atrasadas, perdidas ou danificadas.
- Ver reservas relacionadas, quando houver integracao com SUAP.

### Administrador

Pode gerenciar:

- Chaves.
- Ambientes.
- Usuarios.
- Perfis e permissoes.
- Configuracoes.
- Historico.
- Relatorios.
- Integracoes.

A autorizacao deve ser aplicada no backend, nao apenas por ocultacao visual no
frontend.

Implementacao inicial:

- O backend possui `AUTH_MODE=disabled|trusted-header|session`.
- `disabled` e apenas para desenvolvimento/testes.
- `trusted-header` e uma ponte temporaria para ambiente controlado ou proxy
  confiavel ate a sessao OAuth/SUAP final.
- `session` e o modo esperado de operacao: o backend inicia OAuth/SUAP, recebe
  o callback, consulta `/api/eu/` para identificar o usuario e cria cookie
  HTTP-only da propria aplicacao.
- As sessoes da aplicacao podem usar `AUTH_SESSION_STORE=memory|firestore`.
  `memory` serve para desenvolvimento; `firestore` e o modo esperado na VM para
  preservar logins entre restarts e preparar execucao com mais de uma instancia.
- O callback OAuth tambem cria ou atualiza um usuario local da aplicacao, com
  store `memory|firestore`, registrando identidade institucional basica, perfis
  atribuidos e horarios de primeiro/ultimo login.
- Permissoes iniciais:
  - `usuario`: consulta reservas e disponibilidade.
  - `portaria`: consulta e movimenta chaves.
  - `admin`: sincroniza reservas, gerencia catalogo, lista usuarios e ajusta
    perfis.
- Endpoints de catalogo, sincronizacao e movimentacao ja passam por guard de
  permissao backend quando `AUTH_MODE=trusted-header` ou `AUTH_MODE=session`.
- `PATCH /api/users/:id/roles` permite ajuste administrativo inicial dos papeis
  `usuario`, `portaria` e `admin`. O backend preserva `usuario`, impede que um
  admin remova o proprio `admin` e mantem perfis manuais em logins SUAP
  posteriores.

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
  oficial para consultar reservas de ambientes.

Validacao realizada:

- O fluxo OAuth com SUAP foi testado com callback temporario local em
  `http://localhost:3010/auth/suap/callback`.
- O SUAP solicitou autorizacao do usuario, retornou um `code`, o backend de
  teste trocou esse `code` por token em `/o/token/` e consultou `/api/eu/`.
- A resposta de `/api/eu/` retornou os campos institucionais esperados para o
  usuario autenticado: `identificacao`, `nome`, `email` e `campus`.
- O teste confirma a viabilidade tecnica do login institucional via SUAP para o
  sistema de chaves.
- O backend implementa a base desse fluxo em `GET /auth/suap/login`,
  `GET /auth/suap/callback`, `GET /auth/session` e `POST /auth/logout`.
- O token OAuth e usado apenas no backend para consultar `/api/eu/`; a PWA deve
  receber somente a sessao da aplicacao e dados nao secretos do usuario.
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

- A PWA nao deve capturar senha do SUAP.
- A PWA nao deve armazenar nem enviar diretamente o `client_secret` do SUAP.
- A integracao deve usar API/OAuth/token autorizado pela instituicao.
- O uso de `/api/eu/` serve para autenticar/identificar o usuario logado; isso
  nao substitui a coleta read-only das reservas de salas.
- Scraping ou automacao da interface web do SUAP nao devem ser primeira opcao.
- Qualquer alternativa nao oficial precisa de autorizacao institucional.
- Se a leitura automatizada da interface web for autorizada, ela deve ser
  somente leitura. O sistema de chaves nao deve criar, alterar ou cancelar
  reservas no SUAP por automacao web.

## 10. Leitura de reservas do SUAP

Enquanto nao houver API REST oficial confirmada para reservas de salas, a
estrategia aceita para avaliacao tecnica e leitura controlada da interface web
do SUAP, apenas com autorizacao institucional e apenas para consulta.

Decisao atual:

- A implementacao deve avancar com `SuapWebReadOnlyReservationProvider` como
  estrategia inicial para reservas, mantendo `SuapApiReservationProvider`
  previsto para substituicao futura quando houver API oficial.
- A integracao web deve ser estritamente read-only: consultar reservas, coletar
  campos necessarios, normalizar e disponibilizar ao sistema de chaves.
- Criacao, alteracao ou cancelamento de reservas no SUAP ficam fora do escopo da
  automacao.
- A autorizacao institucional para essa leitura deve ser formalizada antes de
  uso operacional em producao.
- O contrato de provider e a automacao web read-only ja existem no backend,
  atras de feature flag e configuracao externa.

Objetivo:

```text
SUAP reservas
  -> backend coleta dados autorizados
  -> backend normaliza reservas
  -> cache rapido em memoria
  -> persistencia estruturada no Firestore
  -> API interna para frontend e regras de chave
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
SUAP_RESERVATION_ROOM_URLS
```

Essas variaveis devem ficar somente em `/etc/keychain-ifbaps/.env` ou outro
arquivo externo equivalente, nunca no repositorio.

URLs iniciais identificadas para avaliacao:

- Relatorio/listagem: `/comum/sala/reservasala_relat/`.
- Pagina por sala: `/comum/sala/solicitar_reserva/<sala_id>/`.

Inferencia tecnica atual: o numero final em `solicitar_reserva/<numero>/`
parece ser o identificador interno da sala/ambiente no SUAP. O relatorio deve
ser priorizado para leitura geral se apresentar filtros e tabela de reservas; as
paginas por sala podem servir para complementar o mapeamento de ambientes.

Nao deve existir lista fixa de salas no codigo ou na configuracao. O relatorio
geral paginado deve ser percorrido para coletar todas as salas retornadas pelo
filtro/campus/periodo. URLs `solicitar_reserva/<id>` nao devem ser cadastradas
uma a uma para tentar cobrir o campus; elas sao apenas apoio diagnostico quando
for necessario entender um ambiente especifico.

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
- `GET /api/reservations` usa o cache do provider; se ainda estiver vazio, faz
  uma primeira sincronizacao.

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
- Colecoes do catalogo local: `rooms`, `keys` e `key_room_links`.
- Colecao de movimentacoes: `key_movements`.
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

Regra inicial sugerida:

- Uma reserva do SUAP pode bloquear a chave vinculada ao ambiente 30 minutos
  antes do horario de inicio.
- O bloqueio impede retirada por terceiros.
- A chave deve ficar disponivel para o responsavel da reserva no horario
  previsto.

Casos que precisam de regra explicita:

- Chave ja retirada antes do inicio do bloqueio.
- Retirada direta com reserva futura proxima.
- Reserva cancelada no SUAP.
- Reserva alterada no SUAP.
- Reservas sobrepostas.
- Chaves mestras.
- Uma chave para varios ambientes.
- Varias chaves para um mesmo ambiente.

Recomendacao: retirada sem reserva so deve ser permitida quando nao comprometer
uma reserva futura conhecida.

Implementacao inicial:

- `GET /api/keys/availability` calcula disponibilidade de chaves no backend.
- Enquanto nao existir cadastro local oficial de ambientes, chaves e vinculos,
  o backend cria um catalogo provisorio dinamico a partir de todas as salas
  retornadas pela sincronizacao de reservas.
- O backend ja possui um catalogo local inicial com stores `memory` e
  `firestore` para salas, chaves e vinculos; quando ele contem chaves
  cadastradas, a disponibilidade usa esse catalogo local em vez do catalogo
  provisorio.
- Esse catalogo provisorio nao limita a operacao a salas vistas em exemplos,
  como A06 ou C02. Qualquer sala retornada pelo SUAP pode aparecer na resposta.
- O store `firestore` deve ser usado na VM para persistencia operacional do
  catalogo local.
- Reservas `active`, `changed` e `conflicted` podem bloquear a chave; reservas
  `canceled`, `absent` e `suspect_absent` nao bloqueiam.
- A resposta geral de disponibilidade nao deve expor nome, matricula ou outro
  dado pessoal do solicitante.
- `POST /api/key-movements/withdrawals` registra retirada somente quando a
  chave existe, esta vinculada a sala informada, nao possui retirada aberta e
  esta `disponivel`.
- `POST /api/key-movements/returns` fecha a retirada aberta da chave e volta o
  estado base da chave para `disponivel`.
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

Essa regra deve ser validada com a gestao do campus e, se necessario, com a DTI.

## 13. Autenticacao institucional

Opcoes a avaliar:

- Login pelo SUAP via OAuth usando a aplicacao `keychain-ifbaps` ja registrada.
- Login via provedor institucional, se disponivel.
- Firebase Authentication com controle de dominio institucional.
- Cadastro controlado por administrador para perfis sensiveis.

Perfis de portaria e administrador devem ter concessao controlada. Nao devem
ser definidos apenas por informacao editavel no frontend.

Para o fluxo OAuth confidencial, a troca do `code` por tokens deve ocorrer no
backend. O frontend pode iniciar o login e receber o resultado da sessao da
aplicacao, mas nao deve conhecer o `client_secret`.

Fluxo local recomendado para desenvolvimento:

```text
Angular
  -> Backend: /auth/suap/login
  -> SUAP: /o/authorize/
  -> Backend: /auth/suap/callback
  -> SUAP: /o/token/ e /api/eu/
  -> Backend: cria cookie HTTP-only da aplicacao
  -> Angular/PWA: APP_FRONTEND_URL?login=suap-ok
```

No desenvolvimento atual da VM, o backend roda em `localhost:3010` e a PWA
Angular em `localhost:4200`. `APP_FRONTEND_URL` deve apontar para a PWA e o
`SUAP_REDIRECT_URI` cadastrado no SUAP deve continuar apontando para o callback
do backend. A PWA nao chama endpoints operacionais antes de confirmar sessao por
`GET /auth/session`.

## 14. Ordem recomendada de desenvolvimento

Sequencia recomendada para reduzir retrabalho:

1. Backend base Node.js/TypeScript com configuracao, health check e leitura de
   ambiente.
2. Login OAuth/SUAP no backend, ja validado tecnicamente.
3. Modelo local de usuarios, perfis e sessao da aplicacao.
4. Modelo de ambientes, chaves e vinculo ambiente-chave.
5. Modelo de movimentacoes, historico e ocorrencias.
6. API interna para frontend consumir chaves, ambientes, movimentacoes,
   ocorrencias e reservas normalizadas.
7. Provider local/manual de reservas para desenvolver regras sem depender do
   SUAP.
8. Provider web read-only de reservas SUAP como estrategia inicial autorizada,
   mantendo provider por API oficial como substituicao futura.
9. Persistencia Firestore da copia estruturada das reservas e eventos de
   sincronizacao.
10. Regras de bloqueio de chave com base em reservas normalizadas.
11. Frontend/PWA consumindo os endpoints ja estabilizados do backend.
12. Telas operacionais da portaria, administracao e consulta.

Essa ordem prioriza o backend porque ele define contratos, seguranca,
autorizacao, integracao com SUAP, normalizacao das reservas e regras de negocio.
O frontend deve comecar depois que os endpoints principais estiverem definidos,
podendo usar mocks apenas para evoluir layout sem bloquear o backend.

## 15. Decisoes pendentes

- Confirmar endpoints do SUAP IFBA para reservas de ambientes.
- Confirmar escopos/permissoes da aplicacao OAuth `keychain-ifbaps`.
- Formalizar autorizacao institucional para leitura web read-only de reservas
  enquanto nao houver API oficial.
- Definir credencial/sessao autorizada para leitura web em producao.
- Definir janela e frequencia final de sincronizacao de reservas.
- Definir URL de callback de producao para OAuth/SUAP no backend.
- Ativar operacionalmente `AUTH_MODE=session` na VM e definir sessao persistente
  distribuida se houver mais de uma instancia do backend.
- Implementar gestao administrativa completa de perfis de usuario.
- Definir politica de exibicao de dados pessoais.
- Definir URL/dominio publico do backend.
- Definir processo de build e publicacao do Angular no Firebase Hosting.
