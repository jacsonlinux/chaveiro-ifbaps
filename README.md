# Sistema Web de Controle de Chaves IFBA/IFBAPS

Sistema para digitalizar o controle de retirada, devolucao, disponibilidade,
ocorrencias e historico de chaves da portaria do IFBA Campus Porto Seguro.

O principio central do projeto e:

> O SUAP gerencia a reserva do ambiente. O Sistema de Controle de Chaves
> gerencia a movimentacao fisica e operacional da chave.

## Situacao atual

Este repositorio esta em fase de planejamento. Ainda nao existe implementacao
de backend, frontend, banco de dados ou integracao real com o SUAP.

Diretorio atual de trabalho:

```text
/opt/keychain-ifbaps/dev
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

O MVP deve funcionar sem depender das reservas do SUAP, mas ja preparado para
autenticacao/integracao futura.

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
```

O frontend nao deve acessar segredos, service account, `client_secret` ou
credenciais administrativas. Operacoes criticas devem passar pelo backend.

## Execucao e publicacao

Backend:

- Roda na VM.
- Gerenciado por PM2.
- Le configuracoes privadas em `/etc/keychain-ifbaps`.
- Expoe a API HTTP consumida pelo frontend.

Frontend:

- Aplicacao Angular/PWA.
- Build estatico publicado no Firebase Hosting.
- Nao possui segredos administrativos.
- Consome apenas endpoints autorizados do backend.

## Documentacao

- [docs/arquitetura.md](docs/arquitetura.md): arquitetura, regras de negocio,
  estrutura alvo, perfis, estados e integracao SUAP.
- [AGENTS.md](AGENTS.md): orientacoes operacionais para agentes e contribuidores.

## Pendencias de decisao

1. Confirmar se existe endpoint oficial para reservas de ambientes.
2. Definir fluxo inicial de autenticacao institucional usando a aplicacao OAuth
   `keychain-ifbaps` registrada no SUAP.
3. Definir URL de callback de producao para OAuth/SUAP no backend.
4. Definir politica de privacidade para exibicao do usuario responsavel por uma
   chave.
5. Definir se o acesso sera apenas na rede interna ou tambem externo.
6. Definir dominio/URL publica do backend consumida pelo Firebase Hosting.
