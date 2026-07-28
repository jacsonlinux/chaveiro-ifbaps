# Cadastro do Catalogo Fisico

Este cadastro representa o inventario real da portaria. O SUAP fornece apenas
os nomes das salas encontrados nas reservas; ele nao define quais chaves fisicas
existem nem substitui a conferencia local.

## Ordem recomendada

1. Entrar na PWA com a conta autorizada.
2. Abrir `Administracao`.
3. Confirmar ou cadastrar cada sala que existe fisicamente.
4. Cadastrar cada chave com o codigo usado na portaria.
5. Vincular cada chave a uma ou mais salas somente depois da conferencia local.
6. Abrir `Operacao` e confirmar se as chaves aparecem com o status correto.

## Salas sugeridas pelo SUAP

A PWA pode mostrar salas presentes nas reservas sincronizadas e ausentes no
catalogo. `Preencher cadastro` apenas copia o nome para o formulario; o
administrador deve confirmar o ambiente antes de clicar em `Cadastrar sala`.

Nao cadastrar uma sala apenas porque ela apareceu uma vez em uma reserva se o
ambiente nao existir ou nao estiver sob responsabilidade da portaria.

## Chaves

- `ID`: identificador interno estavel; pode ser deixado vazio para gerar um ID.
- `Codigo`: identificacao visivel da chave no quadro ou chaveiro.
- `Descricao`: informacao curta para diferenciar copias ou conjuntos.
- `Estado inicial`: normalmente `disponivel`; usar outro estado se a chave
  estiver em manutencao, perdida ou danificada.

## Vinculos

O vinculo conecta a chave fisica a uma sala. Nao criar vinculo por semelhanca de
nome: confirmar a etiqueta da chave, a sala e eventuais copias. Um mesmo codigo
de chave nao deve ser reutilizado para chaves fisicas diferentes.

## Validacao operacional

Depois do cadastro, validar com uma retirada e devolucao controladas. Confirmar:

- a sala aparece no item da chave;
- uma reserva futura dentro de 30 minutos aparece como
  `bloqueada_por_reserva`;
- o responsavel, data e horario da reserva aparecem para a portaria;
- a retirada registra responsavel, operador e horario;
- a devolucao encerra a retirada e libera o estado operacional.

O sistema nao altera reservas no SUAP e nao cria uma trava fisica. A conferencia
do responsavel e a entrega da chave continuam sendo responsabilidade da
portaria.
