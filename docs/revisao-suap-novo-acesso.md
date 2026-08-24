# Revisao da raspagem SUAP com novo acesso

Data da revisao: 29/07/2026  
Escopo: diagnostico tecnico e plano de implementacao. Nenhuma alteracao de
dados foi feita no SUAP.

Escopo institucional: IFBA Campus Porto Seguro, identificado no SUAP como
campus `PS` e filtrado nas URLs analisadas por `campus=27`.

## 1. Resumo executivo

O novo acesso institucional permite consultar paginas comuns e administrativas
do SUAP relacionadas a salas e reservas. Isso melhora a integracao planejada,
porque o scraper pode deixar de depender apenas do relatorio comum e passar a
usar identificadores mais estaveis, principalmente o ID da sala e o ID da
solicitacao de reserva.

A arquitetura do projeto continua correta:

```text
SUAP web
  -> backend worker read-only de scraping/sincronizacao
  -> Firestore
  -> PWA Angular no Firebase Hosting
```

A PWA nao deve acessar o SUAP, cadastrar salas, cadastrar chaves ou criar
reservas. Ela deve apenas ler a copia sincronizada no Firestore e registrar a
retirada, devolucao, ocorrencias e historico operacional das chaves.

Recomendacao principal: evoluir o backend para separar explicitamente duas
rotinas de scraping:

- cadastro de salas agendaveis do Campus Porto Seguro, executado na
  configuracao inicial e depois sob demanda ou em baixa frequencia;
- reservas e ocupacoes futuras, executado periodicamente a partir da data atual.

## 2. Paginas analisadas

As paginas abaixo foram abertas em sessao autenticada read-only, usando o acesso
institucional autorizado, sem envio de formularios administrativos.

| Fonte | Finalidade observada | Uso recomendado |
| --- | --- | --- |
| `/admin/comum/sala/?predio__uo=27` | Listagem administrativa de salas do campus Porto Seguro. | Fonte primaria para cadastro de salas. |
| `/admin/comum/sala/?agendavel__exact=1&all=&predio__uo=27` | Listagem completa de salas agendaveis, sem limitar a primeira pagina. | Melhor URL atual para popular `rooms`, `keys` e `key_room_links`. |
| `/comum/sala/reservasala_relat/` | Relatorio comum com reservas, filtros de data, hora, campus, predio, sala e situacao. | Fonte operacional atual para reservas futuras deferidas. |
| `/admin/comum/reservasala/?data_inicio__year=2026` | Listagem administrativa de reservas efetivas, com sala, justificativa, solicitante e datas. | Candidata para complementar ou substituir o relatorio comum se expuser melhor identificacao. |
| `/admin/comum/solicitacaoreservasala/?data_inicio__year=2026` | Listagem administrativa de solicitacoes de reserva. | Fonte candidata para estados e IDs estaveis das solicitacoes. |
| `/admin/comum/solicitacaoreservasala/?data_inicio__month=7&data_inicio__year=2026` | Mesma listagem, filtrada por mes. | Boa para sincronizacao mensal/futura e reconciliacao controlada. |
| `/comum/sala/ver_solicitacao/44487/` | Detalhe de uma solicitacao, com dados da solicitacao, reservas geradas e agenda da sala. | Fonte de detalhe para enriquecer dados quando necessario. |
| `/comum/sala/solicitar_reserva/{salaId}/` | Agenda atual da sala e formulario de solicitacao. | Apenas leitura da agenda; nunca enviar o formulario. |

## 3. Permissoes disponiveis com novo usuario

O novo acesso autenticado consegue visualizar:

- listagem administrativa de salas;
- listagem administrativa de reservas;
- listagem administrativa de solicitacoes de reserva;
- relatorio comum de reservas de salas;
- detalhe de solicitacao;
- agenda atual da sala.

Tambem aparecem links e acoes administrativas em algumas paginas, como edicao,
visualizacao, informar ocorrencia ou cancelamento. Essas acoes nao fazem parte
do escopo do nosso sistema e devem ser ignoradas pelo scraper.

## 4. Campos encontrados

### Salas

Campos visiveis na listagem administrativa:

- ID da sala, extraido dos links `/admin/comum/sala/{id}/...`;
- nome;
- campus e predio;
- ativa;
- agendavel;
- avaliadores;
- opcoes/links relacionados, incluindo `Solicitar/Ver Reservas`.

As opcoes `Ativa`, `Agendavel` e `Solicitar/Ver Reservas` devem ser tratadas
como dados dinamicos. Um administrador do SUAP pode alterar essas configuracoes,
entao o scraper precisa atualizar o Firestore quando elas mudarem.

### Relatorio de reservas

Campos da tabela:

- sala;
- solicitante;
- instituicao do solicitante;
- data da solicitacao;
- situacao da solicitacao;
- periodo;
- previsao de publico;
- reserva cancelada;
- gratuito.

