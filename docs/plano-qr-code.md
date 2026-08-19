# Plano: Identificacao na retirada de chaves (QR Code e senha numerica)

Proposta para revisao. Este documento analisa a ideia de identificacao na
retirada de chaves dentro da arquitetura atual do sistema (Firebase
Authentication, Firestore direto com Security Rules, perfis `usuario`,
`portaria` e `admin`) e propoe um plano por fases para dois cenarios de
autenticacao. Nenhuma mudanca de codigo deve comecar antes da aprovacao deste
documento e das decisoes pendentes listadas no final.

Escopo: IFBA Campus Porto Seguro (`PS`).

## 1. Contexto

Hoje a portaria digita manualmente nome, matricula e dados do responsavel na
retirada de uma chave. Isso gera retrabalho, erros de digitacao e rastreabilidade
limitada.

A proposta e automatizar a identificacao do responsavel com dois cenarios:

- **Cenario A - QR Code no celular do usuario**: o usuario usa o proprio celular
  para gerar um QR Code temporario de identificacao. O porteiro le o QR e o
  sistema preenche automaticamente os dados do responsavel. O porteiro apenas
  confirma a saida da chave. Para devolver a chave, o porteiro apenas clica em
  "Devolver" na movimentacao aberta.
- **Cenario B - Senha numerica (sem uso do celular pessoal)**: o usuario gera sua
  senha numerica pessoal e intransferivel na propria aplicacao web, acessivel no
  celular dele **ou em um computador do instituto** (disponibilizado nas salas e
  setores para quem nao quer usar o aparelho pessoal). Apos gerar a senha, ele
  vai a portaria e a digita em um teclado numerico fisico; o sistema valida,
  identifica o responsavel (nome, cargo) e registra a retirada com nome, cargo e
  horario sem digitar dados manualmente.

A base de pessoas ja existe em tabelas externas (nome, matricula e e-mail de
servidores/tecnicos/professores e de alunos). Para servidores/tecnicos/
professores, ja existe o snapshot versionado `backend/scripts/pessoas-ps.json`
(121 pessoas) gerado por leitura read-only do SUAP em 19/08/2026; a base de
alunos ainda nao foi importada e fica como pendencia.

## 2. Situacao atual que sustenta a proposta

- A PWA ja autentica pelo Google (Firebase Authentication) e separa perfis:
  - `usuario`: consulta publica somente leitura da situacao das chaves.
  - `portaria`: consulta, retirada, devolucao, ocorrencias e historico.
  - `admin`: usuarios, diagnostico da sincronizacao, relatorios.
- A PWA le e grava o Firestore diretamente pelo Firebase Web SDK, protegida por
  Security Rules. Nao existe API propria de negocio no caminho da PWA.
- O backend e um worker de sincronizacao com Firebase Admin SDK (escrita em
  colecoes de projecao e operacionais).
- Retiradas usam transacoes Firestore e `key_locks` para atomicidade.
- O perfil `usuario` hoje nao faz nenhuma escrita em movimentacoes.

## 3. Visao geral do fluxo proposto

### Cenario A - QR Code

```text
Usuario (celular)
  Abre a PWA
    -> Login Google
    -> "Gerar QR Code"
    -> QR temporario exibido

Porteiro
  "Ler QR Code" (camara)
    -> Sistema valida o token
    -> Preenche nome/matricula/tipo do responsavel
    -> Confere chave/sala/reserva
    -> Confirma retirada
    -> Movimentacao registrada
```

### Cenario B - Senha numerica (gerada na web, usada no teclado fisico)

```text
Usuario (qualquer dispositivo - celular ou computador do instituto)
  Abre a aplicacao web
    -> Login Google institucional
    -> "Gerar senha numerica" (sem necessidade de usar o celular pessoal)
    -> Senha numerica pessoal definida

Servidor (na portaria)
  Digita a senha numerica pessoal no teclado fisico

Porteiro
  "Validar senha numerica"
    -> Sistema busca a pessoa pela senha e valida
    -> Preenche nome/cargo do responsavel
    -> Confere chave/sala/reserva
    -> Confirma retirada
    -> Movimentacao registrada
```

A senha numerica e pessoal e intransferivel. Ela nao substitui a identificacao
do porteiro: o porteiro permanece responsavel por confirmar a identidade visual
da pessoa e a chave/sala antes de liberar a saida.

