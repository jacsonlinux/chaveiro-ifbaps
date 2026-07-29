# Diagramas oficiais

Data: 29/07/2026  
Escopo: IFBA Campus Porto Seguro (`PS`, `campus=27`).

Este documento e a referencia oficial de diagramas e fluxogramas do projeto.
Sempre que uma regra, integracao, colecao ou fluxo mudar, este arquivo deve ser
revisado junto com `docs/arquitetura.md`, `docs/fluxos-e-modelo.md` e
`docs/plano-implementacao.md`.

## Politica de manutencao

- Diagramas devem representar o funcionamento alvo aprovado e, quando houver
  divergencia, indicar claramente o que e vigente e o que esta pendente.
- Nao incluir credenciais, cookies, HTML bruto do SUAP ou dados pessoais reais.
- O escopo atual e somente Porto Seguro. Outros campi exigem decisao
  arquitetural antes de entrar nos diagramas.
- A PWA nunca acessa o SUAP diretamente; ela consulta e grava somente no
  Firestore via Firebase Web SDK e Security Rules.

## Regra vigente: sem janela de bloqueio antecipado

Regra vigente no codigo, no plano aprovado e confirmada em 29/07/2026:

```text
bloqueia = ocupacao confirmada && startsAt <= agora < endsAt
```

Nao existe bloqueio automatico antes do horario inicial por quantidade fixa de
minutos. Antes de `startsAt`, a retirada avulsa pode ser registrada quando a
chave estiver fisicamente disponivel, nao houver movimento aberto e a previsao
de uso nao conflitar com ocupacao futura conhecida.

## Arquitetura geral

```mermaid
flowchart LR
    U1[Servidor, aluno ou usuario autorizado] -->|solicita reserva| SUAP[SUAP oficial]
    SUAP -->|paginas web read-only| W[Worker Node.js/Playwright na VM]
    W --> N[Normalizacao, deduplicacao e cache]
    N --> F[(Firestore)]
    F --> PWA[PWA Angular no Firebase Hosting]
    Porteiro[Porteiro] -->|retirada, devolucao, ocorrencia| PWA
    Admin[Administrador] -->|usuarios e diagnostico| PWA
    Publico[Usuario autenticado] -->|consulta somente leitura| PWA
    PWA -->|Firebase Web SDK| F
    W -->|Firebase Admin SDK| F
    PWA -. nao acessa .-> SUAP
```

## Sincronizacao de reservas SUAP

```mermaid
sequenceDiagram
    participant S as SUAP
    participant W as Worker
    participant C as Cache
    participant F as Firestore
    participant A as Admin/PWA

    W->>S: Login institucional read-only
    W->>S: Consulta relatorio de reservas futuras PS
    S-->>W: Tabelas paginadas com reservas
    W->>W: Extrai Visualizar, requestExternalId e periodo
    W->>W: Normaliza para reservations e occupancies
    W->>W: Compara externalId e fingerprint
    W->>F: Upsert reservations e occupancies
    W->>F: Atualiza reservation_sync_events
    W->>F: Atualiza sync_status/current
    W->>C: Atualiza cache curto
    A->>F: Consulta status sincronizado
```

## Sincronizacao de salas e chaves

```mermaid
flowchart TD
    A[Worker] --> B[Abre listagem administrativa de salas PS]
    B --> C[Percorre paginacao]
    C --> D[Extrai ID SUAP, roomCode, nome, campus, predio]
    D --> E[Extrai active, schedulable e scheduleUrl]
    E --> F[Upsert rooms]
    F --> G[Projeta keys por sala]
    G --> H[Projeta key_room_links]
    H --> I{Sala sumiu do SUAP?}
    I -->|Sim, apos confirmacao| J[Marca sala/chave/link como inativos]
    I -->|Nao| K[Mantem ativo e preserva historico]
```

## Disponibilidade operacional

```mermaid
flowchart TD
    A[GET /api/keys/availability] --> B[Le rooms, keys e key_room_links]
    A --> C[Le occupancies como fonte principal]
    C --> D{occupancies vazia ou store sem suporte?}
    D -->|Sim| E[Fallback temporario: reservations -> occupancies]
    D -->|Nao| F[Usa ocupacoes normalizadas]
    E --> F
    B --> G[Relaciona sala, chave e ocupacao]
    F --> G
    G --> H{startsAt <= agora < endsAt?}
    H -->|Sim| I[Chave bloqueada por ocupacao ativa]
    H -->|Nao| J[Chave sem bloqueio programado]
    I --> K[Combina com retirada aberta e estado fisico]
    J --> K
    K --> L[Resposta sanitizada para PWA/operacao transitoria]
```

