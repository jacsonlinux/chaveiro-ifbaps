# Plano de Implementacao

Plano resumido para sair da fase documental e iniciar a implementacao do sistema
de controle de chaves IFBA/IFBAPS.

## Estado atual

```text
Status geral: implementacao iniciada
Backend: base inicial implementada
Frontend: nao iniciado
Login SUAP OAuth: base backend implementada apos validacao manual
Reservas SUAP por API oficial: endpoint ainda nao confirmado
Reservas SUAP por leitura web: estrategia adotada como fallback read-only
Firestore: persistencia inicial de reservas implementada
Disponibilidade de chaves: endpoint provisorio iniciado a partir das reservas
Catalogo local: salas, chaves e vinculos com store memory/firestore
Movimentacoes: retirada/devolucao iniciadas com store memory/firestore
Ocorrencias: registro e ajuste de estado com store memory/firestore
Usuarios locais: autenticados pelo SUAP com store memory/firestore
Autorizacao: guards iniciais por perfil com AUTH_MODE trusted-header/session
```

## Decisoes atuais

- Comecar pelo backend para fixar contratos, seguranca, autenticacao,
  normalizacao de reservas e regras de negocio.
- Usar login OAuth/SUAP no backend para autenticacao institucional.
- Implementar leitura web read-only das reservas do SUAP enquanto nao houver API
  oficial disponivel.
- Manter a raspagem isolada em provider substituivel.
- Persistir copia estruturada das reservas no Firestore.
- Usar cache em memoria apenas como acelerador, nao como fonte unica de regra
  critica.
- Desenvolver a PWA depois que os endpoints principais do backend estiverem
  definidos.

## Fases e progresso

| Fase | Status | Objetivo | Entregaveis principais |
| --- | --- | --- | --- |
| 1. Backend base | Concluida | Criar base Node.js/TypeScript | Health check, carregamento de env externo, logs sem segredos, estrutura minima |
| 2. Login SUAP | Parcial | Implementar OAuth/SUAP no backend | Callback server-side, `/api/eu/`, usuario local, sessao da aplicacao |
| 3. Modelo local | Parcial | Modelar dominio principal | Usuarios, perfis, ambientes, chaves, vinculos, movimentacoes, ocorrencias |
| 4. Reservas locais | Parcial | Validar contrato sem depender do SUAP | `LocalReservationProvider`, fixture sanitizada, API interna de reservas |
| 5. Raspagem SUAP read-only | Parcial | Coletar reservas autorizadas da interface web | URLs-alvo configuraveis, Playwright, `SuapWebReadOnlyReservationProvider`, parser, normalizacao |
| 6. Persistencia e sync | Parcial | Manter copia estruturada e atualizada | Firestore, cache TTL, sync manual/agendado, eventos de sincronizacao, backoff |
| 7. Regras de chaves | Parcial | Usar reservas para operacao da portaria | Bloqueio 30 min antes, conflitos, dados desatualizados, auditoria |
| 8. Frontend/PWA | Pendente | Construir interface operacional | Login, dashboard portaria, chaves, salas, retirada/devolucao, reservas |
| 9. Hardening operacional | Pendente | Preparar operacao na VM | PM2, scripts, validacoes, monitoramento, feature flags, documentacao final |

## Detalhamento das fases

### Fase 1: Backend base

- Criar `backend/package.json`, TypeScript e servidor HTTP.
- Implementar `GET /health`.
- Carregar configuracao a partir de `/etc/keychain-ifbaps/.env`.
- Criar `.env.example` sem valores reais.
- Garantir que logs nao imprimam segredos.

Progresso: concluida base inicial com Node.js/TypeScript, scripts de build,
typecheck e testes, `backend/ecosystem.config.js`, carregamento seguro de env
externo e health check validado por smoke test local.

### Fase 2: Login SUAP

- Implementar `GET /auth/suap/login`.
- Implementar `GET /auth/suap/callback`.
- Trocar `code` por token em `/o/token/`.
- Consultar `/api/eu/`.
- Criar ou atualizar usuario local.
- Criar sessao propria da aplicacao.

Progresso: o fluxo foi validado manualmente com callback temporario em
`localhost:3010`, troca de `code` por token e consulta bem-sucedida ao
`/api/eu/`.

Progresso adicional: implementada base backend com `GET /auth/suap/login`,
`GET /auth/suap/callback`, `GET /auth/session` e `POST /auth/logout`. O backend
troca o `code` no servidor, consulta `/api/eu/`, cria sessao HTTP-only da
aplicacao e atribui perfis por `AUTH_ADMIN_IDENTIFIERS` e
`AUTH_PORTARIA_IDENTIFIERS`.

