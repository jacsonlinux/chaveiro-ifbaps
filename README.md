# Chaveiro Digital - IFBA Campus Porto Seguro

Sistema para digitalizar o controle de retirada, devolucao, disponibilidade,
ocorrencias e historico de chaves da portaria do IFBA Campus Porto Seguro.
Todo o escopo atual da raspagem, da copia no Firestore e da PWA corresponde ao
Campus Porto Seguro, identificado no SUAP como `PS` e filtrado atualmente por
`campus=27`.

O principio central do projeto e:

> O SUAP gerencia a reserva do ambiente. O Chaveiro Digital
> gerencia a movimentacao fisica e operacional da chave.

## Situacao atual

Este repositorio saiu da fase apenas documental e possui uma base inicial de
backend em Node.js/TypeScript.

Ja existe:

- Servidor HTTP do backend.
- `GET /health` com configuracao publica sem valores secretos.
- Contrato normalizado de ocupacoes (`occupancies`) como fonte operacional para
  unificar aulas nativas e reservas SUAP.
- `LocalReservationProvider` com fixture sanitizada para estabilizar a API.
- Provider SUAP web read-only com Playwright, parser, paginacao, cache e
  sincronizacao autorizada ativa na VM para reservas. O parser preserva o link
  `Visualizar`, extrai `requestExternalId` e usa identificador mais estavel por
  solicitacao/data quando disponivel.
- URL administrativa do SUAP identificada e validada para leitura de todas as
  salas agendaveis do campus Porto Seguro.
- Persistencia das reservas no Firestore com projecao em `occupancies`; a
  disponibilidade operacional do backend ja usa `occupancies` como fonte
  principal e mantem `reservations` como fallback de compatibilidade.
- Agendador opcional de sincronizacao com backoff.
- Disponibilidade de chaves calculada a partir das ocupacoes sincronizadas. A
  configuracao antiga de bloqueio antecipado fica apenas como compatibilidade; a
  regra aplicada no backend e cronologica, no intervalo real da ocupacao.
- Projecao de salas e chaves no Firestore, gerada pelo worker e somente leitura
  para a PWA.
- Movimentacoes iniciais de retirada/devolucao com historico auditavel e store
  `memory` ou `firestore`.
- Consulta de historico de movimentacoes por periodo de retirada ou devolucao,
  chave, sala e status.
- Ocorrencias e ajustes de estado de chave com historico auditavel e store
  `memory` ou `firestore`.
- Consulta de historico de ocorrencias por periodo, chave, sala e tipo.
- Relatorio operacional resumido de retiradas, devolucoes, atrasos e
  ocorrencias.
- Camada inicial de autorizacao por perfis, com modo temporario
  `trusted-header`.
- Base de Firebase Authentication para a PWA, com allowlist de e-mails e
  validacao server-side pelo Firebase Admin.
- Limpeza administrativa de sessoes expiradas da aplicacao, sem expor cookies ou
  dados sensiveis, disponivel tambem na PWA para `admin`.
- Registro local inicial de usuarios autenticados pelo SUAP, com store
  `memory` ou `firestore`.
- Ajuste administrativo inicial de perfis de usuario no backend e na PWA, com
  busca e filtro por perfil aplicados tambem no endpoint administrativo.
- Projecao automatica atual de salas e chaves derivada do SUAP, sem cadastro
  manual na PWA; a leitura da listagem completa de salas foi validada e amplia a
  cobertura para salas sem reserva futura. A projecao preserva codigo
  operacional da sala, campus/predio, `active`, `schedulable`, `scheduleUrl` e
  ordenacao natural.
- Normalizador inicial da agenda da sala do SUAP
  (`/comum/sala/solicitar_reserva/{id}/`) para transformar aulas/ocupacoes
  exibidas no calendario em `occupancies` futuras, com classificacao
  conservadora entre `aula_regular`, `evento` e `outro`. A conexao com o
  Playwright esta habilitada de forma controlada no PM2 para as 34 salas do
  Campus Porto Seguro, com janela futura de 7 dias e sem escrita no SUAP.
