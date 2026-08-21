# Politicas de Negocio

Politicas de negocio do Chaveiro Digital do IFBA Campus Porto
Seguro. Este documento descreve as regras do mundo real que a operacao da
portaria deve seguir e que o sistema implementa. Escopo atual: somente Campus
Porto Seguro (`PS`, `campus=27`).

## Fronteiras do sistema

- O SUAP e o sistema oficial de reservas; este sistema gerencia somente a
  movimentacao fisica da chave.
- O sistema nao cria, altera, cancela nem aprova reservas no SUAP.
- A PWA nao cadastra salas, chaves, aulas ou reservas; elas sao projecao do
  SUAP gerada pelo worker.
- O backend le o SUAP somente leitura, com conta institucional autorizada;
  nenhuma escrita e feita no SUAP.
- Usuario autenticado com perfil `usuario` consulta somente leitura; escritas
  operacionais sao restritas a portaria/admin.

## Retirada e devolucao

- Entrega da chave sempre ao responsavel confirmado no SUAP; a conferencia
  fisica do responsavel e do porteiro.
- Chave bloqueada por reserva pode ser retirada somente apos confirmacao
  explicita do porteiro, vinculada a reserva exibida.
- Retirada avulsa (sem reserva) so e permitida quando: chave disponivel e sem
  retirada aberta.
- Retirada em lote: uma movimentacao auditavel por chave, mesma pessoa
  responsavel e operador, gravada em uma unica transacao (tudo ou nada).
- Chave so volta a `disponivel` mediante devolucao registrada; ocorrencia ou
  ajuste nao libera chave com retirada aberta.
- Devolucao vinculada a reserva: a reserva fica como historico operacional
  (acao desabilitada) e a chave volta a disponivel se nao existir outra
  ocupacao ativa no horario.

## Bloqueio e estados da chave

- Bloqueio por aula ou reserva e cronologico: apenas durante
  `startsAt <= agora < endsAt`; nao ha bloqueio antecipado.
- `bloqueada_por_reserva` e um estado calculado a partir das ocupacoes
  conhecidas; nao pode ser gravado manualmente.
- Estados manuais possiveis: `disponivel`, `em_manutencao`, `perdida`,
  `danificada`.
- Ocorrencia ou ajuste administrativo registra o estado anterior, a origem e o
  operador, preservando auditoria.
- Sala que deixa de ser ativa ou agendavel no SUAP sinaliza restricao, impede
  nova retirada avulsa por padrao e preserva historico e movimentos existentes.
- Reserva que desaparece da sincronizacao nao e cancelada de imediato:
  `suspect_absent` primeiro e `absent` somente apos confirmacoes consecutivas
  configuradas.
- Reserva `canceled` ou `absent` nao bloqueia; `suspect_absent` gera alerta
  operacional sanitizado, mas nao bloqueia.
- Falha de sincronizacao nao libera chave bloqueada automaticamente; o sistema
  usa a ultima copia confiavel e sinaliza dados possivelmente desatualizados
  para portaria/admin.

## Acesso e privacidade

- Login da PWA: Google via Firebase Authentication, com e-mail verificado e
  allowlist; o SUAP nao autentica operadores da PWA.
- Perfis: `usuario` (consulta publica somente leitura), `portaria`
  (consulta e movimenta chaves, registra ocorrencias), `admin` (gerencia
  usuarios e perfis, acompanha sincronizacao).
- `admin` nao cadastra salas, chaves ou reservas; esses documentos sao
  somente leitura e derivados pelo worker.
- Usuario comum ve disponibilidade, status e, quando houver retirada aberta, o
  nome da pessoa que esta com a chave. Matricula, e-mail, operador da portaria,
  observacoes e demais detalhes continuam restritos a `portaria`/`admin`.
- A consulta publica usa `key_public_status`, uma projecao com `keyId`, status,
  nome publico da pessoa que retirou (`holderName`) e horario da retirada
  (`checkedOutAt`). `key_movements` continua restrita a `portaria` e `admin`.
- Todo evento registra: quem executou, responsavel pela chave, chave, ambiente,
  data/hora, origem da acao e observacao, quando aplicavel.

## Sincronizacao com o SUAP

- Janela de busca nunca comeca antes do dia corrente; usa data e hora da zona
  `America/Sao_Paulo`.
- Reservas e ocupacoes sincronizam continuamente das 07:00 as 18:00, a cada 5
  minutos, com intervalo configuravel; fora desse horario o agendador nao
  consulta o SUAP.
- Salas sincronizam em baixa frequencia/manual e aulas nativas conforme fonte
  confirmada.
- Upsert idempotente por identificador estavel ou fingerprint; alteracao
  detectada por mudanca de fingerprint.
- Cancelamento so e marcado com evidencia explicita no SUAP; ausencia nao
  equivale a cancelamento.
- Sincronizacao preserva salas agendaveis sem reserva futura e as opcoes
  administrativas da sala (ativa, agendavel, link de reserva).
