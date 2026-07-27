# Esqueleto de Pastas

Este documento registra a estrutura recomendada para o projeto considerando:

- Backend Node.js/TypeScript rodando na VM via PM2.
- Frontend Angular/PWA publicado no Firebase Hosting.
- Segredos fora do repositorio em `/etc/keychain-ifbaps`.

## Estrutura alvo

```text
/opt/keychain-ifbaps
|-- backend/
|   |-- src/
|   |   |-- main.ts
|   |   |-- app.ts
|   |   |-- config/
|   |   |   |-- env.ts
|   |   |   `-- firebase.ts
|   |   |-- modules/
|   |   |   |-- auth/
|   |   |   |-- users/
|   |   |   |-- keys/
|   |   |   |-- rooms/
|   |   |   |-- movements/
|   |   |   |-- occurrences/
|   |   |   `-- suap/
|   |   `-- shared/
|   |       |-- errors/
|   |       |-- http/
|   |       |-- middlewares/
|   |       `-- types/
|   |-- tests/
|   |-- ecosystem.config.js
|   |-- package.json
|   |-- tsconfig.json
|   `-- README.md
|
|-- frontend/
|   |-- src/
|   |   |-- app/
|   |   |   |-- core/
|   |   |   |   |-- auth/
|   |   |   |   |-- guards/
|   |   |   |   |-- interceptors/
|   |   |   |   `-- services/
|   |   |   |-- features/
|   |   |   |   |-- dashboard/
|   |   |   |   |-- keys/
|   |   |   |   |-- rooms/
|   |   |   |   |-- movements/
|   |   |   |   |-- occurrences/
|   |   |   |   |-- reservations/
|   |   |   |   `-- admin/
|   |   |   |-- shared/
|   |   |   |   |-- components/
|   |   |   |   |-- models/
|   |   |   |   `-- pipes/
|   |   |   `-- app.config.ts
|   |   |-- assets/
|   |   |-- environments/
|   |   |-- index.html
|   |   `-- main.ts
|   |-- angular.json
|   |-- firebase.json
|   |-- package.json
|   |-- tsconfig.json
|   `-- README.md
|
|-- docs/
|   |-- arquitetura.md
|   `-- estrutura.md
|
|-- scripts/
|   |-- backend-restart.sh
|   `-- frontend-deploy.sh
|
|-- AGENTS.md
|-- README.md
`-- .gitignore
```

## Backend

O backend deve concentrar regras criticas e integracoes.

Pastas principais:

- `config/`: carregamento de ambiente, Firebase Admin SDK e configuracoes do
  servidor.
- `modules/auth/`: autenticacao, autorizacao, perfis e permissoes.
- `modules/users/`: usuarios locais e vinculo com identidade institucional.
- `modules/keys/`: cadastro, status e regras das chaves.
- `modules/rooms/`: ambientes, salas e laboratorios.
- `modules/movements/`: retiradas, devolucoes e historico.
- `modules/occurrences/`: perdas, danos, observacoes e registros especiais.
- `modules/suap/`: adaptador para integracao futura com reservas do SUAP.
- `shared/`: utilitarios comuns, middlewares, erros e tipos compartilhados.
- `ecosystem.config.js`: configuracao do PM2 para rodar o backend na VM.

## Frontend

O frontend deve ser uma aplicacao Angular/PWA publicada no Firebase Hosting.

Pastas principais:

- `core/`: servicos globais, autenticacao, guards e interceptors HTTP.
- `features/dashboard/`: visao inicial e resumo operacional.
- `features/keys/`: telas de consulta e gestao de chaves.
- `features/rooms/`: telas de ambientes, salas e laboratorios.
- `features/movements/`: retirada, devolucao e historico.
- `features/occurrences/`: ocorrencias de perda, dano ou observacao.
- `features/reservations/`: visualizacao de reservas vindas do SUAP.
- `features/admin/`: administracao de usuarios, permissoes e cadastros.
- `shared/`: componentes, modelos e utilitarios reutilizaveis da interface.
- `firebase.json`: configuracao de publicacao no Firebase Hosting.

## Scripts

Scripts opcionais para padronizar operacoes:

- `scripts/backend-restart.sh`: build e restart do backend no PM2.
- `scripts/frontend-deploy.sh`: build do Angular e deploy no Firebase Hosting.

Esses scripts nao devem conter segredos. Qualquer valor privado deve vir de
`/etc/keychain-ifbaps` ou do ambiente da VM.

## Segredos fora do repositorio

Os arquivos sensiveis permanecem fora do Git:

```text
/etc/keychain-ifbaps/.env
/etc/keychain-ifbaps/keychain-ifbaps-firebase-adminsdk-fbsvc-9a18ddb436.json
```

O backend pode ler esses arquivos em runtime. O frontend nao deve acessar esses
arquivos nem conter credenciais administrativas no bundle publicado.
