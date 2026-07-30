# Validacao manual

Este roteiro valida o comportamento publicado da PWA sem expor credenciais ou
acessar o SUAP pelo navegador da portaria. O SUAP continua sendo acessado
somente pelo worker read-only.

URL da PWA:

`https://keychain-ifbaps.web.app`

## Perfil portaria

Usar `jacsonlinux@gmail.com` ou `willian.barboza@ifba.edu.br`.

1. Entrar com Google.
2. Confirmar que a tela inicial mostra a operacao das salas/chaves derivadas da
   sincronizacao.
3. Confirmar que nao existe menu ou formulario para cadastrar sala, chave ou
   reserva.
4. Localizar uma sala, conferir status, reserva, responsavel e horario.
5. Clicar em `Detalhes` e verificar a reserva e o estado da chave.
6. Registrar uma saida informando a pessoa que retirou e o operador da portaria.
7. Confirmar no historico a retirada, horario, sala, chave e operador.
8. Registrar a entrada e confirmar o horario da devolucao.

Durante o intervalo real de uma aula nativa ou reserva confirmada, a PWA deve
exibir a chave como `bloqueada_por_reserva` e mostrar o responsavel do SUAP
quando essa informacao estiver disponivel para o perfil. A entrega fisica
continua dependendo da conferencia do porteiro.

Antes do horario de inicio, nao existe bloqueio antecipado por minutos. Apos o
horario final, o bloqueio programado deixa de existir; a chave so permanece
indisponivel se houver retirada aberta, atraso, manutencao, perda ou dano.

## Perfil administrador

Usar `jacsoncorrea@ifba.edu.br`.

1. Entrar com Google.
2. Confirmar que o perfil exibido e `admin`.
3. Confirmar acesso a usuarios e diagnostico da sincronizacao.
4. Confirmar que nao existem formularios de cadastro de salas, chaves,
   vinculos ou reservas.
5. Confirmar que a ultima sincronizacao apresenta sucesso e quantidade de
   reservas processadas.

O primeiro login cria o perfil Firestore do administrador com o papel `admin`.

## Evidencias esperadas

- Login permitido somente para os e-mails autorizados.
- Perfil de portaria sem acesso administrativo.
- Perfil admin sem cadastro de catalogo.
- Reservas e salas originadas do snapshot sincronizado pelo worker.
- Retirada e devolucao gravadas no Firestore com identificacao da pessoa,
  operador e horarios.
- Nenhuma escrita realizada no SUAP.

Se uma etapa falhar, registrar data, perfil, tela, mensagem apresentada e
horario da tentativa. Nao registrar senha, token, `client_secret` ou cookies.

## Sequencia minima de aceite

Executar esta sequencia com uma conta de `portaria` autorizada, usando dados
reais exibidos pela PWA:

1. Abrir `Reservas` e escolher uma ocupacao do dia que esteja disponivel para
   entrega. Conferir sala, codigo, horario e responsavel.
2. Registrar uma retirada vinculada, preenchendo nome e identificacao da pessoa
   que recebeu a chave. Confirmar no modal e verificar a mensagem de sucesso,
   o movimento no card e a mudanca imediata de status.
3. Abrir a consulta em outra janela autenticada e confirmar que a retirada
   aparece sem recarregar a pagina.
4. Registrar a devolucao da mesma chave e confirmar que o card e a outra janela
   refletem a devolucao.
5. Abrir `Retirada avulsa`, selecionar duas chaves disponiveis e verificar que
   os botoes individuais `Retirada` ficam desabilitados enquanto houver selecao.
   Informar uma unica pessoa e identificacao, usar o botao superior `Retirar
   chaves`, confirmar o lote e verificar dois movimentos com o mesmo
   responsavel e operador.
6. Devolver as duas chaves do lote e confirmar que nenhuma retirada de teste
   permanece aberta.
7. Remover todas as selecoes e verificar que os botoes individuais `Retirada`
   voltam a ficar habilitados.
8. Repetir a leitura principal em uma viewport desktop e em uma viewport mobile,
   verificando que cards, modais, botoes e snackbar nao ultrapassam a tela.

Se uma etapa de retirada falhar, nao repetir indefinidamente nem criar varios
movimentos. Registrar a mensagem apresentada, conferir se algum movimento foi
gravado e devolver/corrigir qualquer movimento aberto antes de prosseguir.
