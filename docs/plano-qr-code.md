# Identificacao na retirada de chaves: PIN ativo e QR Code em espera

Decisao vigente em 24/08/2026. O QR Code continua preservado no codigo para
retomada futura, mas nao e oferecido na interface nem participa da retirada.
O fluxo ativo usa somente PIN numerico de oito digitos, gerado pelo sistema e
validado pelo worker. Esta decisao substitui as propostas anteriores deste
documento que permitiam ao usuario escolher o proprio PIN ou usar QR na
portaria.

Escopo: IFBA Campus Porto Seguro (`PS`).

## 1. Contexto

Hoje a portaria digita manualmente nome, matricula e dados do responsavel na
retirada de uma chave. Isso gera retrabalho, erros de digitacao e rastreabilidade
limitada.

A proposta ativa automatiza a identificacao com um unico cenario:

- **PIN numerico gerado pelo sistema**: o usuario autenticado acessa sua area
  pessoal e clica em "Gerar meu PIN". O backend cria um PIN aleatorio de oito
  digitos, garante que ele nao esteja atribuido a outra pessoa, grava o hash
  bcrypt, uma impressao HMAC de unicidade e uma copia cifrada para recuperacao
  segura. O PIN em texto e exibido ao usuario apenas no navegador, em memoria,
  para ser apresentado na portaria. Ao entrar novamente na aplicacao, o worker
  recupera a copia cifrada e a entrega por novo envelope efemero; nao e preciso
  gerar outro PIN. Uma nova geracao substitui o PIN anterior somente quando o
  usuario clica explicitamente em "Gerar novo PIN"; nao existe renovacao
  automatica.

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

## 3. Visao geral do fluxo vigente

### QR Code em standby

O codigo de geracao, leitura e consumo permanece no repositorio, mas os
controles foram retirados da PWA. Nenhuma permissao de camera e solicitada e o
QR nao pode autenticar uma retirada enquanto o recurso estiver em standby.

### PIN numerico gerado na web

```text
Usuario (qualquer dispositivo - celular ou computador do instituto)
  Abre a aplicacao web
    -> Login Google institucional
    -> "Gerar meu PIN"
    -> Worker gera PIN unico de 8 digitos
    -> PIN exibido somente no navegador

Porteiro
  Abre uma chave disponivel
    -> Modal abre diretamente no campo PIN
    -> Servidor digita os 8 digitos e pressiona Enter
    -> Worker compara com o hash bcrypt
    -> Preenche nome/cargo do responsavel
    -> Confere chave/sala/reserva
    -> Confirma retirada
    -> Movimentacao registrada
```

A senha numerica e pessoal, intransferivel e possui exatamente oito digitos
numericos. Ela nao substitui a conferencia operacional do porteiro, que ainda
confirma a pessoa e a chave/sala antes de liberar a saida.

## 4. Decisao de arquitetura vigente

- A PWA cria em `pin_requests` somente um pedido `generate_pin` com o `personId`
  e uma chave publica efemera do navegador. O worker PM2 processa o pedido com
  o Firebase Admin SDK.
- O worker gera um PIN aleatorio de oito digitos, calcula `bcrypt` para
  autenticacao e HMAC-SHA-256 para unicidade. A colecao privada
  `pin_fingerprints` reserva a impressao em transacao; uma nova geracao remove a
  reserva anterior da mesma pessoa.
- O worker nunca grava o PIN em texto. O valor e cifrado para a chave efemera do
  navegador com ECDH P-256 e AES-256-GCM. O documento Firestore recebe apenas o
  envelope cifrado, que a PWA abre em memoria e exibe ao usuario.
- A PWA cria `verify_pin` somente para `portaria`/`admin`; o worker compara o
  PIN recebido com os hashes, aplica limite de tentativas e devolve a identidade
  confirmada. O campo de entrada e o formulario aceitam Enter para validar.