## Leitura operacional da PWA

```mermaid
sequenceDiagram
    participant P as PWA portaria
    participant F as Firestore
    participant T as Relogio do navegador
    participant W as Worker SUAP

    P->>F: Escuta rooms, keys, key_room_links, occupancies e movimentos
    W->>F: Atualiza ocupacoes normalizadas
    F-->>P: Entrega novos snapshots
    T->>P: Recalcula disponibilidade a cada 30 segundos
    P->>P: Aplica startsAt <= agora < endsAt
    P->>P: Exibe agenda do dia e status da chave
    P->>F: Grava retirada/devolucao somente se as regras permitirem
```

O intervalo de 30 segundos e apenas uma atualizacao do relogio da interface;
nao e uma janela de bloqueio antecipado. A chave fica bloqueada por ocupacao
somente durante o intervalo real. Uma retirada avulsa pode informar previsao de
retorno; se essa previsao ultrapassar o inicio da proxima ocupacao conhecida, a
PWA recusa a operacao.

## Atualizacao periodica

```mermaid
flowchart TD
    A[Scheduler PM2] --> B{Tipo de dado}
    B -->|Reservas/ocupacoes| C[A cada 15 minutos, configuravel]
    B -->|Salas/chaves| D[Inicial, manual ou intervalo maior]
    B -->|Aulas nativas| E[Cadencia a definir apos fonte confirmada]
    C --> F{Falha no SUAP?}
    F -->|Nao| G[Upsert e evento de sucesso]
    F -->|Sim| H[Backoff, erro sanitizado e preserva ultima copia]
    H --> I[Nao libera chave por falha de sync]
```

## Aulas nativas por agenda de sala

```mermaid
flowchart TD
    A[Worker seleciona salas PS com scheduleUrl] --> B{Cadencia permitida?}
    B -->|Nao| C[Aguarda janela manual/baixa frequencia]
    B -->|Sim, flag habilitada| D[Abre agenda da sala read-only]
    D --> E[Extrai mes, dia, horario e descricao]
    E --> F[Descarta datas passadas]
    F --> G[Classifica aula_regular, evento ou outro]
    G --> H[Normaliza como occupancies]
    H --> I[Deduplica por sala, data, horario e conteudo]
    I --> J[Upsert Firestore occupancies]
    J --> K[Disponibilidade bloqueia somente no intervalo real]
```

### Diagnostico controlado da agenda

```mermaid
flowchart TD
    A[Comando dry-run manual] --> B[Login SUAP read-only]
    B --> C[Lista salas filtradas do Campus PS]
    C --> D[Seleciona limite configurado]
    D --> E[Abre agendas individuais read-only]
    E --> F[Normaliza datas, horarios e classificacao]
    F --> G[Exibe resumo sanitizado]
    G --> H[Nao grava Firestore]
    G --> I[Nao altera SUAP]
```

O dry-run existe para validar custo, cobertura e classificacao antes da
ativacao do scheduler. O worker continuo permanece com a flag desligada ate a
revisao desse resultado.

## Retirada e devolucao na portaria

```mermaid
flowchart TD
    A[Porteiro autentica na PWA] --> B[Lista operacional do dia]
    B --> C{Chave disponivel?}
    C -->|Nao, retirada| D[Acao: devolucao]
    C -->|Nao, manutencao/perda/dano| E[Sem retirada]
    C -->|Bloqueada por ocupacao ativa| F[Conferir responsavel SUAP]
    C -->|Sim| G[Acao: retirada]
    F --> G
    G --> H[Modal com pessoa que retira e identificacao]
    H --> I[Confirmacao]
    I --> J[Transacao Firestore cria key_locks e key_movements]
    D --> K[Confirmacao de devolucao]
    K --> L[Transacao fecha movimento e remove key_locks]
    J --> M[Listeners Firestore atualizam PWA e consulta publica]
    L --> M
```

## Reserva SUAP e bloqueio da chave

```mermaid
flowchart TD
    A[Usuario reserva sala no SUAP] --> B[SUAP analisa fluxo proprio]
    B --> C{Reserva deferida/valida?}
    C -->|Nao| D[Nao bloqueia chave]
    C -->|Sim| E[Worker sincroniza ocupacao]
    E --> F[Firestore occupancies]
    F --> G{Agora esta dentro do intervalo?}
    G -->|Sim| H["Bloqueia em startsAt <= agora < endsAt"]
    G -->|Nao| I[Nao bloqueia por antecedencia]
    H --> J[PWA sinaliza portaria]
    I --> K[Retirada avulsa pode seguir se nao houver conflito]
```

