# Backend

Backend Node.js/TypeScript do Sistema de Controle de Chaves IFBA/IFBAPS.

## Scripts

```bash
npm install
npm run check
npm run build
npm start
```

## Endpoints iniciais

- `GET /health`: status do servico e configuracao nao sensivel.
- `GET /api/reservations`: lista reservas normalizadas pelo provider ativo.
- `POST /api/reservations/sync`: executa sincronizacao manual pelo provider ativo.

## Configuracao

O backend le configuracao publica de processo e configuracao sensivel do arquivo
externo definido por `EXTERNAL_ENV_PATH`, com padrao:

```text
/etc/keychain-ifbaps/.env
```

Nao coloque segredos no repositorio. Use `backend/.env.example` apenas como
referencia de nomes de variaveis.

## Providers de reserva

`SUAP_RESERVATION_PROVIDER` define o provider ativo:

- `local`: provider local sem dependencia do SUAP. Padrao atual.
- `api`: reservado para API oficial do SUAP, quando existir endpoint autorizado.
- `web-readonly`: reservado para leitura controlada da interface web do SUAP.

O provider `web-readonly` ainda nao faz login nem raspagem real. Ele existe para
fixar o contrato e impedir que o frontend ou outras partes do sistema dependam
diretamente do SUAP.
