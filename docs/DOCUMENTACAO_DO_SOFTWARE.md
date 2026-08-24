# Chaveiro IFBAPS - Documentacao do software

> Documento tecnico consolidado: reune identificacao, finalidade, arquitetura,
> dados, fluxos, regras de negocio, implantacao, manual resumido e referencia
> visual da aplicacao. A versao PDF correspondente e
> `docs/DOCUMENTACAO_DO_SOFTWARE.pdf`.

## 1. Identificacao

| Campo | Informacao |
|---|---|
| Nome | Chaveiro IFBAPS |
| Instituicao | IFBA - Campus Porto Seguro |
| Escopo | Campus Porto Seguro, identificado no SUAP como `PS` e `campus=27` |
| Tipo | Aplicacao web progressiva para controle operacional de chaves |
| Repositorio | <https://github.com/jacsonlinux/chaveiro-ifbaps> |
| Aplicacao | <https://chaveiro-ifbaps.web.app> |
| Frontend | Angular 22, TypeScript, Angular Material e Service Worker |
| Backend | Node.js/TypeScript, Playwright, PM2 e Firebase Admin SDK |
| Persistencia | Cloud Firestore |
| Autenticacao | Firebase Authentication com Google |
| Fonte externa | SUAP web, por leitura automatizada read-only autorizada |

Este documento descreve o produto atual. Funcionalidades futuras sao marcadas
como evolucao e nao devem ser interpretadas como capacidade ja implantada.

## 2. Finalidade e escopo

O Chaveiro IFBAPS digitaliza a operacao da portaria do Campus Porto Seguro:
consulta salas e ocupacoes, identifica a chave correspondente, registra a
retirada, acompanha a pessoa que esta com a chave e registra a devolucao.

O SUAP continua sendo o sistema oficial de solicitacao, analise, deferimento e
cancelamento de reservas. O Chaveiro IFBAPS nao cria, altera ou cancela reservas
no SUAP. Ele funciona como uma camada complementar, consumindo as informacoes
necessarias para a entrega fisica das chaves.

O escopo atual inclui:

- projecao das salas agendaveis e ativas do Campus Porto Seguro;
- sincronizacao de aulas e reservas futuras por scraping read-only;
- consulta operacional da situacao das salas e chaves;
- retirada vinculada a ocupacao programada ou avulsa;
- retirada em lote de varias chaves para a mesma pessoa;
- devolucao e historico das movimentacoes;
- identificacao do servidor por PIN de oito digitos;
- consulta publica autenticada em modo somente leitura;
- perfis `usuario`, `portaria` e `admin`;
- instalacao como PWA em computador ou dispositivo movel.

Nao fazem parte do escopo:

- cadastro manual de salas, chaves, aulas ou reservas pela PWA;
- escrita no SUAP;
- substituicao do fluxo institucional de reservas;
- suporte automatico a outro campus sem nova decisao arquitetural;
- uso do QR Code na operacao atual, pois esse fluxo esta em standby.

## 3. Problema resolvido

Antes da aplicacao, a portaria dependia de verificacoes manuais para saber se a
chave estava disponivel, quem havia retirado o item e se existia uma ocupacao
programada para a sala. A informacao de reservas ficava no SUAP, enquanto a
movimentacao fisica da chave ficava dispersa em controles locais.

O sistema organiza as duas perspectivas sem misturar responsabilidades:

| Antes | Depois |
|---|---|
| consulta manual em telas diferentes | lista operacional na PWA |
| reserva separada da chave fisica | ocupacao do SUAP relacionada a sala e chave |
| retirada sem historico estruturado | movimento com pessoa, operador e horarios |
| dificuldade para saber quem esta com a chave | status publico com nome da pessoa que retirou |
| cadastro duplicado na aplicacao | salas e reservas chegam do SUAP por sincronizacao |

## 4. Usuarios e casos de uso

### Perfis

| Perfil | Responsabilidade |
|---|---|
| Usuario | Consulta a situacao das chaves e administra seu PIN pessoal. |
| Portaria | Confere ocupacao, valida o PIN e registra retirada e devolucao. |
| Admin | Administra perfis, diagnostico e configuracoes permitidas. |

