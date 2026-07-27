# AGENTS.md

## Projeto

Sistema de controle de chaves da portaria para o IFBA/IFBAPS, inicialmente com
cadastro local de chaves, salas, retiradas, devolucoes e historico. A integracao
com SUAP deve ser tratada como etapa futura, dependente de autorizacao/API
oficial da instituicao.

## Estrutura atual

- `README.md`: documento de planejamento do projeto.
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

