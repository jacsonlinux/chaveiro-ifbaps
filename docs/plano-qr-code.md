# Plano: Identificacao por QR Code na retirada de chaves

Proposta para revisao. Este documento analisa a ideia de identificacao por
QR Code dentro da arquitetura atual do sistema (Firebase Authentication,
Firestore direto com Security Rules, perfis `usuario`, `portaria` e `admin`) e
propõe um plano por fases. Nenhuma mudanca de codigo deve começar antes da
aprovacao deste documento e das decisoes pendentes listadas no final.

Escopo: IFBA Campus Porto Seguro (`PS`).

## 1. Contexto

Hoje a portaria digita manualmente nome, matricula e dados do responsavel na
retirada de uma chave. Isso gera retrabalho, erros de digitacao e rastreabilidade
limitada.

A proposta e aproveitar o perfil publico existente (`usuario`, somente leitura)
para permitir que a propria pessoa gere um QR Code temporario de identificacao.
O porteiro le esse QR e o sistema preenche automaticamente os dados do
responsavel. O porteiro apenas confirma a saida da chave.

A base de pessoas ja existe em tabelas externas (nome, matricula e e-mail de
servidores/tecnicos/professores e de alunos) e pode ser importada para o banco.

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

## 4. Decisao de arquitetura recomendada

A proposta original fala em "consultar o token no back-end". Para preservar a
arquitetura atual (sem API propria de negocio para a PWA), recomenda-se:

- Geracao e validacao do token via documentos Firestore + Security Rules +
  transacoes, mesmo padrao ja usado em `key_locks` e nas retiradas.
- O token e um identificador aleatorio opaco; o QR nao carrega nome, matricula
  ou dados pessoais em texto aberto, apenas o id do documento do token.
- A leitura/consumo do token (uso unico) e feita por transacao: o porteiro le o
  documento, valida nao usado e nao expirado, marca `usedAt`, `usedBy` e vincula
  a movimentacao no mesmo batch.

Ponto de revisao: se a instituicao exigir validacao criptografica no servidor
(fora do cliente Firebase), a alternativa e um endpoint minimalista no worker ou
uma Cloud Function. Essa seria uma decisao arquitetural nova a ser aprovada, pois
adicionaria um servico no caminho da PWA.

## 5. Modelo de dados proposto

### `people/{personId}` (novo)

Base institucional importada das tabelas existentes (servidores/tecnicos/
professores e alunos). Somente o backend com Admin SDK grava; PWA nunca escreve.

```json
{
  "id": "p-servidor-<matricula>",
  "name": "Nome completo",
  "institutionalEmail": "nome@ifba.edu.br",
  "matricula": "202000000",
  "kind": "servidor | tecnico | professor | aluno",
  "campus": "PS",
  "active": true,
  "importedAt": "2026-08-19T18:00:00Z"
}
```

Regras de acesso: somente `portaria` e `admin` leem dados pessoais completos. O
perfil `usuario` nao acessa `people`.

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

### Vinculo com a movimentacao

`key_movements` passa a aceitar campos opcionais de origem QR:

```text
qrTokenId
qrVerifiedAt
qrVerifiedByUid
qrVerifiedByEmail
qrPersonId
```

Isso permite auditoria completa: quem gerou, quando, quem leu, quando e em qual
movimentacao.

## 6. Identificacao e autenticacao institucional

Etapa recomendada em fases:

1. **Vinculo por e-mail institucional**: ao logar com Google, o sistema tenta
   casar o e-mail autenticado com `people.institutionalEmail`. Funciona bem para
   servidores/tecnicos/professores com conta @ifba.edu.br.
2. **Fallback por matricula**: se o e-mail Google nao casar (caso comum de
   alunos que usam conta pessoal), o usuario informa a matricula. O sistema
   vincula `people` e exige confirmacao do porteiro. A validacao de posse da
   matricula pode ser reforçada depois (ver ponto de revisao).