### Alternativa de uso (combinando os cenarios)

Um usuario que gerou a senha numerica (Cenario B) pode, se preferir, usar o QR
Code (Cenario A) quando tiver o celular disponivel. Os dois metodos convivem: a
senha numerica atende quem nao quer depender do aparelho pessoal, e o QR atende
quem usa o celular no dia a dia.

## 4. Decisao de arquitetura recomendada

A proposta original fala em "consultar o token no back-end". Para preservar a
arquitetura atual (sem API propria de negocio para a PWA), recomenda-se:

- **Cenario A (QR Code)**: geracao e validacao do token via documentos Firestore +
  Security Rules + transacoes, mesmo padrao ja usado em `key_locks` e nas
  retiradas. O token e um identificador aleatorio opaco; o QR nao carrega nome,
  matricula ou dados pessoais em texto aberto, apenas o id do documento do token.
  A leitura/consumo do token (uso unico) e feita por transacao: o porteiro le o
  documento, valida nao usado e nao expirado, marca `usedAt`, `usedBy` e vincula
  a movimentacao no mesmo batch.
- **Cenario B (senha numerica)**: a validacao da senha exige comparacao segura.
  A PWA nao pode validar a senha contra um hash apenas com Security Rules (as
  regras nao executam funcoes de hash). Para manter o padrao de validacao no
  servidor sem expor o worker publicamente, a PWA grava um documento de pedido
  em uma colecao `pin_requests` no Firestore e o worker (PM2, Admin SDK, ja
  existente) processa a requisicao e grava o resultado; a PWA recebe a resposta
  em tempo real com `onSnapshot`. O worker continua sem porta HTTP publica.
  Isso adiciona um servico no caminho da PWA e e uma decisao arquitetural a ser
  aprovada, conforme detalhado na secao 6.

Ponto de revisao: se a instituicao exigir validacao criptografica no servidor
para o Cenario A (fora do cliente Firebase), a alternativa e o mesmo padrao de
`pin_requests` com um pedido de validacao de token, processado pelo worker via
Admin SDK (sem Cloud Function paga nem endpoint publico).

## 5. Modelo de dados proposto

### `people/{personId}` (novo)

Base institucional importada do snapshot versionado
`backend/scripts/pessoas-ps.json` (121 servidores de PS: professores e tecnicos,
com nome, matricula, email e cargo normalizados em minusculo) e, no futuro, dos
alunos. Somente o backend com Admin SDK grava; PWA nunca escreve.

```json
{
  "id": "p-<matricula>",
  "name": "nome completo",
  "email": "nome@ifba.edu.br",
  "matricula": "2180715",
  "cargo": "professor | tecnico | aluno",
  "campus": "PS",
  "active": true,
  "pinHash": null,
  "pinUpdatedAt": null,
  "importedAt": "2026-08-19T18:00:00Z"
}
```

Regras de acesso: somente `portaria` e `admin` leem dados pessoais completos. O
perfil `usuario` nao acessa `people`.

`pinHash` armazena apenas o hash seguro da senha numerica do Cenario B (ver secao
7). Nunca e armazenada em texto plano.

### `qr_tokens/{tokenId}` (novo)

```json
{
  "id": "qr-<aleatorio>",
  "ownerUid": "<uid do Firebase>",
  "personId": "p-servidor-<matricula>",
  "generatedAt": "2026-08-19T14:30:00Z",
  "expiresAt": "2026-08-19T14:35:00Z",
  "usedAt": null,
  "usedByUid": null,
  "usedByEmail": null,
  "movementIds": [],
  "roomId": null,
  "keyId": null,
  "status": "active | used | expired"
}
```

O QR codifica somente `qr_tokens/{tokenId}`. Nenhum dado pessoal entra no QR.

### `pin_requests/{requestId}` (novo)

Pedido de operacao de senha numerica processado pelo worker. A PWA cria o
documento, o worker responde no mesmo documento e a PWA recebe a resposta em
tempo real (`onSnapshot`). Nenhuma porta HTTP do worker e exposta.

```json
{
  "id": "pinreq-<aleatorio>",
  "uid": "<uid do Firebase que solicitou>",
  "personId": "p-servidor-<matricula>",
  "operation": "set_pin | verify_pin",
  "status": "pending | processing | completed | failed",
  "pin": "******** (apenas set_pin; valor efemero, apagado apos processar)",
  "createdAt": "2026-08-19T14:30:00Z",
  "processedAt": null,
  "result": null,
  "failReason": null
}
```