Progresso adicional: o callback OAuth/SUAP agora cria ou atualiza usuario local
da aplicacao em `USER_STORE=memory|firestore`, sem salvar token OAuth. O backend
tambem possui `GET /api/users` protegido por perfil `admin`.

Pendencias: ativar `AUTH_MODE=session` na VM quando o callback estiver alinhado
com a aplicacao registrada no SUAP, definir URL de producao e avaliar
persistencia de sessoes caso exista mais de uma instancia do backend.

### Fase 3: Modelo local

- Definir entidades de usuario, perfil, sala, chave, vinculo sala-chave,
  movimentacao, historico e ocorrencia.
- Definir perfis iniciais: usuario, portaria e administrador.
- Definir regras de autorizacao no backend.

Progresso: implementado catalogo local inicial para salas, chaves e vinculos,
com stores `memory` e `firestore`, endpoints `GET/POST /api/rooms`,
`GET/POST /api/keys`, `GET/POST /api/key-room-links` e
`GET /api/key-catalog`. Esse catalogo ja e usado pela disponibilidade de chaves
quando possui chaves cadastradas.

Progresso adicional: implementadas movimentacoes iniciais de retirada e
devolucao com stores `memory` e `firestore`, endpoint
`GET /api/key-movements`, retirada em
`POST /api/key-movements/withdrawals` e devolucao em
`POST /api/key-movements/returns`.

Progresso adicional: implementada camada inicial de autorizacao com perfis
`usuario`, `portaria` e `admin`, permissoes backend e `AUTH_MODE` configuravel
como `disabled`, `trusted-header` ou `session`.

Progresso adicional: implementado cadastro inicial de usuarios autenticados pelo
SUAP com stores `memory` e `firestore`, colecao configuravel
`FIRESTORE_USERS_COLLECTION` e listagem administrativa.

Pendencias: gestao administrativa completa de perfis, ocorrencias e refinamento
do historico operacional por perfil.

### Fase 4: Reservas locais

- Definir modelo normalizado de reserva.
- Criar `ReservationProvider`.
- Implementar `LocalReservationProvider`.
- Criar fixtures JSON sem dados reais.
- Criar API interna para listar reservas por periodo, sala e status.

Progresso: contrato `ReservationProvider`, modelo normalizado, fingerprint
deterministico, provider local e endpoints `GET /api/reservations` e
`POST /api/reservations/sync` implementados. Ainda falta persistencia real,
fixtures externas e regras de upsert/cancelamento.

### Fase 5: Raspagem SUAP read-only

- Implementar `SuapWebReadOnlyReservationProvider`.
- Usar credenciais/sessao externas em `/etc/keychain-ifbaps`.
- Acessar somente paginas de reserva autorizadas.
- Extrair sala, data, horario, responsavel, finalidade e situacao.
- Normalizar os dados para o modelo interno.
- Nunca criar, alterar ou cancelar reservas no SUAP.
- Nunca persistir HTML bruto, cookies ou tokens.

Progresso: identificadas duas familias de URLs para avaliacao: relatorio geral
`/comum/sala/reservasala_relat/` e paginas por sala
`/comum/sala/solicitar_reserva/<sala_id>/`. O backend ja aceita essas URLs por
configuracao externa e publica apenas contadores/booleans no health check, sem
expor os alvos completos.

Filtro inicial observado no relatorio: periodo mensal, horario `07:00` a
`17:00`, `campus=27` e `situacao=deferida`. Esse filtro deve virar janela
dinamica de sincronizacao, nao valor fixo do codigo. A janela operacional nao
deve raspar passado: deve iniciar sempre na data atual e seguir por quantidade
configuravel de dias futuros.

Tambem foi observado que a listagem pode retornar centenas de itens com
paginacao. O parser inicial ja cobre linhas sanitizadas do relatorio e dois
formatos de periodo exibidos pelo SUAP.

Progresso adicional: implementado cliente Playwright server-side para login,
abertura do relatorio futuro, extracao de tabela e paginacao read-only. O
provider SUAP web agora sincroniza para cache em memoria quando habilitado por
flag. Ainda falta teste operacional contra o SUAP real, persistencia Firestore,
agendamento e tratamento robusto de falhas.

Teste operacional controlado: em 28/07/2026, com provider `web-readonly`
habilitado apenas por variavel de processo temporaria, o sync acessou a janela
futura do relatorio, visitou 1 pagina e normalizou 20 reservas. O teste foi
resumido apenas por contadores, sem imprimir nomes de solicitantes ou linhas de
reserva.

### Fase 6: Persistencia e sincronizacao

