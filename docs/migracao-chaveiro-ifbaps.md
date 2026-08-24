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

## Firestore habilitado

O banco `(default)` do projeto `chaveiro-ifbaps` foi criado em modo Standard,
a API do Cloud Firestore foi habilitada e as Rules e indices foram publicados.
O backend e o worker foram recarregados depois dessa configuracao:

```bash
cd /opt/chaveiro-ifbaps/frontend
firebase deploy --only firestore --project chaveiro-ifbaps

cd /opt/chaveiro-ifbaps/backend
npm run pm2:reload
```

A sincronizacao read-only do SUAP e a autenticacao Google ainda devem ser
validadas em sessao operacional antes de considerar a migracao encerrada.