Regras de acesso:

- `set_pin`: o perfil `usuario` vinculado cria somente o proprio pedido
  (`uid == auth.uid`, `personId` do proprio vinculo), com `status: "pending"`,
  e le somente o proprio documento.
- `verify_pin`: o perfil `portaria`/`admin` cria o pedido informando a senha
  digitada no teclado fisico (`personId` nulo no create; o worker resolve a
  pessoa pelo hash) e le somente o proprio documento.
- Nenhum perfil altera ou apaga documentos; o worker usa Admin SDK (ignora as
  Rules) para avançar `status`, gravar `result` e limpar o campo `pin`.

Seguranca do transporte da senha (detalhada na secao 7): o valor digitado nunca
e persistido em texto plano em `people`; no pedido, o campo `pin` e efemero
(apagado pelo worker apos processar, com TTL e delecao da colecao), e a
alternativa forte e enviar o valor criptografado com a chave publica do worker.

### Vinculo com a movimentacao

`key_movements` passa a aceitar campos opcionais de origem de identificacao:

```text
qrTokenId
qrVerifiedAt
qrVerifiedByUid
qrVerifiedByEmail
qrPersonId
pinVerifiedAt
pinVerifiedByUid
pinVerifiedByEmail
```

Isso permite auditoria completa: quem gerou, quando, quem leu/validou, quando e em
qual movimentacao.

## 6. Identificacao e autenticacao institucional

Etapa recomendada em fases:

1. **Vinculo por e-mail institucional**: ao logar com Google, o sistema tenta
   casar o e-mail autenticado com `people.email`. Funciona bem para
   servidores/tecnicos/professores com conta @ifba.edu.br.
2. **Fallback por matricula**: se o e-mail Google nao casar (caso comum de
   alunos que usam conta pessoal), o usuario informa a matricula. O sistema
   vincula `people` e exige confirmacao do porteiro. A validacao de posse da
   matricula pode ser reforçada depois (ver ponto de revisao).
3. **Senha numerica pessoal (Cenario B)**: cada pessoa gera a propria senha
   numerica na aplicacao web, acessivel no celular ou em computador do instituto
   disponibilizado nas salas e setores. Assim, quem nao quer usar o aparelho
   pessoal tambem consegue se autenticar: gera a senha em um computador do
   instituto e a usa no teclado fisico da portaria. A senha e numerica, pessoal e
   intransferivel, e nunca e usada no celular do usuario (so no teclado fisico).
4. **Futuro (opcional)**: autenticacao institucional via fluxo OAuth legado do
   SUAP para confirmar a identidade sem digitar dados. A base OAuth/SUAP ja
   existe isolada no backend; reativa-la seria decisao aprovada.

Regra: a geracao do QR (Cenario A) e feita somente pelo usuario autenticado que se
vinculou a uma `people`. O QR associa `ownerUid` + `personId`, demonstrando que o
proprio usuario iniciou o processo.

## 7. Seguranca do token e da senha numerica

### Cenario A - Token do QR

- Aleatorio (crypto random) e longo o suficiente para inviabilizar adivinhacao.
- Validade curta (ex.: 3 a 5 minutos) e configuravel.
- Uso unico: transacao Firestore impede consumo duplo (mesmo padrao de
  `key_locks`).
- Invalida-se apos uso e apos expirar.
- Registra geracao, validacao, porteiro que leu e movimentacao vinculada.
- O perfil `usuario` cria somente o proprio token e nao le tokens de terceiros.

### Cenario B - Senha numerica

- A senha e numerica, pessoal e intransferivel; o sistema nunca armazena a senha
  em texto plano, somente um hash seguro (ex.: bcrypt/argon2) em `people.pinHash`.
- A comparacao da senha ocorre no worker (Admin SDK), nunca na PWA, para nao
  expor hashes nem permitir enumeracao de senhas no cliente. A PWA apenas grava
  o pedido em `pin_requests`; o worker processa e responde no mesmo documento.
- Limite de tentativas com bloqueio temporario apos falhas consecutivas para
  dificultar forca bruta (contadores e bloqueio mantidos no backend).
