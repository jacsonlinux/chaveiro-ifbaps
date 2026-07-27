# AGENTS.md

## Projeto

Sistema de controle de chaves da portaria para o IFBA/IFBAPS, inicialmente com
cadastro local de chaves, salas, retiradas, devolucoes e historico. A integracao
com SUAP deve ser tratada como etapa futura, dependente de autorizacao/API
oficial da instituicao.

## Estrutura atual

- `README.md`: documento de planejamento do projeto.
- `docs/arquitetura.md`: arquitetura inicial, estrutura alvo, regras e decisoes
  pendentes.
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
Frontend/PWA
  -> Backend proprio
  -> Banco de dados / Firebase, conforme decisao tecnica
  -> API do SUAP, se autorizada e disponivel
```

O frontend nao deve guardar `client_secret`, service account, senha do SUAP ou
qualquer credencial administrativa. Chamadas privilegiadas devem passar pelo
backend.

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
- `keychain-backend-mvp`: backend Node.js/TypeScript, API, autenticacao,
  autorizacao, auditoria e Firestore.
- `keychain-frontend-pwa`: frontend Angular/PWA, telas operacionais e Firebase
  Hosting.
- `keychain-key-movement-rules`: regras de chaves, salas, retiradas,
  devolucoes, ocorrencias, estados, auditoria e reserva futura/SUAP.

## Fechamento de alteracoes

Quando uma atualizacao for concluida e validada, fazer commit e push para o
remoto configurado, salvo pedido explicito para manter as alteracoes apenas
locais.
