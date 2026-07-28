# Frontend/PWA

PWA Angular do Sistema de Controle de Chaves IFBA/IFBAPS.

URL publica atual no Firebase Hosting:

```text
https://keychain-ifbaps.web.app
```

## Scripts

```bash
npm install
npm start
npm run build
```

`npm start` sobe o Angular em `http://localhost:4200/` com proxy local para o
backend em `http://localhost:3010`. Nesta VM, a porta 3000 ja e usada por outro
servico.

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

Em producao, `public/runtime-config.js` deve apontar para a URL publica do
backend quando ela for definida. A URL `https://keychain-ifbaps.web.app` e da
PWA. O login atual e feito pelo Firebase Authentication; o callback OAuth do
SUAP permanece apenas como fluxo legado do backend.

## Tela inicial

A PWA possui areas operacionais por perfil:

- estado de sessao e login Firebase Authentication;
- resumo de chaves por status;
- busca de chaves/salas;
- area `Operacao` para disponibilidade e acoes rapidas;
- detalhe da chave selecionada na operacao, com status, salas vinculadas,
  reserva bloqueadora e alerta de reserva `suspect_absent` quando existir;
- area `Reservas` para consultar reservas normalizadas fornecidas pelo backend,
  com sincronizacao manual visivel somente para `admin`;
- resumo de reservas por estado, sinalizacao segura de falhas de sincronizacao
  e historico resumido dos ultimos eventos de sync para `admin`;
- area `Movimentacoes` para retiradas abertas/atrasadas, visivel para
  `portaria` e `admin`;
- historico filtrado de movimentacoes por periodo de retirada ou devolucao,
  chave, sala e status;
- area `Ocorrencias` para registro e historico recente, visivel para
  `portaria` e `admin`;
- historico filtrado de ocorrencias por periodo, chave, sala e tipo;
- area `Relatorios` para resumo operacional de retiradas, devolucoes, atrasos
  e ocorrencias por periodo, visivel para `portaria` e `admin`;
- area `Administracao` para cadastrar salas, chaves, vinculos sala-chave e
  ajustar perfis, visivel somente para `admin`;
- busca e filtro por estado no catalogo administrativo de salas, chaves e
  vinculos;
- busca e filtro por perfil no painel administrativo de usuarios, aplicados no
  backend quando o administrador aciona o filtro;
- acao administrativa para limpar sessoes expiradas da aplicacao;
- edicao inline de salas e chaves na administracao, preservando IDs historicos;
- desativacao e reativacao logica de salas, chaves e vinculos na administracao,
  preservando historico no backend.

Usuario com apenas perfil `usuario` consulta disponibilidade, mas nao carrega
endpoints de movimentacao, ocorrencia ou administracao.

A PWA nao acessa o SUAP diretamente. Reservas sao sempre consumidas por
`GET /api/reservations`; quando habilitada, a leitura web read-only do SUAP fica
isolada no backend. O frontend tambem nao acessa Firestore diretamente.

A aplicacao Angular/PWA ja esta implementada como base funcional e possui URL
publica no Firebase Hosting. Ainda seguem como evolucoes de producao a separacao
em rotas dedicadas, refinamentos visuais, validacao interativa do login Firebase
no navegador e configuracao da URL publica do backend consumida pela PWA.

## Publicacao

O build de producao gera arquivos estaticos em:

```text
dist/keychain-ifbaps-frontend/browser
```

`firebase.json` esta configurado para Firebase Hosting com rewrite de SPA para
`index.html`, usando a URL publica `https://keychain-ifbaps.web.app`.
