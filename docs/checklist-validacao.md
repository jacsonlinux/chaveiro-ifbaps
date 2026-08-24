# Checklist de validacao

Data de referencia: 29/07/2026  
Escopo: IFBA Campus Porto Seguro (`PS`, `campus=27`).

Este checklist registra evidencias da fase de validacao sem armazenar
credenciais, cookies, HTML bruto ou dados pessoais.

## Sincronizacao e scraping

- [x] Listagem read-only do SUAP retornou 34 salas do Campus Porto Seguro.
- [x] Firestore preserva 36 documentos de sala: 34 operacionais ativos e 2
  documentos provisórios históricos desativados por ausência na listagem atual;
  esses 2 não entram na disponibilidade operacional.
- [x] Dry-run de todas as 34 salas executado sem escrita no SUAP ou Firestore.
- [x] Janela futura de 7 dias aplicada; datas passadas ficaram fora da coleta.
- [x] Dry-run normalizou 104 ocupacoes: 54 `aula_regular`, 25 `evento` e 25
  `outro`.
- [x] Worker PM2 habilitado com 34 salas, janela de 7 dias e intervalo geral
  de 5 minutos.
- [x] Primeiro ciclo continuo persistido com 20 reservas, 104 ocupacoes de
  agenda, 34 salas visitadas e 0 falhas.
- [x] Segundo ciclo continuo concluido entre 16:27:26Z e 16:28:19Z, com os
  mesmos contadores: 34 salas, 104 ocupacoes, 20 reservas e 0 falhas.
- [x] Terceiro ciclo continuo concluido entre 16:43:19Z e 16:44:28Z, com os
  mesmos contadores: 34 salas, 104 ocupacoes, 20 reservas e 0 falhas.

## Regras cronologicas

- [x] Antes de uma ocupacao real: chave `A08` ficou `disponivel`.
- [x] Durante a ocupacao real: chave `A08` ficou
  `bloqueada_por_reserva`.
- [x] Depois do horario final: chave `A08` voltou a `disponivel`.
- [x] Nenhuma janela antecipada de 30 minutos foi aplicada.
- [x] Retirada avulsa com previsao que ultrapassa a proxima ocupacao e
  recusada pelo cliente Firestore.
- [ ] Retirada avulsa real validada na PWA com uma conta `portaria`.

## PWA e Firestore

- [x] PWA Angular compilada com sucesso.
- [x] Hosting respondeu `HTTP 200` em `https://keychain-ifbaps.web.app`.
- [x] Tela de login carregou em smoke test headless.
- [x] PWA operacional le `occupancies` diretamente para a agenda da portaria.
- [x] Security Rules compiladas e publicadas.
- [x] Criacao de movimentacao foi restringida a `retirada` auditavel.
- [x] Devolucao exige atualizacao de retirada aberta por operador autenticado.
- [x] Lock concorrente nao pode ser substituido por nova retirada.
- [x] Firestore Web inicializa cache persistente IndexedDB para a PWA.
- [x] Worker prepara verificador PBKDF2 em `pin_offline_verifiers` quando gera
  um novo PIN.
- [x] Retirada/devolucao offline usa `writeBatch` e exibe sincronizacao pendente.
- [ ] Login real de portaria validado na publicacao atual.
- [ ] Retirada vinculada a ocupacao validada na PWA.
- [ ] Retirada avulsa em lote validada na PWA.
- [ ] Devolucao validada na PWA.
- [ ] Atualizacao em tempo real conferida em duas telas autenticadas.
- [ ] Layout e fluxo conferidos em desktop e mobile durante as operacoes.
- [ ] Queda de internet validada com sessao ja autenticada, PIN sincronizado,
  retirada pendente e reconexao.

## Revalidacao automatizada

Em 29/07/2026, antes da validacao autenticada, foram repetidos os checks que
nao dependem de uma sessao Google:

- [x] Backend: `npm run check`, com 35 arquivos de teste e 100 testes aprovados.
- [x] Frontend: `npm run build` concluido sem erro.
- [x] Hosting: `https://keychain-ifbaps.web.app` respondeu `HTTP 200`.
- [x] Healthcheck: backend em modo `firebase` e provider `web-readonly`.
- [x] PM2: `keychain-ifbaps-backend` e `keychain-ifbaps-sync-worker` online.
- [x] Retirada avulsa em lote usa uma transacao Firestore unica; a validacao
  visual da operacao real continua pendente na PWA.
- [x] Apos o reload do worker, o ciclo de 16:47:59Z a 16:48:57Z terminou sem
  falhas e `nextRunAt` foi persistido para 17:03:57Z.
- [x] Consultas REST sem autenticacao para `rooms` e `occupancies` retornaram
  `HTTP 403`, confirmando a protecao das leituras do Firestore.
- [x] Hosting permaneceu em `HTTP 200` e o healthcheck do backend permaneceu
  `status=ok` apos o reload.
- [x] Nenhuma credencial, cookie ou segredo foi usado como evidencia.

O teste offline deve ser feito somente em dispositivo confiavel. O login Google
novo nao faz parte do teste sem internet; a sessao, o catalogo e os
verificadores de PIN precisam ter sido carregados antes da desconexao.

## Referencias publicadas

- Commit da migracao da PWA: `31de347`.
- Commit da ativacao controlada do worker: `b6cf5be`.
- Commit do endurecimento das Rules: `c7f3af2`.
- URL da PWA: `https://keychain-ifbaps.web.app`.

## Reset operacional para novos testes

Em 29/07/2026, os dados operacionais gerados pelos testes foram limpos para
reiniciar a validação da PWA:

- `key_movements`: 32 documentos removidos;
- `key_locks`: 9 documentos removidos;
- `key_occurrences`: nenhum documento existente;
- salas, chaves, vínculos, reservas e ocupações preservados.

Após o reset, as três coleções operacionais ficaram vazias. Novos testes devem
ser executados pelo roteiro autenticado e todas as chaves retiradas devem ser
devolvidas ao final.

## Criterio de encerramento

A fase somente sera encerrada quando ciclos continuos adicionais permanecerem
sem falhas e todos os itens autenticados da PWA estiverem conferidos. Nenhuma
credencial deve ser colocada neste documento.
