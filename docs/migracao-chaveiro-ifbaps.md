# Migracao para Chaveiro IFBAPS

Data de referencia: 24/08/2026.

O identificador tecnico do projeto foi alterado de `keychain-ifbaps` para
`chaveiro-ifbaps`. O nome exibido na PWA passou a ser **Chaveiro IFBAPS**.

## Componentes atualizados

- Repositorio GitHub: `jacsonlinux/chaveiro-ifbaps`.
- Projeto Firebase: `chaveiro-ifbaps`.
- Hosting: `https://chaveiro-ifbaps.web.app`.
- Projeto na VM: `/opt/chaveiro-ifbaps`.
- Configuracao externa: `/etc/chaveiro-ifbaps`.
- PM2: `chaveiro-ifbaps-backend` e `chaveiro-ifbaps-sync-worker`.
- Pacotes, build Angular, caminhos de dist e documentacao tecnica.
- Favicon, manifesto PWA e icones novos em `frontend/public/icons`.

## Segredos e legado

As credenciais do novo projeto ficam fora do repositorio em
`/etc/chaveiro-ifbaps`. O diretorio antigo foi preservado como backup em
`/etc/keychain-ifbaps-legacy-20260824`; ele nao e usado pelo runtime atual.

## Pendencia de infraestrutura

O novo projeto Firebase ainda precisa ter a API do Cloud Firestore habilitada
pelo proprietario do projeto. A conta de servico fornecida nao possui permissao
para habilitar APIs. Enquanto isso, o Hosting esta publicado, o backend inicia
com a nova configuracao e o worker permanece online, mas os ciclos de
sincronizacao que escrevem no Firestore falham com `SERVICE_DISABLED`.

Depois de habilitar o Firestore no console do projeto `chaveiro-ifbaps`, devem
ser executados:

```bash
cd /opt/chaveiro-ifbaps/frontend
firebase deploy --only firestore --project chaveiro-ifbaps

cd /opt/chaveiro-ifbaps/backend
npm run pm2:reload
```

A habilitacao da autenticacao Google e a criacao dos perfis iniciais tambem
devem ser conferidas no novo projeto antes da validacao autenticada da PWA.