- O teclado fisico nao armazena a senha; ele apenas transmite os digitos para o
  sistema na hora da validacao.
- Renovacao/expiracao periodica da senha e definida por politica institucional.
- Transporte da senha pela `pin_requests`: a PWA nunca persiste o valor em
  texto plano em `people`; no documento do pedido o campo `pin` e efemero e
  tratado como credencial sensivel:
  - `set_pin`/`verify_pin` enviam o valor digitado no campo `pin` do pedido;
  - o worker apaga o campo `pin` imediatamente apos processar e grava somente o
    resultado; pedidos nao processados expiram por TTL curto (30-60s) e sao
    removidos por limpeza periodica;
  - nao usar hash simples do PIN (ex.: `sha256(pin)`) como substituto do valor:
    o hash vira credencial reutilizavel e e brute-forceavel offline para 6
    digitos;
  - alternativa forte (fase posterior): a PWA envia o valor criptografado com a
    chave publica do worker (`payload`), e somente o worker (chave privada no
    servidor) descriptografa para comparar. Sem mudanca de fluxo ou colecao.

Ponto de revisao: a validacao da senha adiciona o worker no caminho da PWA
(processando `pin_requests` via Admin SDK) e exige autenticacao forte do
portaria/admin que invoca. Alternativa sem servico proprio seria aceitar a senha
apenas como segundo fator (posse) com confirmacao visual do porteiro na primeira
vez.

## 8. Permissoes por perfil

| Acao | usuario | portaria | admin |
| --- | --- | --- | --- |
| Consultar situacao das chaves | Sim | Sim | Sim |
| Gerar o proprio QR (Cenario A) | Sim | - | - |
| Definir/renovar a propria senha numerica | Sim | - | - |
| Ler/validar QR (Cenario A) | Nao | Sim | Sim |
| Validar senha numerica (Cenario B) | Nao | Sim | Sim |
| Registrar retirada/devolucao | Nao | Sim | - |
| Ver dados pessoais de `people` | Nao | Sim | Sim |
| Auditar tokens, senhas e movimentacoes | Nao | Sim | Sim |

O perfil `usuario` continua sem qualquer escrita em movimentacoes, ocorrencias,
`people` ou dados administrativos. As unicas escritas novas sao criar/apagar o
proprio documento em `qr_tokens`, criar/ler o proprio pedido em `pin_requests`
(definir a propria senha numerica; `pinHash` e gravado somente pelo worker,
nunca pela PWA) e `portaria`/`admin` criam/leem pedidos de validacao. Nenhum
perfil grava `people.pinHash`.

## 9. Auditoria

Eventos a registrar (podem usar `key_occurrences`/novo log ou campos no proprio
token):

- token gerado (usuario, horario);
- token validado (porteiro, horario);
- token rejeitado (expirado, ja usado, pessoa inativa);
- movimentacao vinculada ao token;
- tentativa de uso duplo;
- senha numerica definida/renovada (usuario, horario);
- validacao de senha numerica (porteiro, horario);
- senha bloqueada por excesso de tentativas (usuario, horario).

Cada evento registra quem, quando e a chave/sala envolvida.

## 10. Privacidade

- `people` e `qr_tokens` contem dados pessoais e ficam restritos por Security
  Rules a `portaria`/`admin` (e ao proprio `ownerUid` no caso do token).
- O QR nao carrega PII.
- A senha numerica e um fator pessoal; seu hash fica em `people` e somente o
  backend o le.
- Nenhuma colecao nova e legivel pelo perfil publico.

## 11. Plano por fases

Criterios de aceite por fase serao definidos no detalhamento aprovado. Cada fase
entrega um resultado verificavel e nao avanca para a seguinte antes da validacao
da anterior.

### Fase 0 - Importar base de pessoas para `people`

Objetivo: popular `people` com a base institucional a partir do snapshot ja
versionado e preparar a estrutura para a base de alunos.

Tarefas:

- [x] Definir o script de importacao do backend (`npm run people:import` via
      `src/maintenance/import-people.ts`) que le o JSON versionado
      `backend/scripts/pessoas-ps.json`.
- [x] Gerar o documento `people/p-<matricula>` com campos `name`, `email`,
      `matricula`, `cargo`, `campus` e `importedAt` (normalizados em minusculo).
      Pessoas sem e-mail no snapshot ficam com `email: null`.
