# Frontend/PWA

PWA Angular do Sistema de Controle de Chaves do IFBA Campus Porto Seguro.

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

`npm start` sobe o Angular em `http://localhost:4200/`. Nesta VM, a porta 3000 ja
e usada por outro servico.

## Dados do Firestore

A aplicacao usa o Firebase Web SDK para Authentication e Firestore. A
configuracao publica fica em `public/runtime-config.js`:

```js
window.KEYCHAIN_CONFIG = {
  firebase: { /* configuracao publica do projeto */ },
};
```

O Firebase Authentication autentica a portaria e as regras do Firestore
autorizam leituras e escritas conforme o perfil do usuario. O frontend nao
consulta o SUAP e nao depende de uma API propria.

### Desenvolvimento pela VM via SSH

O worker de scraping roda na VM e nao precisa ser acessado pelo navegador. Para
desenvolvimento Angular via SSH, basta encaminhar a porta do servidor Angular:

```bash
ssh -N -L 4200:127.0.0.1:4200 usuario@vm
```

Em outro terminal na VM, execute `npm start` neste diretorio e acesse
`http://localhost:4200/`. O Hosting publico serve os arquivos estaticos e a
PWA acessa o Firestore diretamente.

O frontend nao deve conter `client_secret`, service account, senha do SUAP ou
qualquer credencial administrativa.

Em producao, `public/runtime-config.js` contem somente configuracao publica do
Firebase. Credenciais do SUAP e o service account continuam exclusivamente no
worker da VM.

## Tela inicial

A PWA possui areas operacionais por perfil:

- estado de sessao e login Firebase Authentication;
- resumo de chaves por status;
- busca de chaves/salas;
- area `Operacao` para disponibilidade e acoes rapidas;
- detalhe da chave selecionada na operacao, com status, salas vinculadas,
  reserva bloqueadora e alerta de reserva `suspect_absent` quando existir;
- area `Reservas` para consultar reservas/ocupacoes normalizadas no Firestore
  pelo worker, com sincronizacao manual visivel somente para `admin`;
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
- area `Administracao` para ajustar perfis e consultar diagnostico da
  sincronizacao, visivel somente para `admin`;
- busca e filtro por perfil no painel administrativo de usuarios, aplicados no
  backend quando o administrador aciona o filtro;
- acao administrativa para limpar sessoes expiradas da aplicacao;
- salas e chaves exibidas na operacao sao uma projecao somente leitura gerada
  pelo worker a partir do SUAP; a listagem administrativa de salas agendaveis
  ja foi validada para ampliar a cobertura para salas sem reserva futura, sem
  formularios de cadastro na PWA.

O perfil `usuario` nao e habilitado para a operacao atual pelas Security Rules.
Os perfis `portaria` e `admin` acessam a operacao; somente `admin` acessa a
administracao e o diagnostico da sincronizacao.

A PWA nao acessa o SUAP diretamente. Reservas sao lidas da colecao Firestore
sincronizada pelo worker. O frontend tambem usa o Firestore para dados de salas,
chaves, retiradas, devolucoes e ocorrencias, protegido por Security Rules.

A aplicacao Angular/PWA ja esta implementada como base funcional e possui URL
publica no Firebase Hosting. O cliente ja usa Firestore direto; seguem como
evolucoes de producao a refatoracao para `occupancies`, a integracao de aulas
nativas e a validacao continua das movimentacoes com dados sincronizados.

## Publicacao

O build de producao gera arquivos estaticos em:

```text
dist/keychain-ifbaps-frontend/browser
```

`firebase.json` esta configurado para Firebase Hosting com rewrite de SPA para
`index.html`, usando a URL publica `https://keychain-ifbaps.web.app`.
