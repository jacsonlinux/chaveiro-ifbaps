# Plano de Implementacao

Plano atualizado para o sistema complementar de controle de chaves do IFBA
Campus Porto Seguro.

## Objetivo aprovado

Construir uma PWA Angular minimalista para a portaria, alimentada por uma API
propria que mantem no Firestore uma copia read-only das reservas futuras
obtidas por scraping autorizado do SUAP. A PWA relaciona reservas, salas e
chaves fisicas para controlar retiradas e devolucoes.

O SUAP continua sendo o sistema oficial de reservas. Servidores, alunos e
demais usuarios continuam solicitando, deferindo e acompanhando reservas no
SUAP. O nosso sistema nao cria, altera, cancela ou aprova reservas.

## Arquitetura definitiva

```text
SUAP oficial
  -> backend Playwright read-only
  -> normalizacao e deduplicacao
  -> cache em memoria
  -> Firestore (copia estruturada)
  -> API propria
  -> PWA Angular da portaria
  -> retirada e devolucao de chaves
```

Responsabilidades:

- Firebase Authentication: autenticar operadores da PWA.
- Backend: validar tokens, autorizar operacoes, aplicar regras de chaves,
  executar scraping e acessar Firestore.
- Firestore: persistir reservas sincronizadas, catalogo e historico operacional.
- SUAP: permanecer como fonte oficial e imutavel das reservas.
- PWA: apresentar a operacao e enviar comandos ao backend; nao acessar SUAP ou
  Firestore diretamente.

## Estado atual

```text
Backend HTTP: implementado
Stores Firestore: implementados para reservas, catalogo e movimentos
Scraping Playwright: ativo na VM em modo web-readonly, com janela futura
Cache/sync: ativos; a ultima sincronizacao validada persistiu 20 reservas sem falhas
Firebase Authentication: implementado no backend e na PWA, aguardando validacao
interativa do provedor Google no navegador
PWA Angular: base funcional existente, UX de portaria em reorganizacao
Angular Material: dependencias adicionadas, telas ainda em migracao
Skill de UX da portaria: criada
Deploy PWA: https://keychain-ifbaps.web.app
Backend publico: ainda nao definido; a PWA publicada serve a interface, mas a
operacao completa ainda depende dessa URL
Progresso tecnico revisado: em andamento; nao considerar o plano concluido
```

## Fases

| Fase | Status | Resultado esperado |
| --- | --- | --- |
| 1. Limpeza arquitetural | Concluida | Fronteiras entre SUAP, backend, Firestore e PWA definidas |
| 2. Autenticacao da PWA | Parcial | Firebase Auth, allowlist e verificacao server-side implementados |
| 3. Contratos e persistencia | Parcial | Firestore para reservas, salas, chaves e movimentos |
| 4. Scraping read-only | Parcial | Fonte futura, paginação e parser implementados; cobertura ampliada pendente |
| 5. Sincronizacao | Parcial | Scheduler, cache, upsert, eventos e lote Firestore ativos |
| 6. Regras sala-chave | Parcial | Relacionar reserva a sala e chave fisica sem dados ficticios em producao |
| 7. PWA da portaria | Em reorganizacao | Tela principal simples, acoes rapidas e historico secundario |
| 8. Operacao e deploy | Pendente | Backend publico, CORS, monitoramento, testes de ponta a ponta |

## Fase 1: limpeza arquitetural

- Manter o SUAP fora do fluxo de usuarios da PWA.
- Manter credenciais SUAP somente no backend e fora do repositorio.
- Manter o provider de reservas substituivel por API oficial no futuro.
- Remover ou deixar explicitamente legado o fluxo OAuth/SUAP de login da PWA.
- Usar `keychain-ux-portaria-minimal` para orientar as telas operacionais.

Progresso: fronteiras registradas na arquitetura, fluxo legado SUAP isolado do
login da PWA e skill de UX criada.

## Fase 2: autenticacao Firebase