- [x] Definir `active: true` no import inicial; inativar pessoas ausentes em um
      novo snapshot sem apagar historico (`active: false` + `inactivatedAt`,
      apenas para `professor`/`tecnico` de `PS`).
- [x] Documentar o fluxo de atualizacao periodica do snapshot (rotatividade de
      servidores) e o mecanismo de deteccao de saidas/entradas
      (`backend/README.md`).
- [x] Proteger a colecao `people` por Security Rules (somente `portaria`/`admin`
      leem; ninguem escreve pela PWA).

Criterios de aceite:

- [x] `people` possui 121 documentos correspondentes ao snapshot de servidores.
- [x] Nenhum documento contem dados de aluno (pendencia aberta ate a fonte de
      alunos).
- [x] A PWA nao consegue gravar em `people` nem ler dados pessoais (regra
      publicada; leitura liberada somente a `portaria`/`admin`).

### Fase 1 - Vinculo Firebase usuario x `people`

Objetivo: o usuario autenticado identifica-se no sistema a partir da base
institucional.

Tarefas:

- [x] Ao logar com Google, consultar `people` por e-mail autenticado
      (`email` do Firebase = `people.email`) e vincular `personId` ao perfil.
      Implementado em `FirestoreDataService.ensureCurrentUserProfile` com
      consulta por e-mail normalizado e filtro de ativos.
- [x] Fallback por matricula: tela de autoidentificacao para usuarios sem e-mail
      institucional (caso comum de alunos com conta pessoal). Formulario de
      matricula na tela publica que le `people/p-<matricula>` e vincula.
- [x] Persistir o vinculo no perfil do usuario (colecao de usuarios) com
      `personId` e `linkedAt`.
- [x] Exibir na UI o nome e o cargo vinculados para o usuario confirmar antes de
      gerar o QR. Card "Minha identificacao" na tela publica.
- [x] Security Rules: somente o proprio usuario le/altera o proprio vinculo
      (leitura do proprio registro por e-mail; vinculo gravado uma unica vez no
      proprio documento, com alteracao posterior restrita a admin).

Criterios de aceite:

- [x] Usuario com e-mail institucional em `people` e vinculado automaticamente.
- [x] Usuario sem e-mail institucional consegue se vincular por matricula.
- [x] O porteiro nao precisa intervir para o vinculo por e-mail.

Observacao de seguranca: o fallback por matricula permite a um usuario ainda nao
vinculado ler um documento `people` sem e-mail (via `get` por id) para se
vincular; isso pode permitir enumeracao de matricula de pessoas sem e-mail. A
confirmacao de posse da matricula pelo porteiro e a restricao a alunos seguem
como reforco planejado em fase posterior.

### Fase 2 - Gerar QR (Cenario A) e definir senha numerica (Cenario B)

Objetivo: o usuario gera um token temporario e exibe o QR sem PII (Cenario A) e
define/renova sua senha numerica pessoal para uso no teclado fisico (Cenario B).

Tarefas Cenario A:

- [ ] Criar colecao `qr_tokens/{qr-<aleatorio>}` com os campos do modelo (secao 5).
- [ ] Gerar o id do token com `crypto.getRandomValues`/UUID v4 no cliente.
- [ ] Botao "Gerar QR Code" no perfil publico da PWA, visivel apenas para usuario
      vinculado a `people`.
- [ ] Renderizar o QR no cliente (ex.: lib `qrcode`) codificando apenas o id do
      documento do token (`qr_tokens/qr-<aleatorio>`).
- [ ] Security Rules: o usuario cria somente o proprio token com
      `ownerUid = auth.uid`; nenhum outro perfil cria; ninguem lista tokens de
      terceiros.

Tarefas Cenario B:

- [ ] Criar colecao `pin_requests/{pinreq-<aleatorio>}` com os campos do modelo
      (secao 5) e Security Rules: `usuario` vinculado cria/le somente o proprio
      pedido `set_pin` (`uid == auth.uid`, `status: "pending"`); `portaria`/
      `admin` cria/le pedidos `verify_pin` proprios; ninguem altera/apaga.
- [ ] Worker (PM2, Admin SDK) processa `pin_requests`: para `set_pin`, valida a
      politica (minimo de digitos), gera e grava o hash em `people.pinHash` e
      `pinUpdatedAt`, apaga o campo `pin` e marca `completed`; para
      `verify_pin`, compara com o hash e grava `result` sanitizado.