O administrador nao cria salas ou reservas. Esses dados sao derivados do SUAP.

### Casos de uso principais

| Codigo | Caso de uso | Resultado |
|---|---|---|
| UC-01 | Autenticar com Google | Identidade e perfil carregados pela PWA. |
| UC-02 | Consultar chaves do campus | Situacao atual de cada chave em leitura. |
| UC-03 | Consultar a agenda do dia | Sala, horario e responsavel da ocupacao. |
| UC-04 | Identificar servidor por PIN | Pessoa autorizada associada a operacao. |
| UC-05 | Registrar retirada | Movimento aberto com chave, pessoa e operador. |
| UC-06 | Registrar retirada em lote | Varias chaves vinculadas a uma mesma pessoa. |
| UC-07 | Registrar devolucao | Movimento encerrado com horario de retorno. |
| UC-08 | Sincronizar salas e ocupacoes | Copia estruturada atualizada no Firestore. |
| UC-09 | Administrar perfis | Papeis de acesso atualizados pelo admin. |

## 5. Funcionalidades implementadas

- login Google pelo Firebase Authentication;
- allowlist e validacao de perfil por Firestore Security Rules;
- dashboard da portaria com agenda do dia e lista geral de chaves;
- busca e filtros operacionais;
- ordenacao natural por codigo de sala, como A01, A02, B01 e C01;
- modal de detalhe e confirmacao antes de gravar uma operacao;
- PIN de oito digitos gerado pelo backend e persistido por usuario;
- hash para validacao, fingerprint para unicidade e cifragem para recuperacao autorizada;
- QR Code mantido no codigo, mas sem controle operacional exposto nesta fase;
- leitura de reservas, salas e agendas do SUAP por Playwright;
- cache e fingerprints para evitar regravacoes sem alteracao;
- Firestore como fonte consumida pela PWA;
- listeners em tempo real para disponibilidade e movimentos;
- cache persistente IndexedDB para a PWA ja autenticada;
- gravacoes offline pendentes com sincronizacao posterior;
- consulta publica autenticada somente leitura;
- historico de movimentacoes e ocorrencias;
- deploy no Firebase Hosting.

## 6. Requisitos

### Requisitos funcionais

- **RF-01:** autenticar usuarios autorizados com Google.
- **RF-02:** carregar apenas dados do Campus Porto Seguro.
- **RF-03:** mostrar todas as chaves projetadas, mesmo sem reserva futura.
- **RF-04:** relacionar ocupacoes programadas a sala e chave.
- **RF-05:** permitir retirada somente quando a situacao operacional permitir.
- **RF-06:** identificar a pessoa que recebe a chave e o operador da portaria.
- **RF-07:** permitir retirada de varias chaves em uma unica operacao.
- **RF-08:** permitir devolucao e encerrar o movimento correspondente.
- **RF-09:** refletir mudancas nas telas abertas sem refresh manual.
- **RF-10:** manter reservas e salas somente como dados derivados do SUAP.

### Requisitos nao funcionais

- interface responsiva para desktop, tablet e celular;
- linguagem visual minimalista e orientada a poucos cliques;
- regras criticas reforcadas no Firestore, nao apenas no frontend;
- nenhuma credencial administrativa no bundle Angular;
- trilha auditavel de retirada e devolucao;
- suporte a indisponibilidade temporaria da conexao;
- publicacao estatica pelo Firebase Hosting;
- operacao do worker em VM com PM2 e configuracao externa protegida.

## 7. Regras de negocio

### Ocupacoes

O sistema unifica duas fontes programadas e uma operacao local:

1. **Aulas nativas:** programacao regular do campus, tratada como ocupacao.
2. **Reservas SUAP:** atividades deferidas e validas para a sala.
3. **Retirada avulsa:** retirada feita na portaria sem criar reserva no SUAP.

Uma ocupacao confirmada bloqueia a chave somente no intervalo real:

```text
startsAt <= agora < endsAt
```

Nao existe, na regra atual, bloqueio automatico de 30 minutos antes. Antes do
inicio da ocupacao, a retirada avulsa pode ser permitida se a chave estiver
fisicamente disponivel e nao houver conflito operacional. Depois do fim, a
ocupacao deixa de bloquear, mas uma retirada em aberto, atraso, manutencao,
perda ou dano continuam impedindo nova retirada.