- QR Code, camera, `qr_tokens` e os metodos correspondentes permanecem no codigo
  para retomada futura, mas estao fora da interface e nao sao usados na retirada.

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
  "pinHash": "<bcrypt>",
  "pinFingerprint": "<hmac-sha256>",
  "pinCiphertext": "<aes-256-gcm:iv.ciphertext-tag>",
  "pinGeneratedAt": "2026-08-24T14:30:00Z",
  "pinUpdatedAt": "2026-08-24T14:30:00Z",
  "importedAt": "2026-08-19T18:00:00Z"
}
```

Regras de acesso: somente `portaria` e `admin` leem dados pessoais completos. O
perfil `usuario` nao acessa `people`.

`pinHash` armazena apenas o hash seguro da senha numerica do Cenario B (ver secao
7). `pinCiphertext` e cifrado pelo backend com `PIN_VAULT_SECRET`, mantido fora
do repositorio, para permitir a recuperacao do PIN persistente sem armazenar o
valor em texto plano. A PWA nunca recebe esse segredo.

### `qr_tokens/{tokenId}` (standby)

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

### `pin_requests/{requestId}`

Pedido de operacao de senha numerica processado pelo worker. A PWA cria o
documento, o worker responde no mesmo documento e a PWA recebe a resposta em
tempo real (`onSnapshot`). Nenhuma porta HTTP do worker e exposta.

```json
{
  "id": "pinreq-<aleatorio>",
  "uid": "<uid do Firebase que solicitou>",
  "personId": "p-servidor-<matricula>",
  "operation": "generate_pin | verify_pin",
  "status": "pending | processing | completed | failed",
  "publicKey": "<SPKI ECDH do navegador; generate_pin ou reveal_pin>",
  "pinEnvelope": "<ECDH/AES-GCM; generate_pin ou reveal_pin concluido>",
  "createdAt": "2026-08-19T14:30:00Z",
  "processedAt": null,
  "result": null,
  "failReason": null
}
```

Regras de acesso:

- `generate_pin`: o perfil `usuario` vinculado cria somente o proprio pedido
  (`uid == auth.uid`, `personId` do proprio vinculo), com `status: "pending"` e
  chave publica efemera; o PIN nao e enviado pela PWA.
- `reveal_pin`: o mesmo perfil cria o pedido para recuperar o PIN ja existente;
  ele nao gera nem substitui o valor.
- `verify_pin`: o perfil `portaria`/`admin` cria o pedido informando a senha
  digitada no teclado fisico (`personId` nulo no create; o worker resolve a
  pessoa pelo hash) e le somente o proprio documento.
- Nenhum perfil altera ou apaga documentos; o worker usa Admin SDK (ignora as
  Rules) para avancar `status`, gravar `result`, limpar `publicKey` e gravar o
  envelope cifrado. A colecao `pin_fingerprints` nao e legivel pelo frontend.

O PIN gerado nunca e persistido em texto plano. O envelope cifrado pode ficar no
pedido concluido por curto periodo, mas somente o navegador que criou a chave
privada consegue abri-lo.

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
3. **PIN numerico gerado pelo sistema**: cada pessoa vinculada clica em "Gerar
   meu PIN". O worker gera o valor, garante unicidade e devolve o texto somente
   ao navegador por envelope cifrado. Uma nova solicitacao substitui o anterior.
4. **Futuro (opcional)**: autenticacao institucional via fluxo OAuth legado do
   SUAP para confirmar a identidade sem digitar dados. A base OAuth/SUAP ja
   existe isolada no backend; reativa-la seria decisao aprovada.

Regra: a geracao do PIN e feita somente pelo usuario autenticado que se vinculou
a uma `people`. O pedido associa `ownerUid` + `personId`, demonstrando que o
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

- O PIN e aleatorio, pessoal e intransferivel; o sistema nunca armazena o valor
  em texto plano. Mantem o hash bcrypt em `people.pinHash`, a impressao HMAC em
  `people.pinFingerprint`/`pin_fingerprints` para garantir unicidade e uma
  copia cifrada em `people.pinCiphertext` para recuperacao entre sessoes.
- A comparacao ocorre no worker (Admin SDK), nunca na PWA. A PWA apenas cria o
  pedido `verify_pin`; o worker processa e responde no mesmo documento.
- PIN incorreto nao bloqueia a conta nem exibe mensagem de bloqueio; a portaria
  pode tentar novamente e a confirmacao visual continua obrigatoria.
- O teclado fisico nao armazena a senha; ele apenas transmite os digitos para o
  sistema na hora da validacao.
- O PIN e permanente no perfil: `reveal_pin` recupera o valor cifrado quando o
  usuario retorna a aplicacao. Somente `generate_pin`, acionado explicitamente
  pelo usuario, cria e substitui o PIN.
- Na geracao, o navegador envia somente uma chave publica efemera. O worker
  devolve o PIN dentro de envelope ECDH P-256/AES-256-GCM; o texto e aberto
  somente em memoria no navegador que solicitou a geracao.
- Na recuperacao, o worker decifra `pinCiphertext` apenas no backend e devolve
  outro envelope ECDH-P256/AES-256-GCM; o PIN continua fora do Firestore em
  texto plano.
- O pedido de verificacao ainda transporta o PIN digitado em documento efemero,
  protegido pelas Rules para `portaria`/`admin` e apagado pelo worker apos o
  processamento. A senha permanente nunca e gravada nesse documento.

Ponto de revisao: a validacao da senha adiciona o worker no caminho da PWA
(processando `pin_requests` via Admin SDK) e exige autenticacao forte do
portaria/admin que invoca. Alternativa sem servico proprio seria aceitar a senha
apenas como segundo fator (posse) com confirmacao visual do porteiro na primeira
vez.

## 8. Permissoes por perfil

| Acao | usuario | portaria | admin |
| --- | --- | --- | --- |
| Consultar situacao das chaves | Sim | Sim | Sim |
| Gerar QR (standby) | Nao | Nao | Nao |
| Gerar o proprio PIN | Sim | - | - |
| Recuperar o PIN existente | Sim | - | - |
| Ler/validar QR (standby) | Nao | Nao | Nao |
| Validar senha numerica | Nao | Sim | Sim |
| Registrar retirada/devolucao | Nao | Sim | - |
| Ver dados pessoais de `people` | Nao | Sim | Sim |
| Auditar tokens, senhas e movimentacoes | Nao | Sim | Sim |

O perfil `usuario` continua sem qualquer escrita em movimentacoes, ocorrencias,
`people` ou dados administrativos. A unica escrita nova do usuario e criar/ler
seu pedido `generate_pin` ou `reveal_pin`; os campos do PIN sao gravados somente
pelo worker. `portaria` e `admin` criam/leem pedidos de validacao. Nenhum perfil
grava `people.pinHash` ou `people.pinCiphertext`.

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

### Fase 2 - Geracao do PIN (QR em standby)

Objetivo vigente: manter o codigo de QR preservado, sem disponibiliza-lo, e
gerar o PIN automaticamente com unicidade e entrega cifrada ao navegador.

Tarefas do QR em standby:

- [x] Criar colecao `qr_tokens/{qr-<aleatorio>}` com os campos do modelo (secao 5).
- [x] Gerar o id do token com `crypto.getRandomValues`/UUID v4 no cliente.
- [x] Remover o botao e os controles de QR da PWA sem apagar a implementacao.
- [x] Renderizar o QR no cliente (ex.: lib `qrcode`) codificando apenas o id do
      documento do token (`qr_tokens/qr-<aleatorio>`).
- [x] Aceitar as formas de exportacao CommonJS/ESM da biblioteca, remover o
      token se a renderizacao falhar e permitir gerar novamente sem deixar
      tokens ativos orfaos.
- [x] Ocultar automaticamente o QR apos cinco minutos e oferecer nova geracao.
- [x] Security Rules: o usuario cria somente o proprio token com
      `ownerUid = auth.uid`; nenhum outro perfil cria; ninguem lista tokens de
      terceiros.

Tarefas do PIN:

- [x] Criar `generate_pin` e `verify_pin` em `pin_requests` com Security Rules
      separando usuario vinculado de portaria/admin.
- [x] Worker gera PIN aleatorio, grava bcrypt, reserva HMAC em transacao e
      responde com envelope ECDH-P256/AES-256-GCM sem texto plano.
- [x] Tela no perfil publico com um unico botao para gerar/regenerar o PIN e
      exibir o valor somente em memoria.
- [x] Politica de PIN: exatamente 8 digitos, com mensagem simples para valor
      invalido e sem bloqueio de conta.
- [x] TTL curto (30-60s) e limpeza periodica de pedidos nao processados; o PIN
      permanente nunca e persistido em texto plano.

Criterios de aceite:

- O QR nao contem nome, matricula ou e-mail em texto aberto (somente o id opaco).
- O token expira apos o tempo configurado (padrao 5 minutos) e o QR deixa de ser
  valido ao expirar.
- O PIN gerado pelo sistema possui exatamente oito digitos numericos; o backend
  grava hash, impressao HMAC e copia cifrada, sem persistir o valor em texto
  plano.
- A PWA recebe o valor somente por envelope cifrado e o mantem em memoria.

### Fase 3 - Validar PIN na portaria (QR standby)

Objetivo: o porteiro recebe o PIN de oito digitos, valida a identidade no worker
e confirma a retirada. A leitura de QR nao faz parte desta fase ativa.

Tarefas do QR preservado (sem disponibilizacao):

- [x] Remover a tela, os controles e a solicitacao de camera da portaria;
      manter o codigo para retomada futura.
Tarefas do PIN:

- [x] Tela de validacao na portaria abre diretamente no campo PIN e aceita
      oito digitos, Enter ou o botao de validacao.
- [x] A PWA cria `verify_pin` em `pin_requests`; o worker compara com
      `people.pinHash` e devolve `result` sanitizado via `onSnapshot`.
- [x] PIN invalido retorna mensagem simples, sem bloqueio da conta no worker.
- [x] Nome/cargo retornam para conferencia antes da confirmacao da retirada.

Criterios de aceite:

- Retirada concluida sem digitar nome/matricula do responsavel pelo PIN.
- Senha incorreta nao identifica a pessoa e permite nova tentativa.

### Fase 4 - Auditoria e operacao

Objetivo: rastreabilidade completa da validacao por PIN, substituicao de PIN,
tentativas e relatorios. QR permanece fora do escopo enquanto estiver em
standby.

Tarefas:

- [ ] Gravar na movimentacao o metodo `pin` e o `personId` validado.
- [ ] Registrar eventos de PIN gerado, substituido, validado e rejeitado.
- [ ] Limpeza/arquivamento periodico de envelopes cifrados concluidos.
- [ ] Relatorio de retiradas por PIN para `admin`/`portaria` com pessoa,
      horario, porteiro e chave/sala.

Criterios de aceite:

- Toda retirada via PIN referencia a pessoa de origem e o metodo de validacao.
- Rejeicoes de PIN devem ser registradas em auditoria sem bloquear a conta.
- Relatorio lista retiradas por PIN no periodo selecionado sem expor dados
  desnecessarios.

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
- **Tentativas repetidas da senha numerica**: por decisao operacional, nao ha
  bloqueio automatico; o PIN continua com oito digitos e a portaria confirma a
  identidade antes de concluir a retirada.
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