- [ ] Tela no perfil publico para o usuario definir/renovar a senha numerica,
      acessivel no celular ou em computador do instituto (sem exigir aparelho
      pessoal). A PWA cria o pedido e aguarda resposta via `onSnapshot`.
- [ ] Limite de tentativas e bloqueio temporario registrado em auditoria
      (contadores e bloqueio mantidos no worker).
- [ ] Politica de senha: minimo de digitos (ex.: 6), bloqueio por tentativas e
      renovacao periodica conforme politica institucional.
- [ ] TTL curto (30-60s) e limpeza periodica de pedidos nao processados; o
      campo `pin` efemero nunca e persistido em `people`.

Criterios de aceite:

- O QR nao contem nome, matricula ou e-mail em texto aberto (somente o id opaco).
- O token expira apos o tempo configurado (padrao 5 minutos) e o QR deixa de ser
  valido ao expirar.
- A senha numerica e gravada somente como hash no backend; a PWA nunca recebe o
  valor em texto plano.

### Fase 3 - Ler QR e validar senha na portaria

Objetivo: o porteiro le o QR (Cenario A) ou recebe a senha numerica do teclado
fisico (Cenario B), valida e registra a retirada.

Tarefas Cenario A:

- [ ] Tela de leitura na portaria: camara do dispositivo (HTTPS ja disponivel no
      Hosting) ou upload de imagem do QR como alternativa.
- [ ] Decodificar o id do token e ler o documento `qr_tokens/<id>` (perfil
      `portaria`/`admin`).
- [ ] Validar em transacao: token existe, nao expirado, nao usado, pessoa ativa.
- [ ] Marcar `usedAt`, `usedByUid` e `usedByEmail` no mesmo batch da retirada.
- [ ] Preencher automaticamente nome/matricula/cargo do responsavel na tela de
      retirada; o porteiro confere e confirma.

Tarefas Cenario B:

- [ ] Tela de validacao na portaria: o porteiro informa a senha numerica digitada
      no teclado fisico (ou o teclado transmite direto para o sistema).
- [ ] A PWA cria um pedido `verify_pin` em `pin_requests` com a senha digitada;
      o worker valida contra o hash em `people.pinHash` e grava `result` com
      dados sanitizados do responsavel; a PWA recebe a resposta via `onSnapshot`.
- [ ] Limite de tentativas no teclado com bloqueio temporario apos falhas
      (contadores e bloqueio no worker).
- [ ] Preencher automaticamente nome/cargo do responsavel na tela de retirada; o
      porteiro confere visualmente a identidade e confirma.

Criterios de aceite:

- Retirada concluida sem digitar nome/matricula do responsavel em ambos os
  cenarios.
- Uso duplo do mesmo token e recusado pela transacao (mesmo padrao de
  `key_locks`).
- Senha incorreta nao identifica a pessoa e o bloqueio temporario impede forca
  bruta.
- Token expirado ou ja usado apresenta mensagem clara ao porteiro.

### Fase 4 - Auditoria e operacao

Objetivo: rastreabilidade completa do QR e da senha numerica, expiracao, uso
unico e relatorios.

Tarefas:

- [ ] Gravar na movimentacao os campos opcionais de origem de identificacao
      (secao 5), tanto para Cenario A quanto para Cenario B.
- [ ] Registrar eventos de auditoria (token gerado, validado, rejeitado, uso
      duplo, senha definida/renovada, senha validada, bloqueio por tentativas).
- [ ] Limpeza/arquivamento periodico de tokens expirados ou usados.
- [ ] Relatorio de QR lidos e de retiradas por senha numerica para
      `admin`/`portaria` com pessoa, horario, porteiro e chave/sala.

Criterios de aceite:

- Toda retirada via QR ou senha numerica referencia o token/pin e a pessoa de
  origem.
- Tentativas de uso duplo e de senha incorreta ficam registradas em auditoria.
- Relatorio lista QR lidos e retiradas por senha no periodo selecionado sem expor
  dados desnecessarios.

### Fase 5 - (Futuro/opcional) autenticacao institucional via SUAP

Objetivo: validar identidade sem digitacao manual, reaproveitando o fluxo OAuth
legado isolado no backend.

Tarefas (sujeitas a aprovacao arquitetural):

