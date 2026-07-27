# Projeto inicial: Controle de Chaves com SUAP

Este repositorio comeca apenas como um documento simples para leitura e revisao. Ainda nao existe implementacao, Angular, backend, banco de dados ou integracao real com o SUAP.

## Ideia do sistema

Criar uma aplicacao web/PWA para a portaria controlar retirada e devolucao de chaves.

Fluxo desejado:

- quando uma pessoa reservar uma sala no SUAP, essa reserva deve aparecer para a portaria como uma demanda de chave;
- a pessoa que ja reservou a sala no SUAP nao deve precisar reservar a chave separadamente;
- a portaria tambem deve conseguir registrar retirada direta de chave, quando alguem pega a chave sem reserva previa no SUAP;
- o sistema deve registrar retirada, devolucao, responsavel, horario, sala/chave e observacoes.

## Duvida principal sobre acesso ao SUAP

Hoje voce consegue acessar o SUAP pelo navegador usando SIAPE e senha. Isso confirma que voce tem acesso como usuario humano ao sistema web.

Para uma aplicacao propria, o caminho correto nao deve ser pedir nem armazenar sua senha do SUAP. O ideal e usar uma integracao autorizada pela API do SUAP, normalmente com OAuth2 ou token de aplicacao, conforme permissao da instituicao.

Em termos praticos:

- login web com SIAPE/senha serve para voce usar o SUAP normalmente;
- a PWA nao deve capturar sua senha;
- a integracao deve ser feita com uma aplicacao autorizada no SUAP;
- precisamos confirmar quais endpoints do SUAP IFBA existem para reservas, salas, pessoas e chaves;
- se nao houver endpoint oficial de chaves, o sistema pode controlar as chaves localmente e apenas consultar reservas/salas no SUAP.

## Arquitetura pensada inicialmente

```text
Angular PWA
  -> Backend proprio
  -> Banco de dados local
  -> API do SUAP, se autorizada e disponivel
```

Motivo: o frontend Angular nao deve guardar segredo de API, senha ou `client_secret`. O backend fica responsavel por conversar com o SUAP, aplicar regras e registrar auditoria.

## Primeiro escopo simples

Antes de implementar, validar este escopo:

1. Cadastro local de chaves.
2. Cadastro local de salas/ambientes.
3. Vinculo entre sala e chave.
4. Tela da portaria para ver chaves disponiveis, retiradas e pendentes.
5. Registro de retirada direta na portaria.
6. Registro de devolucao.
7. Historico basico.
8. Consulta futura das reservas no SUAP, se a API permitir.

## Perguntas que precisam ser respondidas

1. O SUAP IFBA permite cadastrar uma aplicacao OAuth/API para este caso?
2. Existe endpoint oficial para consultar reservas de salas?
3. Existe endpoint oficial para consultar salas/ambientes?
4. Existe endpoint oficial para modulo de chaves?
5. A DTI permite uma aplicacao externa consultar esses dados?
6. Quem serao os usuarios do sistema: apenas portaria, coordenacao, DTI, professores/servidores?
7. O sistema deve funcionar apenas na rede interna ou tambem fora do campus?

## Encaminhamento sugerido

1. Voce revisa este documento.
2. Ajustamos a ideia e o escopo.
3. Confirmamos com DTI/SUAP quais acessos de API sao permitidos.
4. Depois disso, iniciamos a implementacao minima.

Enquanto essas respostas nao forem confirmadas, o projeto deve continuar apenas em planejamento.