O relatorio tambem possui link `Visualizar` para
`/comum/sala/ver_solicitacao/{id}/`, que deve ser capturado para obter um
identificador externo mais estavel.

### Solicitacoes administrativas

Campos da tabela:

- sala solicitada;
- solicitante;
- periodo solicitado;
- previsao de publico;
- situacao;
- data da solicitacao;
- acoes com links para change e detalhe.

### Reservas administrativas

Campos da tabela:

- sala solicitada;
- justificativa;
- solicitante;
- data/hora de inicio;
- data/hora final.

### Detalhe da solicitacao

Campos estruturados observados:

- sala solicitada;
- informacoes complementares da sala;
- solicitante;
- instituicao do solicitante;
- periodo solicitado;
- previsao de publico;
- justificativa;
- interessados;
- tabela de reservas com periodo, ocorrencia e situacao;
- agenda atual da sala.

## 5. Filtros e parametros

Filtros relevantes identificados:

- `data_inicio` e `data_fim` no relatorio comum;
- `hora_inicio` e `hora_fim` no relatorio comum;
- `campus=27` para Porto Seguro (`PS`);
- `predio` e `sala` no relatorio comum;
- `situacao`, com opcoes Todas, Deferida e Indeferida;
- `data_inicio__year` nas listagens administrativas;
- `data_inicio__month` nas listagens administrativas;
- `status__exact` nas solicitacoes administrativas;
- `sala__predio__id__exact` nas solicitacoes administrativas;
- `agendavel__exact` e `ativa__exact` na listagem de salas;
- `all=` para evitar depender somente da primeira pagina quando suportado.

A sincronizacao produtiva deve gerar `data_inicio` sempre a partir da data atual
em `America/Sao_Paulo`. Em 29/07/2026, por exemplo, a janela nao deve iniciar
em 01/07/2026.

## 6. Diferencas entre acesso antigo e atual

Com o acesso anterior, a abordagem ficou limitada ao relatorio comum e a dados
mais resumidos. Com o novo acesso, e possivel:

- consultar a listagem administrativa de salas;
- obter todas as salas agendaveis, inclusive sem reservas futuras;
- enxergar solicitacoes com estados administrativos;
- abrir detalhes por ID de solicitacao;
- confirmar relacoes entre sala, solicitacao e reservas geradas.

Isso permite reduzir workarounds, remover listas fixas de salas e melhorar a
deduplicacao.

## 7. Tipos de reserva e ocupacao

A visao operacional deve separar tres formas principais de uso da chave:

1. Aulas nativas: aulas regulares do campus, previstas na programacao
   academica e vinculadas a turma, disciplina, professor, dia, horario e
   ambiente. Mesmo quando nao forem criadas pelo fluxo comum de solicitacao,
   elas representam ocupacao oficial e devem bloquear a chave somente durante
   o periodo cronologico correspondente.
2. Reservas SUAP nao regulares: reservas criadas no SUAP para aulas extras,
   projetos, reunioes, cursos, treinamentos, eventos, auditorio, ginasio,
   laboratorios e outros ambientes. Elas podem ter estados como pendente,
   deferida, indeferida ou cancelada. Para o Chaveiro IFBAPS, somente
   reservas validas e confirmadas devem bloquear.
3. Retirada avulsa na portaria: movimentacao operacional registrada na PWA,
   permitida quando a chave esta fisicamente disponivel, nao possui retirada
   aberta e nao existe aula ou reserva confirmada conflitante.

As duas primeiras categorias sao ocupacoes programadas do ambiente e entram na
copia sincronizada a partir do SUAP. A terceira nao e reserva nem ocupacao
programada: e uma movimentacao local da portaria.

O modelo normalizado pode detalhar as ocupacoes programadas com estes
subtipos:

- `aula_regular`;
- `solicitacao_reserva`;
- `reserva_deferida`;
- `aula_extra`;
- `contraturno`;
- `evento`;
- `auditorio_ginasio`;
- `outro`.

No MVP, somente aulas regulares confirmadas e reservas deferidas/validas devem
bloquear a retirada avulsa de uma chave, e apenas enquanto a data/hora atual
estiver dentro do intervalo da ocupacao. Registros pendentes, indeferidos,
cancelados ou futuros fora do horario de uso nao devem bloquear, salvo regra
institucional definida depois.

## 8. Aulas nativas

A pagina `/comum/sala/solicitar_reserva/{salaId}/` mostra a agenda atual da
sala, incluindo ocupacoes recorrentes de aulas. Essas entradas aparecem em
calendarios mensais e podem conter turma, disciplina, docente/responsavel,
horario e descricao.

