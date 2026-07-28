# Frontend/PWA

PWA Angular do Sistema de Controle de Chaves IFBA/IFBAPS.

## Scripts

```bash
npm install
npm start
npm run build
```

`npm start` sobe o Angular em `http://localhost:4200/` com proxy local para o
backend em `http://localhost:3000`.

## Configuracao da API

A aplicacao usa `public/runtime-config.js` para configurar valores publicos em
runtime:

```js
window.KEYCHAIN_CONFIG = {
  apiBaseUrl: '',
};
```

Quando `apiBaseUrl` fica vazio, as chamadas usam caminhos relativos como
`/api/keys/availability` e `/auth/session`. Em desenvolvimento, o proxy
`proxy.conf.json` encaminha `/api` e `/auth` para o backend local.

O frontend nao deve conter `client_secret`, service account, senha do SUAP ou
qualquer credencial administrativa.

## Tela inicial

A primeira tela implementada e operacional para a portaria:

- estado de sessao e login SUAP;
- resumo de chaves por status;
- busca de chaves/salas;
- registro de retirada com previsao de devolucao;
- registro de devolucao;
- registro de ocorrencia ou ajuste administrativo;
- listagem de retiradas abertas/atrasadas;
- listagem de ocorrencias recentes.

## Publicacao

O build de producao gera arquivos estaticos em:

```text
dist/keychain-ifbaps-frontend/browser
```

`firebase.json` esta configurado para Firebase Hosting com rewrite de SPA para
`index.html`.