### Retirada

- o porteiro confere sala, horario, responsavel e situacao da chave;
- a pessoa que efetivamente recebe a chave e obrigatoria;
- a identificacao da pessoa e obrigatoria;
- o operador autenticado fica registrado separadamente;
- a previsao de retorno e opcional;
- retirada vinculada e retirada avulsa usam o mesmo registro de movimento;
- retirada em lote usa uma pessoa e um operador para varias chaves;
- a confirmacao ocorre em modal antes da persistencia.

### Devolucao

- somente uma chave com retirada aberta pode ser devolvida;
- o operador confirma a devolucao;
- o movimento preserva retirada e devolucao;
- o nome da pessoa que retirou nao e substituido pelo nome do operador;
- a consulta publica mostra a pessoa que esta com a chave, sem expor dados
  desnecessarios.

### Identificacao

O PIN atual possui oito digitos numericos. Ele e gerado pelo backend, deve ser
unico entre os usuarios ativos e permanece associado ao perfil ate que o
usuario solicite a geracao de outro. O valor nao e armazenado em texto puro.

O QR Code permanece implementado como possibilidade futura, mas esta
desabilitado na interface operacional atual.

## 8. Arquitetura da solucao

```text
SUAP web read-only
        |
        v
Backend Node.js/TypeScript + Playwright na VM, via PM2
        |
        v
Firestore/Firebase Authentication
        |
        v
Angular PWA no Firebase Hosting
```

### Responsabilidades

**SUAP**

- sistema oficial de reservas;
- fonte de salas, aulas e reservas do campus;
- nenhum dado e escrito pelo Chaveiro IFBAPS.

**Backend/worker**

- autentica na interface web do SUAP com credencial institucional autorizada;
- percorre listagens e paginas de agenda em modo read-only;
- normaliza datas, horarios, salas, responsaveis e estados;
- deduplica por identificador externo e fingerprint;
- persiste a copia no Firestore;
- registra eventos de sincronizacao e falhas sanitizadas;
- processa geracao, revelacao e validacao do PIN.

**Firestore**

- banco central da PWA;
- armazena projecoes do SUAP e operacoes de chaves;
- fornece listeners para atualizacao em tempo real;
- aplica regras de leitura e escrita por perfil.

**Frontend/PWA**

- autentica usuario;
- consulta Firestore;
- mostra salas, reservas e estados;
- registra somente operacoes permitidas de chave;
- nao acessa SUAP e nao guarda segredos administrativos.

**Firebase Hosting**

- entrega o build Angular;
- publica a PWA em `https://chaveiro-ifbaps.web.app`.

## 9. Integracao read-only com o SUAP

### Fontes utilizadas

| Fonte | Uso |
|---|---|
| `/admin/comum/sala/?agendavel__exact=1&all=&predio__uo=27` | salas agendaveis do PS |
| `/comum/sala/reservasala_relat/` | reservas deferidas e relatorio |
| `/comum/sala/solicitar_reserva/{id}/` | agenda individual da sala |

O worker aplica o filtro institucional do Campus Porto Seguro e descarta datas
anteriores ao inicio da janela configurada. A listagem administrativa e a
agenda individual tambem permitem detectar mudancas de `active`, `schedulable`
e `scheduleUrl`.

### Cadencia

As fontes possuem cadencias diferentes:

- reservas e ocupacoes: rotina continua configuravel; a configuracao atual do
  worker usa ciclo de cinco minutos;
- salas: carga inicial e reconciliacao eventual, sem necessidade de leitura
  curta;
- agendas individuais: rotina controlada, limitada a salas ativas/agendaveis,
  janela futura e limite de salas; a configuracao operacional atual trabalha
  com 34 salas do PS e janela futura de sete dias;
- dry-run: execucao manual sem gravar Firestore para validar layout e cobertura.

Falha no SUAP nao deve apagar a ultima copia valida nem liberar uma chave de
forma insegura. O evento de erro deve ser registrado sem senha, cookie, token ou
`client_secret`.

## 10. Modelo de dados Firestore