- Persistir reservas normalizadas no Firestore.
- Gerar `reservationId` por `externalId` ou `fingerprint`.
- Fazer upsert idempotente.
- Detectar novas reservas, alteracoes e ausencias.
- Confirmar cancelamentos somente apos sincronizacoes sucessivas.
- Registrar eventos de sincronizacao com contadores.
- Usar cache em memoria com TTL curto.

Progresso: implementado `ReservationStore` com `memory` e `firestore`,
persistencia das reservas na colecao `reservations`, eventos em
`reservation_sync_events`, upsert idempotente por `externalId`, deteccao de
alteracoes por `fingerprint`, marcacao inicial de ausencias como
`suspect_absent`, confirmacao posterior como `absent` por
`RESERVATION_ABSENCE_CONFIRMATION_SYNCS` e cache TTL no provider. Em teste
operacional controlado, a primeira sincronizacao gravou 20 reservas no Firestore
e a segunda sincronizacao retornou 20 `unchanged`, sem recriar documentos.

Progresso adicional: implementado scheduler interno opcional com intervalo
configuravel, backoff exponencial em falhas, endpoint
`GET /api/reservations/sync/status` e retencao inicial de eventos de sync.

Pendencias: politica final de monitoramento e tratamento operacional dos estados
`suspect_absent`/`absent` nas regras de chave.

### Fase 7: Regras de chaves

- Relacionar reserva normalizada ao ambiente local.
- Relacionar ambiente local a chave fisica.
- Bloquear chave 30 minutos antes da reserva.
- Sinalizar conflitos e reservas sobrepostas.
- Manter auditoria de bloqueios, liberacoes e ajustes administrativos.
- Nao liberar chave automaticamente quando a sincronizacao falhar.

Progresso: iniciado `GET /api/keys/availability`, que calcula disponibilidade
de chaves usando o catalogo local quando houver chaves cadastradas. Se o
catalogo local estiver vazio, usa um catalogo temporario e dinamico derivado de
todas as salas presentes nas reservas normalizadas. A06, C02 ou qualquer outra
sala sao apenas exemplos de linhas retornadas pelo SUAP; o backend deve tratar
qualquer sala do relatorio paginado, sem lista fixa no codigo. A regra atual
bloqueia chaves disponiveis 30 minutos antes de reservas ativas, alteradas ou em
conflito, e ignora reservas canceladas ou ausentes.

Progresso adicional: a retirada usa a disponibilidade calculada para impedir
retirada de chave indisponivel ou bloqueada por reserva; a devolucao fecha a
retirada aberta e libera o estado base da chave. Cada registro guarda
responsavel, operador, horarios e observacoes opcionais.

Progresso adicional: implementados `GET /api/key-occurrences` e
`POST /api/key-occurrences` para registrar ocorrencias e ajustes auditaveis. O
registro guarda estado anterior, operador, horario, origem e observacao; quando
`targetStatus` e informado, altera o estado base da chave. Bloqueio por reserva
continua derivado e nao pode ser gravado manualmente.

Pendencias: implementar auditoria explicita automatica de bloqueio/liberacao por
reserva, regras operacionais finais para atraso, politica de exibicao de dados
pessoais por perfil e telas PWA de ocorrencias.

### Fase 8: Frontend/PWA

- Implementar login e estado autenticado.
- Criar dashboard operacional da portaria.
- Criar consulta de chaves, salas e reservas.
- Criar fluxos de retirada, devolucao e ocorrencia.
- Mostrar dados pessoais conforme perfil e politica de privacidade.

### Fase 9: Hardening operacional

- Adicionar testes automatizados do backend.
- Validar parser com fixtures sanitizadas.
- Adicionar scripts de restart/sync quando existirem.
- Configurar PM2.
- Adicionar feature flag para desligar raspagem.
- Documentar operacao e recuperacao de falhas.

## Proximo passo recomendado

Ativar e testar `AUTH_MODE=session` na VM com a aplicacao registrada no SUAP.
Depois, adicionar ocorrencias e fluxos administrativos para manutencao, perda,
dano e atraso.

## Pendencias externas

- Formalizar autorizacao institucional para leitura web read-only das reservas.
- Confirmar se existe endpoint oficial de reservas e quais escopos seriam
  necessarios.
- Definir URL publica de callback OAuth em producao.
- Definir politica final de exibicao de dados pessoais.
- Definir janela e frequencia final de sincronizacao.
- Resolver ou aceitar formalmente as vulnerabilidades transitivas apontadas por
  `npm audit --omit=dev` na cadeia do `firebase-admin`; `npm audit fix` sem
  `--force` nao corrigiu sem downgrade/breaking change.