- Usar Firebase Authentication com provedor Google.
- Aceitar inicialmente somente `AUTH_ALLOWED_EMAILS`.
- Exigir e-mail verificado.
- Enviar ID token no cabecalho `Authorization`.
- Validar o token com Firebase Admin no backend.
- Atribuir `portaria` por `AUTH_DEFAULT_ROLES`; manter `admin` controlado.
- Persistir usuario e ultimo login no Firestore.

Progresso: backend possui modo `AUTH_MODE=firebase`, verificador Firebase Admin,
allowlist e frontend com Firebase Web SDK, login Google e interceptor de token.
Testes automatizados do verificador e do CORS existem. Falta validar o provedor
Google no console Firebase com um navegador e confirmar o fluxo completo na PWA.

## Fase 3: dados e API

Colecoes principais:

```text
rooms
keys
key_room_links
reservations
key_movements
key_occurrences
users
reservation_sync_events
```

Regras:

- `reservations` e uma copia read-only do SUAP.
- `key_room_links` relaciona a chave fisica a uma sala local.
- O estado efetivo da chave combina estado local, retirada aberta e reserva
  bloqueadora.
- O frontend consome endpoints da API; nao consulta Firestore diretamente.
- Dados pessoais de reservas sao filtrados pelo backend conforme o papel.

Progresso: contratos, stores e endpoints principais ja existem. Falta revisar
o endpoint agregado da tela principal para entregar sala, chave, status,
retirada aberta e reserva relacionada de forma otimizada.

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
sanitizadas existem. A VM ainda usa `SUAP_RESERVATION_PROVIDER=local`; a
ativacao fica bloqueada ate confirmar a conta autorizada para automacao.

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
- Dividir batches Firestore para respeitar o limite de operacoes.

Progresso: store, TTL, eventos, scheduler, backoff e batches fragmentados
existem. A VM foi validada com uma sincronizacao real de 20 reservas, zero
falhas e janela futura. Falta validar paginação com volume maior e fechar a
politica operacional de dados stale.

## Fase 6: relacao reserva, sala e chave

- A sala e a unidade de integracao entre SUAP e chave fisica.
- Reservas sincronizadas podem bloquear uma chave vinculada na janela definida.
- O catalogo provisoriamente derivado serve apenas para testes.
- Em producao, salas e chaves devem estar cadastradas e vinculadas no catalogo
  Firestore.
- A tela deve indicar conflito ou reserva desatualizada sem ocultar o estado
  fisico da chave.

Progresso: regra de bloqueio e catalogo local existem. Falta validar o catalogo
real de todas as salas e cadastrar os vinculos fisicos antes da operacao.

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

Progresso: base funcional existe, login Firebase e componentes Angular Material
iniciais foram integrados. Falta concluir a simplificação da tela principal,
validar ações de portaria em navegador e revisar responsividade.

## Fase 8: operacao e deploy

- Confirmar provedor Google no Firebase Authentication.
- Definir URL HTTPS publica do backend e atualizar o runtime da PWA; enquanto
  isso nao ocorrer, validar a operacao por tunel SSH e Angular local.
- Configurar `CORS_ALLOWED_ORIGINS` somente com origens autorizadas.
- Configurar runtime public da PWA sem segredos.
- Manter scraping somente com a conta institucional autorizada já confirmada.
- Ativar PM2 e scheduler apos smoke test.
- Testar login, lista de chaves, retirada, devolucao, reserva bloqueadora e
  falha de sincronizacao.
- Publicar somente depois de `npm run check`, build Angular, higiene de segredos
  e `git diff --check`.

## Bloqueios e decisoes pendentes

- Confirmar no navegador o login Google da PWA e o acesso da conta autorizada.
- Confirmar que o provedor Google esta habilitado no Firebase.
- Definir URL publica do backend.
- Cadastrar salas e chaves fisicas e seus vinculos.
- Definir janela e frequencia final da sincronizacao.
- Formalizar politica de exibicao de dados pessoais.