- [ ] Reativar o fluxo OAuth/SUAP apenas para a etapa de identificacao.
- [ ] Confirmar a identidade retornada pelo SUAP com `people` antes de liberar o
      QR.
- [ ] Documentar a decisao de reutilizar o backend como validador (nova
      dependencia da PWA em servico proprio).

Criterios de aceite:

- Usuario identificado pelo SUAP gera QR sem fallback por matricula.
- O backend valida a identidade sem expor dados pessoais na PWA.

Criterios de aceite por fase serao confirmados no detalhamento aprovado apos as
decisoes da secao 13.

## 12. Riscos e pontos de revisao

- **Camara no PWA**: exige permissao e HTTPS (o Hosting ja e HTTPS). Alternativa:
  upload de imagem do QR em vez de camara.
- **Alunos com e-mail pessoal**: o fallback por matricula depende de conferencia
  do porteiro; reforco da posse da matricula fica para decisao.
- **Uso offline**: o fluxo depende de conexao com Firestore; definir comportamento
  de falha.
- **Rotatividade de pessoas**: `people` precisa de sincronizacao/atualizacao
  periodica a partir das tabelas oficiais.
- **Proposta "consultar no back-end"**: a abordagem Firestore nativa evita nova
  API publica; o Cenario B (senha numerica) exige comparacao de hash no worker,
  feita via `pin_requests` (Firestore) processado pelo Admin SDK, sem expor porta
  HTTP publica. O worker precisa estar de pe (PM2) para processar os pedidos;
  pedidos nao processados expiram por TTL e sao limpos.
- **Forca bruta da senha numerica**: mitigada por limite de tentativas, bloqueio
  temporario e renovacao periodica da senha.
- **Compartilhamento da senha numerica**: a senha e intransferivel, mas depende de
  disciplina dos usuarios e confirmacao visual do porteiro para evitar uso por
  terceiros.

## 13. Perguntas para decisao

1. A base de alunos sera importada de qual fonte oficial e por quem? O snapshot de
   servidores ja existe (`backend/scripts/pessoas-ps.json`) e foi gerado por
   leitura read-only do SUAP em 19/08/2026; a base de alunos fica pendente.
2. Para alunos sem e-mail institucional no Google, a matricula digitada com
   confirmacao do porteiro e aceitavel como primeira versao?
3. QR com validade de 5 minutos e uso unico atendem a operacao da portaria?
4. A portaria usa camara do dispositivo ou prefere capturar a imagem do QR?
5. Registramos auditoria de QR em colecao propria ou apenas campos no
   `key_movements`?
6. A autenticacao institucional via SUAP (OAuth legado) deve ser planejada agora
   ou depois da validacao do fluxo por e-mail/matricula?
7. O relatorio de QR lidos deve incluir quais campos (pessoa, horario, porteiro,
   chave/sala)?
8. A validacao por matricula deve aceitar a matricula SIAPE (servidores) e o
   numero de matricula academica (alunos) no mesmo campo, ou separados por cargo?
9. A senha numerica do Cenario B e definida pelo proprio usuario na aplicacao web
   (celular ou computador do instituto), sem senha inicial importada. Quantos
   digitos (ex.: 6) e qual a politica de renovacao?
10. O teclado fisico do Cenario B transmite a senha diretamente ao sistema ou o
    porteiro digita os digitos na tela da PWA?
11. A validacao da senha numerica deve exigir tambem a matricula como segundo
    fator (algo que sabe + algo que e) ou apenas a senha com confirmacao visual
    do porteiro?
12. DECIDIDO: a validacao da senha numerica usa a fila `pin_requests` no
    Firestore processada pelo worker via Admin SDK (sem endpoint HTTP publico,
    sem Cloud Function paga, sem expor porta na VM). A PWA cria o pedido e recebe
    a resposta em tempo real via `onSnapshot`.

## 14. Apos a aprovacao

- Atualizar `docs/arquitetura.md` (colecoes, regras, perfis e decisao sobre API:
  `pin_requests` processado pelo worker via Admin SDK, sem endpoint publico).
- Atualizar `docs/diagramas.md` (fluxo de QR na arquitetura e na operacao e o
  fluxo da fila `pin_requests`).
- Atualizar `docs/plano-implementacao.md` com as fases aprovadas.
- Atualizar Security Rules, indices e o modelo do frontend.