- Frontend/PWA Angular inicial com tela operacional da portaria, login Firebase,
  disponibilidade, retirada, devolucao, ocorrencias, relatorios e Firebase
  Hosting em `https://keychain-ifbaps.web.app`.
- Pagina autenticada de consulta publica somente leitura, onde usuarios Google
  autenticados visualizam se a chave esta disponivel na portaria ou retirada.
- Atualizacao em tempo real na PWA via listeners do Firestore para
  disponibilidade, reservas e movimentacoes, refletindo retiradas/devolucoes
  entre portaria e consulta publica sem recarregar a pagina.
- A operacao da portaria consulta `occupancies` diretamente para montar a
  agenda do dia e calcular o bloqueio somente no intervalo real
  `startsAt <= agora < endsAt`; `reservations` permanece para diagnostico
  administrativo durante a migracao.
- Retirada avulsa em lote na PWA da portaria, permitindo vincular varias
  chaves disponiveis a uma mesma pessoa em uma unica operacao auditavel.
- Resumo visual de estados das reservas, status seguro e ultimos eventos de
  sincronizacao na PWA.
- Painel operacional de detalhe da chave selecionada na PWA, com status, salas
  vinculadas, reserva bloqueadora e alerta de reserva `suspect_absent` quando
  existir.
- `AUTH_MODE=firebase` configurado na VM para validar a identidade da PWA; o
  SUAP permanece isolado como fonte de reservas.
- Testes automatizados basicos do backend.

A migracao da PWA para o acesso direto ao Firestore ja foi implementada e
publicada, com Security Rules, Firebase Authentication e leitura/escrita pelo
Firebase Web SDK. A tela de login, a allowlist e o smoke test sem sessao foram
validados; a validacao autenticada dos fluxos operacionais na publicacao atual
esta pendente e segue o roteiro em `docs/validacao-manual.md`. A sincronizacao
read-only do SUAP esta implementada e ativa na VM. A URL publica da PWA no
Firebase Hosting ja esta definida como `https://keychain-ifbaps.web.app`.

Diretorio atual de trabalho:

```text
/opt/keychain-ifbaps
```

Estrutura alvo recomendada para o projeto:

```text
/opt/keychain-ifbaps
|-- backend/
|-- frontend/
|-- docs/
|-- scripts/
|-- README.md
|-- AGENTS.md
`-- .gitignore
```

Nao ha necessidade de criar pastas `dev/`, `production/` ou `deploy/` no
repositorio neste momento. A separacao de ambiente deve ser feita por
configuracao e processo de publicacao.

Arquivos sensiveis ficam fora do repositorio:

```text
/etc/keychain-ifbaps/.env
/etc/keychain-ifbaps/keychain-ifbaps-firebase-adminsdk-fbsvc-9a18ddb436.json
```

Esses arquivos nao devem ser copiados, impressos em logs ou versionados.

## Escopo inicial

O MVP deve funcionar sem permitir escrita no SUAP. A autenticacao da PWA usa
Firebase Authentication; o scraper de reservas e uma integracao server-side
separada e read-only.

Prioridades:

1. Autenticacao e perfis de acesso.
2. Tela operacional da portaria.
3. Registro de retirada.
4. Registro de devolucao.
5. Retirada avulsa individual ou em lote.
6. Consulta publica autenticada e somente leitura.
7. Historico de movimentacoes.
8. Registro de ocorrencias.
9. Sincronizacao read-only de salas, aulas nativas e reservas do SUAP.

O worker projeta no Firestore todas as salas agendáveis retornadas pela
listagem administrativa do SUAP para o Campus Porto Seguro (`PS`), inclusive as
que não possuem reserva futura. Essa projeção é somente leitura para a PWA e
não representa um cadastro manual.

## Fluxos principais

### Com reserva no SUAP

```text
Usuario faz reserva de sala no SUAP
        |
Sistema consulta a reserva
        |
Reserva e vinculada ao ambiente e a chave local
        |
Chave fica protegida para o responsavel da reserva
        |
Portaria registra retirada e devolucao
```

### Sem reserva

```text
Usuario vai a portaria
        |
Porteiro consulta chaves disponiveis
        |
Porteiro registra retirada direta
        |
