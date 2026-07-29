# AGENTS.md

## Projeto

Sistema de controle de chaves da portaria para o IFBA Campus Porto Seguro,
identificado no SUAP como campus `PS` e filtrado atualmente por `campus=27`.
Salas, aulas nativas e reservas vem do SUAP por leitura automatizada read-only
autorizada, sao sincronizadas no Firestore e consumidas pela PWA. A PWA nao
cadastra salas, chaves, aulas ou reservas: ela registra somente retiradas,
devolucoes, ocorrencias e historico. Uma API oficial pode substituir o provider
no futuro, sem mudar essa responsabilidade. A consulta publica da PWA e somente
leitura para usuarios Google autenticados; escrita operacional fica restrita a
portaria/admin.

## Estrutura atual

- `README.md`: documento de planejamento do projeto.
- `docs/arquitetura.md`: arquitetura inicial, estrutura alvo, regras e decisoes
  pendentes.
- `docs/plano-implementacao.md`: plano resumido de implementacao, progresso e
  pendencias.
- `docs/fluxos-e-modelo.md`: fluxos, fontes do SUAP e modelo das colecoes.
- `.agents/skills/`: workflows especificos para agentes que trabalham neste
  repositorio.
- `backend/`: backend proprio do sistema.
- `frontend/`: frontend/PWA do sistema.

## Segredos e configuracao

Os arquivos sensiveis estao fora do repositorio, em:

- `/etc/keychain-ifbaps/.env`
- `/etc/keychain-ifbaps/keychain-ifbaps-firebase-adminsdk-fbsvc-9a18ddb436.json`

Regras:

- Nunca copiar `.env`, JSON de service account, tokens, senhas ou chaves privadas
  para dentro do repositorio.
- Nunca imprimir o conteudo desses arquivos em logs, respostas ou testes.
- O backend pode ler esses arquivos em runtime, mas o frontend nao deve acessar
  segredos diretamente.
- Se forem necessarios exemplos de configuracao, criar arquivos sem valores reais,
  como `.env.example`.

## Arquitetura esperada

```text
SUAP web
  -> Backend worker read-only de scraping/sincronizacao
  -> Firestore
  -> Frontend/PWA Angular no Firebase Hosting
```

O frontend nao deve guardar `client_secret`, service account, senha do SUAP ou
qualquer credencial administrativa. A PWA nao acessa o SUAP nem depende de uma
API propria; leituras e escritas do app passam pelo Firebase SDK e sao protegidas
por Firebase Authentication e Firestore Security Rules. O worker de scraping
usa o Firebase Admin SDK apenas no backend.

Qualquer expansao para outro campus deve ser tratada como nova decisao
arquitetural e configuracao explicita; o escopo atual e Porto Seguro (`PS`).

## Diretrizes de implementacao

- Comecar pelo MVP sem depender do SUAP.
- Manter regras de negocio auditaveis: quem retirou, quem registrou, horario,
  chave/sala, devolucao e observacoes.
- Preferir alteracoes pequenas e verificaveis.
- Documentar decisoes que afetem seguranca, autenticacao, auditoria ou dados
  institucionais.

## Skills do repositorio

As skills ficam em `.agents/skills/<nome>/SKILL.md` e devem ser usadas como
orientacao especifica quando o assunto corresponder ao escopo delas:

- `keychain-docs-architecture`: documentacao, arquitetura, decisoes e skills.
- `keychain-validated-commit-push`: validacao final, commit e push de
  atualizacoes concluidas.
- `keychain-secrets-runtime`: segredos, ambiente, Firebase Admin, PM2, deploy e
  higiene do repositorio.
- `keychain-suap-readonly-sync`: leitura read-only de reservas do SUAP,
  raspagem autorizada, sincronizacao, cache, Firestore e deduplicacao.
- `keychain-backend-mvp`: backend Node.js/TypeScript, API, autenticacao,
  autorizacao, auditoria e Firestore.
- `keychain-frontend-pwa`: frontend Angular/PWA, telas operacionais e Firebase
  Hosting.
- `keychain-app-designer`: linguagem visual, UX responsiva e padroes extraidos
  do dashboard Keywest Petshop para a PWA Angular.
- `keychain-ux-portaria-minimal`: UX minimalista, acessivel e orientada a poucos
  cliques para a operacao diaria da portaria.
- `keychain-key-movement-rules`: regras de chaves, salas, retiradas,
  devolucoes, ocorrencias, estados, auditoria e reserva futura/SUAP.

## Fechamento de alteracoes

Quando uma atualizacao for concluida e validada, fazer commit e push para o
remoto configurado, salvo pedido explicito para manter as alteracoes apenas
locais.
