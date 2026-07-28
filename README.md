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
  sincronizacao futura autorizada.
- Persistencia opcional das reservas no Firestore.
- Agendador opcional de sincronizacao com backoff.
- Disponibilidade provisoria de chaves derivada das reservas sincronizadas.
- Catalogo local inicial de salas, chaves e vinculos com store `memory` ou
  `firestore`.
- Movimentacoes iniciais de retirada/devolucao com historico auditavel e store
  `memory` ou `firestore`.
- Consulta de historico de movimentacoes por periodo, chave, sala e status.
- Ocorrencias e ajustes de estado de chave com historico auditavel e store
  `memory` ou `firestore`.
- Camada inicial de autorizacao por perfis, com modo temporario
  `trusted-header`.
- Base de login OAuth/SUAP no backend com callback server-side e sessao
  HTTP-only da aplicacao e store `memory` ou `firestore`.
- Registro local inicial de usuarios autenticados pelo SUAP, com store
  `memory` ou `firestore`.
- Ajuste administrativo inicial de perfis de usuario no backend e na PWA.
- Edicao controlada de salas e chaves sem alterar IDs historicos.
- Desativacao e reativacao logica de salas, chaves e vinculos, preservando
  historico.
- Frontend/PWA Angular inicial com tela operacional da portaria, login SUAP,
  disponibilidade, retirada, devolucao, ocorrencias e Firebase Hosting em
  `https://keychain-ifbaps.web.app`.
- `AUTH_MODE=session` e `AUTH_SESSION_STORE=firestore` configurados na VM para
  validacao operacional via SUAP.
- Testes automatizados basicos do backend.

Ainda nao existe gestao administrativa completa de usuarios/perfis, telas
detalhadas da PWA ou URL publica final do backend.

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

O MVP deve funcionar sem depender das reservas do SUAP. A autenticacao
institucional via OAuth/SUAP foi validada tecnicamente e agora possui base
server-side no backend.

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

Enquanto o cadastro local completo de salas e chaves nao existir, o backend pode
expor uma disponibilidade provisoria baseada em todas as salas encontradas nas
reservas sincronizadas. Essa lista nao deve ser tratada como catalogo oficial:
ela serve para validar regra de bloqueio e contrato de API sem limitar o sistema
a exemplos como A06 ou C02.

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
Usuario
  -> Angular PWA no Firebase Hosting
  -> Backend Node.js/TypeScript na VM via PM2
  -> Firestore/Firebase
  -> API do SUAP, se autorizada e disponivel
  -> Leitura controlada da interface web do SUAP para reservas, apenas
     read-only e autorizada
```

O frontend nao deve acessar segredos, service account, `client_secret` ou
credenciais administrativas. Operacoes criticas devem passar pelo backend.

## Execucao e publicacao

Backend:

- Roda na VM.
- Gerenciado por PM2.
- Le configuracoes privadas em `/etc/keychain-ifbaps`.
- Expoe a API HTTP consumida pelo frontend.
- Concentra integracoes com SUAP, incluindo OAuth e leitura read-only
  controlada das reservas enquanto nao houver API oficial disponivel.
- Base inicial disponivel em `backend/`.

Frontend:

- Aplicacao Angular/PWA.
- Build estatico publicado no Firebase Hosting em
  `https://keychain-ifbaps.web.app`.
- Nao possui segredos administrativos.
- Consome apenas endpoints autorizados do backend.
- Base inicial disponivel em `frontend/`.

## Documentacao

- [docs/arquitetura.md](docs/arquitetura.md): arquitetura, regras de negocio,
  estrutura alvo, perfis, estados e integracao SUAP.
- [docs/plano-implementacao.md](docs/plano-implementacao.md): fases de
  implementacao, progresso e pendencias.
- [AGENTS.md](AGENTS.md): orientacoes operacionais para agentes e contribuidores.

## Pendencias de decisao

1. Confirmar se existe endpoint oficial para reservas de ambientes.
2. Validar em navegador o fluxo `AUTH_MODE=session` configurado na VM.
3. Definir URL de callback de producao para OAuth/SUAP no backend.
4. Definir politica de privacidade para exibicao do usuario responsavel por uma
   chave.
5. Formalizar autorizacao institucional para leitura automatizada read-only da
   interface web de reservas do SUAP enquanto nao houver API oficial.
6. Definir janela e frequencia final de sincronizacao das reservas.
7. Definir se o acesso sera apenas na rede interna ou tambem externo.
8. Definir dominio/URL publica do backend consumida pela PWA em
   `https://keychain-ifbaps.web.app`.