Como essas aulas nao aparecem necessariamente como solicitacoes avulsas, elas
devem ser tratadas como outro tipo de ocupacao. A recomendacao e nao usar essa
pagina como fonte primaria geral no primeiro passo, porque exigiria visitar uma
URL por sala. Ela deve entrar como segunda etapa para complementar as reservas,
principalmente quando o relatorio comum ou as paginas administrativas nao
incluirem aulas regulares.

## 9. Auditorio, ginasio e outros ambientes

A listagem de salas inclui ambientes que nao sao apenas salas de aula, como
auditorio, ginasio, laboratorios e salas administrativas agendaveis. O modelo
nao deve assumir que toda chave e sala de aula.

Campos recomendados em `rooms`:

- `roomCode`, como `A06`, `C08` ou codigo equivalente;
- `name`;
- `type`, quando inferivel pelo nome;
- `building`;
- `campus`;
- `schedulable`;
- `active`;
- `source`;
- `externalId`.

## 10. Problemas no codigo atual

O codigo atual ja implementa uma base funcional:

- login Playwright no SUAP;
- leitura de salas por listagem administrativa;
- leitura paginada do relatorio comum;
- normalizacao de periodo;
- escrita de reservas, salas, chaves e vinculos no Firestore;
- cache em memoria;
- scheduler com backoff;
- marcacao de ausencia como `suspect_absent` antes de `absent`;
- registro de status da sincronizacao.

Pontos que devem ser corrigidos ou evoluidos:

- o parser do relatorio comum ainda ignora o link `Visualizar`, perdendo o ID
  estavel da solicitacao;
- o `externalId` da reserva e gerado por hash de sala, solicitante, data da
  solicitacao e periodo; se algum desses campos mudar, pode surgir novo
  documento em vez de atualizacao;
- a classificacao ainda trata quase tudo como reserva do relatorio, sem separar
  aulas regulares, contraturno, eventos e ocupacoes especiais;
- as paginas administrativas de `reservasala` e `solicitacaoreservasala` ainda
  nao foram incorporadas como fontes;
- o detalhe `ver_solicitacao/{id}` ainda nao e usado para enriquecer ou
  reconciliar dados;
- a leitura de agenda por sala pode ser custosa se for executada para todas as
  salas em intervalos curtos;
- a rotina de salas e a rotina de reservas precisam ficar separadas em agenda,
  frequencia e metricas.

## 11. Proposta de nova arquitetura de scraping

Separar o backend em providers/fases:

```text
SuapSession
  -> RoomCatalogScraper
  -> ReservationReportScraper
  -> AdminRequestScraper
  -> RoomScheduleScraper
  -> Normalizer
  -> FirestoreSync
```

Responsabilidades:

- `SuapSession`: login, renovacao de sessao, timeout, retry e bloqueio contra
  POST acidental.
- `RoomCatalogScraper`: coleta salas agendaveis e atualiza `rooms`, `keys` e
  `key_room_links`.
- `ReservationReportScraper`: coleta reservas futuras em lote pelo relatorio
  comum.
- `AdminRequestScraper`: coleta solicitacoes futuras, estados e IDs estaveis.
- `RoomScheduleScraper`: coleta agenda por sala apenas quando necessario para
  aulas regulares ou lacunas.
- `Normalizer`: converte origens diferentes para `occupancies`.
- `FirestoreSync`: faz upsert, marca ausencias, grava eventos e status.

## 12. Modelo de dados sugerido

Manter colecoes existentes e adicionar uma camada normalizada de ocupacoes:

```text
rooms/{suapRoomId}
keys/{keyId}
key_room_links/{keyId}__{roomId}
reservations/{externalReservationId}
occupancies/{externalOccupancyId}
key_movements/{movementId}
key_locks/{keyId}
key_occurrences/{occurrenceId}
reservation_sync_events/{eventId}
sync_status/current
```

Campos sugeridos para `occupancies`:

```json
{
  "externalId": "suap-request-44487-2026-07-29T14:00",
  "source": "suap-web",
  "sourceKind": "solicitacao_reserva",
  "sourceUrl": "/comum/sala/ver_solicitacao/44487/",
  "requestExternalId": "44487",
  "roomExternalId": "1304",
  "roomCode": "C08",
  "roomName": "C08 - LABORATORIO DE INFORMATICA II",
  "startsAt": "2026-07-29T14:00:00.000-03:00",
  "endsAt": "2026-07-29T17:00:00.000-03:00",
  "responsibleName": "Nome omitido no exemplo",
  "status": "active",
  "blocksKey": true,
  "fingerprint": "sha256:...",
  "firstSeenAt": "2026-07-29T00:00:00.000Z",
  "lastSyncedAt": "2026-07-29T00:00:00.000Z"
}
```

`reservations` pode continuar existindo durante a transicao, mas a PWA deve
evoluir para consultar a projecao operacional derivada de `occupancies`,
`rooms`, `keys` e `key_movements`.

