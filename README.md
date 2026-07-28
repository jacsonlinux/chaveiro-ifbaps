# Sistema Web de Controle de Chaves IFBA/IFBAPS

Sistema para digitalizar o controle de retirada, devolucao, disponibilidade,
ocorrencias e historico de chaves da portaria do IFBA Campus Porto Seguro.

O principio central do projeto e:

> O SUAP gerencia a reserva do ambiente. O Sistema de Controle de Chaves
> gerencia a movimentacao fisica e operacional da chave.

## Situacao atual

Este repositorio saiu da fase apenas documental e possui uma base inicial de
backend em Node.js/TypeScript.

Ja existe:

- Servidor HTTP do backend.
- `GET /health` com configuracao publica sem valores secretos.
- Contrato normalizado de reservas.
- `LocalReservationProvider` com fixture sanitizada para estabilizar a API.
- Provider SUAP web read-only com Playwright, parser, paginacao, cache e
  sincronizacao autorizada ativa na VM.
- Persistencia opcional das reservas no Firestore.
- Agendador opcional de sincronizacao com backoff.
- Disponibilidade provisoria de chaves derivada das reservas sincronizadas.
- Catalogo local inicial de salas, chaves e vinculos com store `memory` ou
  `firestore`.
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
- Edicao controlada de salas e chaves sem alterar IDs historicos.
- Desativacao e reativacao logica de salas, chaves e vinculos, preservando
  historico.
- Busca e filtro por estado no catalogo administrativo da PWA para salas,
  chaves e vinculos.
- Frontend/PWA Angular inicial com tela operacional da portaria, login Firebase,
  disponibilidade, retirada, devolucao, ocorrencias, relatorios e Firebase
  Hosting em `https://keychain-ifbaps.web.app`.
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
Firebase Web SDK. O login Firebase ainda requer validacao interativa no
navegador, e as operacoes de retirada/devolucao dependem do cadastro fisico
real. A sincronizacao read-only do SUAP esta implementada e ativa na VM. A URL
publica da PWA no Firebase Hosting ja esta definida como
`https://keychain-ifbaps.web.app`.

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
2. Cadastro de ambientes.
3. Cadastro de chaves.
4. Vinculo entre ambiente e chave.
5. Tela operacional da portaria.
6. Registro de retirada.
7. Registro de devolucao.
8. Historico de movimentacoes.
9. Registro de ocorrencias.
10. Estrutura preparada para consultar reservas do SUAP.

Enquanto o cadastro local completo de salas e chaves nao existir, o sistema pode
usar uma disponibilidade provisoria baseada em todas as salas encontradas nas
reservas sincronizadas. Essa lista nao deve ser tratada como catalogo oficial:
ela serve para validar a regra de bloqueio sem limitar o sistema a exemplos como
A06 ou C02.

O backend tambem ja possui um catalogo local inicial para cadastrar salas,
chaves e vinculos, com persistencia opcional em Firestore. Quando esse catalogo
tiver chaves cadastradas, a disponibilidade passa a usar os dados locais e usa
as reservas do SUAP apenas para calcular bloqueios.

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
Sistema registra responsavel, chave, ambiente e horario
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
- Concentra leitura read-only controlada das reservas SUAP; o OAuth legado fica
  isolado e nao participa do login da PWA.
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
- [docs/catalogo-fisico.md](docs/catalogo-fisico.md): roteiro de cadastro e
  validacao das salas, chaves e vinculos reais.
- [AGENTS.md](AGENTS.md): orientacoes operacionais para agentes e contribuidores.

## Pendencias de decisao

1. Validar em navegador o fluxo `AUTH_MODE=firebase` configurado na VM.
2. Confirmar se existe endpoint oficial para reservas de ambientes no futuro.
3. Definir URL de callback de producao somente se o OAuth/SUAP legado voltar a
   ser utilizado.
4. Definir politica de privacidade para exibicao do usuario responsavel por uma
   chave.
5. Manter a autorizacao institucional para leitura automatizada read-only da
   interface web de reservas do SUAP registrada e revisada.
6. Definir janela e frequencia final de sincronizacao das reservas.
7. Definir se o acesso sera apenas na rede interna ou tambem externo.
8. Validar no navegador o login Google, as Security Rules e as operações de
   retirada/devolução após o cadastro físico.