| Colecao | Responsabilidade |
|---|---|
| `rooms` | salas projetadas do SUAP |
| `keys` | chaves fisicas/provisorias relacionadas a salas |
| `key_room_links` | vinculo entre chave e sala |
| `occupancies` | aulas e reservas normalizadas |
| `reservations` | copia compatibilidade das reservas deferidas |
| `key_movements` | retiradas e devolucoes |
| `key_locks` | bloqueios operacionais ativos |
| `key_public_status` | projecao publica da situacao de cada chave |
| `people` | identidade institucional e PIN do servidor |
| `registered_emails` | vinculos de e-mail permitidos |
| `pin_fingerprints` | controle de unicidade dos PINs |
| `pin_offline_verifiers` | verificadores locais sem PIN em texto puro |
| `users` | perfil Firebase e papeis da aplicacao |
| `reservation_sync_events` | eventos e resultados de sincronizacao |
| `sync_status` | ultimo estado conhecido de cada rotina |
| `reservation_sync_cache` | cache tecnico da coleta externa |
| `pin_requests` | fila interna de geracao/revelacao/verificacao |

Exemplo resumido de `rooms/{suapRoomId}`:

```json
{
  "externalId": "1281",
  "name": "A06 - SALA DE AULA - Bloco A",
  "campus": "PS",
  "active": true,
  "schedulable": true,
  "scheduleUrl": "/comum/sala/solicitar_reserva/1281/",
  "source": "suap-web",
  "lastSeenAt": "2026-08-24T12:00:00Z"
}
```

Exemplo resumido de `occupancies/{externalOccupancyId}`:

```json
{
  "roomExternalId": "1281",
  "roomCode": "A06",
  "campus": "PS",
  "startsAt": "2026-08-24T14:00:00-03:00",
  "endsAt": "2026-08-24T17:00:00-03:00",
  "responsibleName": "Responsavel da ocupacao",
  "sourceKind": "reserva_deferida",
  "status": "active",
  "blocksKey": true,
  "fingerprint": "sha256:..."
}
```

## 11. Autenticacao e autorizacao

O usuario entra por Google na tela unica de login. Depois da autenticacao, o
perfil e resolvido por e-mail, allowlist e documento de usuario. A PWA direciona
cada perfil para a experiencia correspondente:

```text
Google Authentication
          |
          v
Firebase user + Firestore role
     |             |             |
  usuario       portaria       admin
 consulta      operacao       gestao e diagnostico
```

As rotas e componentes aplicam restricoes no frontend para orientar a
experiencia. As Firestore Security Rules sao a barreira efetiva de escrita e
leitura; o backend Admin SDK nao e exposto ao navegador.

## 12. Fluxo de retirada e devolucao

1. O porteiro abre a lista operacional.
2. Seleciona a sala/chave e confere horario, ocupacao e estado.
3. A PWA abre o modal operacional.
4. O porteiro informa ou valida o servidor por PIN.
5. O sistema mostra a identidade confirmada.
6. O porteiro confirma a retirada.
7. O Firestore registra movimento e lock.
8. Listeners atualizam portaria e consulta publica.
9. Na devolucao, o porteiro abre a chave retirada.
10. Confirma a devolucao e o sistema encerra o movimento.

No modo offline controlado, a retirada e registrada localmente e sinalizada
como pendente. A PWA nao deve afirmar confirmacao do servidor antes da
sincronizacao.

## 13. PWA, offline e consumo do Firestore

A PWA usa cache persistente do Firestore no navegador ja autenticado. Isso
permite consultar dados ja utilizados e enfileirar escritas quando a conexao
estiver indisponivel.

Limites importantes:

- novo login Google exige internet;
- o PIN offline usa somente verificador sincronizado;
- operacoes offline usam `writeBatch`, nao transacao;
- conflitos podem rejeitar uma escrita pendente quando a conexao retornar;
- o terminal da portaria deve revisar pendencias apos a reconexao.

O consumo do Firestore foi reduzido evitando leituras iniciais duplicadas,
reloads completos depois de cada movimento, listeners repetidos e regravacao de
documentos sem alteracao. O worker usa fingerprints e mapas em memoria para
persistir apenas mudancas relevantes.

## 14. Pilha, instalacao e publicacao

### Geracao desta documentacao