## Retirada avulsa sem reserva ativa

```mermaid
flowchart TD
    A[Porteiro abre Chaves Avulsas] --> B[Seleciona uma ou mais chaves]
    B --> C[Informa pessoa, identificacao e previsao opcional]
    C --> D{Existe movimento aberto?}
    D -->|Sim| E[Recusa chave]
    D -->|Nao| F{Sala inativa ou nao agendavel?}
    F -->|Sim| E
    F -->|Nao| G{Conflita com ocupacao conhecida?}
    G -->|Sim| E
    G -->|Nao| H[Registra um movimento por chave]
    H --> I[Atualiza key_locks e key_movements]
```

## Autenticacao e perfis

```mermaid
flowchart TD
    A[Usuario acessa PWA] --> B[Firebase Authentication Google]
    B --> C{Email verificado e permitido?}
    C -->|Nao| D[Acesso negado]
    C -->|Sim| E[Carrega users/{uid}]
    E --> F{Perfil}
    F -->|portaria| G[Operacao de chaves]
    F -->|admin| H[Administracao e diagnostico]
    F -->|usuario| I[Consulta publica somente leitura]
    G --> J[Security Rules validam escrita operacional]
    H --> J
    I --> K[Security Rules permitem leitura limitada]
```

## Modelo conceitual Firestore

```mermaid
erDiagram
    rooms ||--o{ key_room_links : vincula
    keys ||--o{ key_room_links : vincula
    keys ||--o{ key_movements : movimenta
    rooms ||--o{ key_movements : movimenta
    rooms ||--o{ occupancies : ocupa
    reservations ||--o{ occupancies : projeta
    keys ||--o| key_locks : bloqueia_transacao
    keys ||--o{ key_occurrences : registra
    rooms ||--o{ key_occurrences : registra
    users ||--o{ key_movements : registra
    reservation_sync_events }o--|| sync_status : resume

    rooms {
      string id
      string roomCode
      string campus
      boolean active
      boolean schedulable
      string scheduleUrl
    }

    occupancies {
      string externalId
      string sourceKind
      string roomExternalId
      string startsAt
      string endsAt
      boolean blocksKey
    }

    key_movements {
      string id
      string keyId
      string roomId
      string status
      string checkedOutAt
      string returnedAt
    }
```

## Estados da chave

```mermaid
stateDiagram-v2
    [*] --> disponivel
    disponivel --> bloqueada_por_reserva: ocupacao ativa
    bloqueada_por_reserva --> disponivel: fim da ocupacao
    disponivel --> retirada: retirada registrada
    bloqueada_por_reserva --> retirada: entrega ao responsavel confirmada
    retirada --> devolvida: devolucao registrada
    devolvida --> disponivel: lock removido
    retirada --> atrasada: previsao vencida
    atrasada --> devolvida: devolucao registrada
    disponivel --> em_manutencao: ocorrencia/admin
    disponivel --> perdida: ocorrencia/admin
    disponivel --> danificada: ocorrencia/admin
    em_manutencao --> disponivel: ajuste admin
    perdida --> disponivel: ajuste admin
    danificada --> disponivel: ajuste admin
```

`devolvida` e estado historico de movimentacao. No estado operacional atual da
chave, a devolucao remove o lock e retorna a chave para `disponivel`, salvo se
houver manutencao, perda, dano ou ocupacao ativa no mesmo instante.

## Notificacoes e regras de negocio

```mermaid
flowchart TD
    A[Evento operacional] --> B{Tipo}
    B -->|Retirada OK| C[Snackbar: retirada registrada]
    B -->|Devolucao OK| D[Snackbar: devolucao registrada]
    B -->|Erro de validacao| E[Erro no campo do modal]
    B -->|Chave indisponivel| F[Alerta no card/modal]
    B -->|Falha sync SUAP| G[Evento sanitizado e diagnostico admin]
    C --> H[Fecha automatico em poucos segundos]
    D --> H
    E --> I[Mantem modal aberto e desbloqueia acao]
    F --> I
    G --> J[Nao expor credenciais, cookies ou HTML bruto]
```

Regras principais:

- Toda retirada/devolucao precisa ser auditavel.
- Retirada avulsa pode envolver varias chaves, mas gera um movimento por chave.
- Falha de scraping nao apaga a ultima copia confiavel.
- Ausencia temporaria em uma sincronizacao nao significa cancelamento imediato.
- Dados pessoais devem ser exibidos conforme perfil e necessidade operacional.