## 13. Estrategia de sincronizacao incremental

### Salas

- executar na configuracao inicial;
- permitir sincronizacao manual por admin;
- executar rotina eventual, por exemplo diaria ou semanal;
- usar `externalId` da sala como ID do documento;
- atualizar `active`, `schedulable` e `scheduleUrl` quando o SUAP alterar as
  opcoes da sala;
- marcar sala como inativa se deixar de aparecer em sincronizacoes confirmadas;
- nunca remover automaticamente historico de chaves.

### Reservas e ocupacoes

- executar continuamente, inicialmente a cada 5 minutos, com intervalo
  configuravel;
- consultar sempre de hoje em diante;
- usar janela futura configurada, por exemplo 30, 60 ou 90 dias;
- usar pequeno retrocesso tecnico apenas se necessario para reconciliar o dia
  atual, sem reprocessar historico antigo;
- usar ID da solicitacao quando existir;
- usar ID da sala e horario para diferenciar ocorrencias recorrentes;
- comparar `fingerprint` para detectar alteracoes;
- marcar ausencia como suspeita antes de considerar removida;
- cancelar somente quando houver campo explicito de cancelamento ou estado
  confiavel equivalente.

### Aulas nativas e detalhes

- definir frequencia apos confirmar a fonte mais estavel;
- preferir rotina diaria ou por turno quando a fonte for consolidada e barata;
- usar sincronizacao semanal/manual quando a fonte refletir grade pouco mutavel;
- usar detalhe de solicitacao sob demanda ou apenas para registros
  novos/alterados;
- evitar varrer a agenda individual de todas as salas a cada ciclo curto.

## 14. Riscos e limitacoes

- O SUAP pode alterar HTML, nomes de campos ou paginacao.
- Paginas administrativas exibem acoes que nao devem ser acionadas.
- Dados pessoais devem ser minimizados no Firestore e exibidos conforme perfil.
- A agenda por sala pode gerar muitas requisicoes se consultada para todas as
  salas em todo ciclo.
- O relatorio comum pode ocultar detalhes que so aparecem no detalhe da
  solicitacao.
- O hash atual pode duplicar registros quando dados textuais mudarem.
- Falha temporaria no SUAP nao pode liberar chave bloqueada automaticamente.

## 15. Plano de implementacao

1. Capturar links `Visualizar` no parser do relatorio comum e salvar
   `requestExternalId`.
2. Criar contrato `occupancy` sem remover imediatamente `reservation`.
3. Implementar `AdminRequestScraper` para solicitacoes futuras com filtros por
   ano/mes/status.
4. Reconciliar relatorio comum com solicitacoes administrativas pelo ID da
   solicitacao.
5. Ajustar deduplicacao para usar `requestExternalId + roomExternalId +
   startsAt + endsAt`.
6. Separar scheduler de salas e scheduler de ocupacoes.
7. Adicionar rotina manual/baixa frequencia para salas.
8. Adicionar coleta seletiva de agenda por sala para aulas regulares, com limite
   de taxa e janela futura.
9. Persistir `occupancies` e manter `reservations` como compatibilidade durante
   a transicao.
10. Atualizar a PWA para ler a projecao operacional final, sem acessar SUAP nem
    backend HTTP.
11. Criar testes com fixtures sanitizadas para relatorio, admin solicitacoes,
    admin reservas, detalhe e agenda por sala.
12. Validar em ambiente real comparando Firestore com a tela visual do SUAP para
    hoje e datas futuras.

## 16. Criterios de teste e validacao

- Login read-only no SUAP sem imprimir usuario, senha, cookies ou HTML bruto.
- Nenhuma requisicao `POST`, `PUT`, `PATCH` ou `DELETE` nas paginas SUAP.
- Listagem de salas retorna todas as salas agendaveis esperadas do Campus Porto
  Seguro (`PS`).
- Sincronizacao de reservas inicia em 29/07/2026 ou na data corrente em
  `America/Sao_Paulo`, nunca no passado historico.
- Paginas paginadas sao percorridas ate o fim.
- IDs de solicitacao sao capturados quando houver link `ver_solicitacao/{id}`.
- Alteracao de horario ou sala atualiza o registro correto.
- Cancelamento so e aplicado com evidencia explicita.
- Ausencia temporaria vira `suspect_absent`, nao apagamento imediato.
- Chave fica bloqueada somente durante o intervalo cronologico da ocupacao
  ativa/deferida, considerando `startsAt <= agora < endsAt`.
- Retirada avulsa continua permitida quando nao existe ocupacao programada
  conflitante com o uso solicitado.
- Firestore nao recebe segredos, cookies, tokens ou HTML bruto do SUAP.
- PWA continua lendo apenas Firestore e registrando apenas movimentacoes
  operacionais.