O PDF visual e gerado a partir deste Markdown, do prefixo visual e da folha de
estilo versionados no repositorio:

```bash
scripts/gerar-documentacao-pdf.sh
```

O comando requer `pandoc`, Chromium e um servidor HTTP local na porta `8765`
para que o navegador possa carregar os recursos locais durante a impressao.

### Desenvolvimento

```bash
git clone git@github-keychain-ifbaps:jacsonlinux/chaveiro-ifbaps.git
cd chaveiro-ifbaps
cd frontend && npm ci && npm run build && npm test
cd ../backend && npm ci && npm run check && npm run build
```

### Runtime

```text
/opt/chaveiro-ifbaps/backend
  chaveiro-ifbaps-backend
  chaveiro-ifbaps-sync-worker

/etc/chaveiro-ifbaps/
  .env
  chaveiro-ifbaps-firebase-adminsdk-*.json
```

O PM2 usa configuracao externa e nao deve receber segredos impressos em logs.

### Publicacao

```bash
cd frontend
npm run build
firebase deploy --only hosting --project chaveiro-ifbaps
```

O deploy atual esta publicado em `https://chaveiro-ifbaps.web.app`.

## 15. Manual resumido

### Portaria

1. Entrar com Google.
2. Abrir a agenda do dia ou a lista geral de chaves.
3. Conferir sala, horario, responsavel e situacao.
4. Clicar no item e identificar o servidor com o PIN de oito digitos.
5. Confirmar a entrega da chave.
6. Clicar novamente quando a chave retornar.
7. Confirmar a devolucao.

Para varias chaves, selecionar os itens disponiveis, informar uma unica pessoa
e confirmar a retirada em lote.

### Servidor

1. Entrar com a conta Google autorizada.
2. Consultar a situacao das chaves.
3. Acessar a area pessoal de identificacao.
4. Gerar o PIN quando ainda nao existir.
5. Apresentar o PIN ao porteiro.

O QR Code nao faz parte do fluxo operacional atual.

### Administrador

1. Entrar com a conta administrativa.
2. Consultar usuarios e papeis.
3. Conferir diagnostico e ultima sincronizacao.
4. Ajustar perfis quando autorizado.

Salas, chaves e reservas permanecem somente leitura e derivadas do SUAP.

## 16. Validacao e manutencao

Validacoes automatizadas atuais:

- build de producao Angular aprovado;
- testes unitarios frontend aprovados;
- `npm run check` e build do backend;
- regras e indices Firestore publicados;
- health check do backend;
- deploy Hosting com resposta HTTP 200.

Antes de uma nova publicacao, revisar login, perfil, sincronizacao, lista de
salas, PIN, retirada individual, retirada em lote, devolucao, modo offline,
atualizacao em tempo real e regras do Firestore.

Alteracoes de arquitetura, colecoes, perfis, regras ou scraping devem atualizar
tambem `docs/diagramas.md`, `docs/fluxos-e-modelo.md` e este documento.

## 17. Evolucao futura

Possibilidades que nao devem ser tratadas como implantadas:

- reativacao controlada do QR Code;
- substituicao do provider web por API oficial, se autorizada;
- relatorios administrativos ampliados;
- auditoria e notificacoes mais detalhadas;
- suporte a outros campi;
- cadastro institucional de codigos fisicos das chaves;
- melhoria da estrategia offline multi-terminal.

O principio de evolucao e preservar a separacao:

```text
SUAP continua reservando.
Backend continua sincronizando.
Firestore continua mediando os dados.
PWA continua operando a chave.
```

## 18. Referencias do projeto

- [Arquitetura](arquitetura.md)
- [Fluxos e modelo](fluxos-e-modelo.md)
- [Diagramas oficiais](diagramas.md)
- [Politicas de negocio](politicas-de-negocio.md)
- [Validacao manual](validacao-manual.md)
- [Plano de implementacao](plano-implementacao.md)
- [Migracao para o novo Firebase](migracao-chaveiro-ifbaps.md)
- [AGENTS.md](../AGENTS.md)

Documento consolidado com base no codigo-fonte, regras Firestore,
documentacao do repositorio, configuracao operacional e validacoes realizadas
em 24/08/2026.