3. **Futuro (opcional)**: autenticacao institucional via fluxo OAuth legado do
   SUAP para confirmar a identidade sem digitar dados. A base OAuth/SUAP ja
   existe isolada no backend; reativa-la seria decisao aprovada.

Regra: a geracao do QR e feita somente pelo usuario autenticado que se vinculou
a uma `people`. O QR associa `ownerUid` + `personId`, demonstrando que o proprio
usuario iniciou o processo.

## 7. Seguranca do token

- Aleatorio (crypto random) e longo o suficiente para inviabilizar adivinhacao.
- Validade curta (ex.: 3 a 5 minutos) e configuravel.
- Uso unico: transacao Firestore impede consumo duplo (mesmo padrao de
  `key_locks`).
- Invalida-se apos uso e apos expirar.
- Registra geracao, validacao, porteiro que leu e movimentacao vinculada.
- O perfil `usuario` cria somente o proprio token e nao le tokens de terceiros.

## 8. Permissoes por perfil

| Acao | usuario | portaria | admin |
| --- | --- | --- | --- |
| Consultar situacao das chaves | Sim | Sim | Sim |
| Gerar o proprio QR | Sim | - | - |
| Ler/validar QR | Nao | Sim | Sim |
| Registrar retirada/devolucao | Nao | Sim | - |
| Ver dados pessoais de `people` | Nao | Sim | Sim |
| Auditar tokens e movimentacoes | Nao | Sim | Sim |

O perfil `usuario` continua sem qualquer escrita em movimentacoes, ocorrencias,
`people` ou dados administrativos. A unica escrita nova e criar/apagar o proprio
documento em `qr_tokens`.

## 9. Auditoria

Eventos a registrar (podem usar `key_occurrences`/novo log ou campos no proprio
token):

- token gerado (usuario, horario);
- token validado (porteiro, horario);
- token rejeitado (expirado, ja usado, pessoa inativa);
- movimentacao vinculada ao token;
- tentativa de uso duplo.

Cada evento registra quem, quando e a chave/sala envolvida.

## 10. Privacidade

- `people` e `qr_tokens` contem dados pessoais e ficam restritos por Security
  Rules a `portaria`/`admin` (e ao proprio `ownerUid` no caso do token).
- O QR nao carrega PII.
- Nenhuma colecao nova e legivel pelo perfil publico.

## 11. Plano por fases

| Fase | Descricao | Resultado esperado |
| --- | --- | --- |
| 0 | Importar tabelas de pessoas para `people` (backend + script/CSV) | Base institucional de servidores/tecnicos/professores e alunos no Firestore |
| 1 | Vinculo Firebase usuario x `people` (e-mail e fallback matricula) | Usuario autenticado identifica-se no sistema |
| 2 | Gerar QR: colecao `qr_tokens`, botao no perfil publico, Security Rules | Usuario gera token temporario; QR sem PII |
| 3 | Ler QR: camara na portaria, validacao por transacao, preenchimento automatico e retirada | Porteiro confirma retirada sem digitar nome/matricula |
| 4 | Auditoria e operacao: vinculacao na movimentacao, logs, expiracao e uso unico | Rastreabilidade completa; relatorio de QR lidos |
| 5 | (Futuro/opcional) autenticacao institucional via SUAP | Validacao de identidade sem digitacao manual |

Criterios de aceite por fase serao definidos no detalhamento aprovado.

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
  API; se houver exigencia de validacao no servidor, decisao arquitetural nova.

## 13. Perguntas para decisao

1. A base `people` (servidor/tecnico/professor/aluno) sera importada por CSV/JSON
   periodicamente pelo worker? Quem fornece as planilhas atualizadas?
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

## 14. Apos a aprovacao

- Atualizar `docs/arquitetura.md` (colecoes, regras, perfis e decisao sobre API).
- Atualizar `docs/diagramas.md` (fluxo de QR na arquitetura e na operacao).
- Atualizar `docs/plano-implementacao.md` com as fases aprovadas.
- Atualizar Security Rules, indices e o modelo do frontend.