Sistema registra responsavel, uma ou mais chaves, ambientes e horarios
        |
Porteiro registra devolucao
```

## Arquitetura prevista

```text
SUAP web
  -> Backend worker Node.js/TypeScript na VM via PM2
  -> Firestore/Firebase
  -> Angular PWA no Firebase Hosting
```

O frontend nao deve acessar segredos, service account, `client_secret` ou
credenciais administrativas. A PWA nao acessa o SUAP nem depende de uma API
propria; usa Firebase Authentication e Firestore Security Rules. O worker usa
Firebase Admin SDK somente para sincronizar os dados.

## Execucao e publicacao

Backend:

- Roda na VM.
- Gerenciado por PM2.
- Le configuracoes privadas em `/etc/keychain-ifbaps`.
- Executa o worker de scraping e sincronizacao na VM.
- Concentra leitura read-only controlada de salas, opcoes administrativas,
  reservas e ocupacoes SUAP; o OAuth legado fica isolado e nao participa do
  login da PWA.
- Base inicial disponivel em `backend/`.

Frontend:

- Aplicacao Angular/PWA.
- Build estatico publicado no Firebase Hosting em
  `https://keychain-ifbaps.web.app`.
- Nao possui segredos administrativos.
- Consulta e grava dados operacionais diretamente no Firestore por meio do
  Firebase Web SDK, respeitando Security Rules.
- Base inicial disponivel em `frontend/`.

## Documentacao

- [docs/arquitetura.md](docs/arquitetura.md): arquitetura, regras de negocio,
  estrutura alvo, perfis, estados e integracao SUAP.
- [docs/plano-implementacao.md](docs/plano-implementacao.md): fases de
  implementacao, progresso e pendencias.
- [docs/fluxos-e-modelo.md](docs/fluxos-e-modelo.md): fluxogramas, fontes do
  SUAP e estrutura das colecoes Firestore.
- [docs/diagramas.md](docs/diagramas.md): diagramas oficiais da arquitetura,
  sincronizacao, operacao, estados, Firestore, autenticacao e regras.
- [docs/revisao-suap-novo-acesso.md](docs/revisao-suap-novo-acesso.md):
  diagnostico das fontes SUAP com o novo acesso institucional e plano de
  evolucao do scraping.
- [docs/plano-refatoracao-ocupacoes-cronologicas.md](docs/plano-refatoracao-ocupacoes-cronologicas.md):
  plano em fases para refatorar ocupacoes, bloqueio cronologico e retirada
  avulsa.
- [docs/politicas-de-negocio.md](docs/politicas-de-negocio.md): politicas de
  negocio do mundo real aplicadas a operacao da portaria.
- [docs/plano-qr-code.md](docs/plano-qr-code.md): proposta para revisao de
  identificacao na retirada de chaves por QR Code (celular do usuario) e senha
  numerica no teclado fisico da portaria.
- [docs/validacao-manual.md](docs/validacao-manual.md): roteiro de validacao dos
  perfis e das movimentacoes.
- [AGENTS.md](AGENTS.md): orientacoes operacionais para agentes e contribuidores.

## Pendencias de decisao

1. Monitorar a cobertura e mudanças de layout da listagem de salas do SUAP.
2. Confirmar se existe endpoint oficial para reservas de ambientes no futuro.
3. Definir URL de callback de producao somente se o OAuth/SUAP legado voltar a
   ser utilizado.
4. Manter revisada a politica de privacidade da consulta publica: exibir apenas
   o nome da pessoa que esta com a chave retirada, sem matricula, e-mail ou
   dados do operador.
5. Manter a autorizacao institucional para leitura automatizada read-only da
   interface web de reservas do SUAP registrada e revisada.
6. Definir cadencia final por fonte de raspagem: reservas/ocupacoes continuas,
   salas em baixa frequencia/manual e aulas nativas conforme fonte confirmada.
7. Definir se o acesso sera apenas na rede interna ou tambem externo.
8. Validar a cobertura de todas as salas após a nova sincronização automática.
9. Tratar suporte a outros campi somente como decisao futura explicita; o
   produto atual e do Campus Porto Seguro (`PS`).
