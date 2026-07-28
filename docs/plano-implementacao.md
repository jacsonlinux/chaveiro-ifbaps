# Plano de Implementacao

Plano resumido para sair da fase documental e iniciar a implementacao do sistema
de controle de chaves IFBA/IFBAPS.

## Estado atual

```text
Status geral: implementacao iniciada
Backend: base inicial implementada
Frontend: nao iniciado
Login SUAP OAuth: validado tecnicamente em teste manual
Reservas SUAP por API oficial: endpoint ainda nao confirmado
Reservas SUAP por leitura web: estrategia adotada como fallback read-only
Firestore: previsto, ainda nao implementado
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
| 3. Modelo local | Pendente | Modelar dominio principal | Usuarios, perfis, ambientes, chaves, vinculos, movimentacoes, ocorrencias |
| 4. Reservas locais | Parcial | Validar contrato sem depender do SUAP | `LocalReservationProvider`, fixture sanitizada, API interna de reservas |
| 5. Raspagem SUAP read-only | Parcial | Coletar reservas autorizadas da interface web | URLs-alvo configuraveis, `SuapWebReadOnlyReservationProvider`, login web, parser, normalizacao |
| 6. Persistencia e sync | Pendente | Manter copia estruturada e atualizada | Firestore, cache TTL, sync agendado/manual, eventos de sincronizacao |
| 7. Regras de chaves | Pendente | Usar reservas para operacao da portaria | Bloqueio 30 min antes, conflitos, dados desatualizados, auditoria |
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

### Fase 3: Modelo local

- Definir entidades de usuario, perfil, sala, chave, vinculo sala-chave,
  movimentacao, historico e ocorrencia.
- Definir perfis iniciais: usuario, portaria e administrador.
- Definir regras de autorizacao no backend.

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
dinamica de sincronizacao, nao valor fixo do codigo.

Tambem foi observado que a listagem pode retornar centenas de itens com
paginacao. O parser inicial ja cobre linhas sanitizadas do relatorio e dois
formatos de periodo exibidos pelo SUAP.

### Fase 6: Persistencia e sincronizacao

- Persistir reservas normalizadas no Firestore.
- Gerar `reservationId` por `externalId` ou `fingerprint`.
- Fazer upsert idempotente.
- Detectar novas reservas, alteracoes e ausencias.
- Confirmar cancelamentos somente apos sincronizacoes sucessivas.
- Registrar eventos de sincronizacao com contadores.
- Usar cache em memoria com TTL curto.

### Fase 7: Regras de chaves

- Relacionar reserva normalizada ao ambiente local.
- Relacionar ambiente local a chave fisica.
- Bloquear chave 30 minutos antes da reserva.
- Sinalizar conflitos e reservas sobrepostas.
- Manter auditoria de bloqueios, liberacoes e ajustes administrativos.
- Nao liberar chave automaticamente quando a sincronizacao falhar.

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

Avancar para a Fase 5 de forma controlada: criar fixtures sanitizadas da pagina
de reservas do SUAP, implementar parser sem depender de dados reais e somente
depois adicionar automacao web read-only com Playwright/Puppeteer. Em paralelo,
preparar a Fase 6 com persistencia Firestore e cache TTL.

## Pendencias externas

- Formalizar autorizacao institucional para leitura web read-only das reservas.
- Confirmar se existe endpoint oficial de reservas e quais escopos seriam
  necessarios.
- Definir URL publica de callback OAuth em producao.
- Definir politica final de exibicao de dados pessoais.
- Definir janela e frequencia final de sincronizacao.
