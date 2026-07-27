# Arquitetura Inicial

Documento de orientacao tecnica para o Sistema Web de Controle de Chaves do
IFBA Campus Porto Seguro.

## 1. Contexto

Hoje o controle de chaves da portaria e manual. O objetivo do sistema e
digitalizar a retirada, devolucao, disponibilidade, ocorrencias e historico das
chaves.

O SUAP deve continuar sendo a fonte oficial para reserva de salas e ambientes.
O sistema de chaves deve complementar o SUAP, cuidando da operacao fisica da
chave.

## 2. Caminhos reais do ambiente

O ambiente atual usado pelo projeto e:

```text
/opt/keychain-ifbaps/dev
```

Arquivos sensiveis estao fora do repositorio:

```text
/etc/keychain-ifbaps/.env
/etc/keychain-ifbaps/keychain-ifbaps-firebase-adminsdk-fbsvc-9a18ddb436.json
```

Regras:

- Nao versionar credenciais reais.
- Nao copiar arquivos sensiveis para o repositorio.
- Nao imprimir valores secretos em logs, testes ou respostas.
- Criar apenas exemplos sem valores reais, como `.env.example`, se necessario.

## 3. Separacao de responsabilidades

```text
Frontend/PWA
  -> Backend proprio
  -> Firestore/Firebase
  -> SUAP, se houver autorizacao institucional
```

### Frontend

Responsavel por:

- Interface web responsiva.
- Experiencia PWA.
- Telas de consulta.
- Telas operacionais da portaria.
- Chamadas HTTP para o backend.

O frontend nao deve guardar segredos nem implementar sozinho regras criticas de
permissao, retirada, devolucao ou bloqueio por reserva.

### Backend

Responsavel por:

- Regras de negocio.
- Autorizacao e perfis.
- Auditoria das operacoes.
- Acesso aos dados.
- Integracao com Firebase/Firestore.
- Integracao com SUAP quando autorizada.
- Validacao de conflitos de retirada, devolucao e reserva.

## 4. Stack prevista

Backend:

- Node.js.
- TypeScript.
- API HTTP/REST.
- Firebase Admin SDK.
- Firestore.

Frontend:

- Angular.
- TypeScript.
- Angular Material ou biblioteca equivalente.
- PWA.
- Angular Service Worker quando aplicavel.

Infraestrutura:

- Firebase Firestore.
- Firebase Hosting, se adequado ao deploy.
- Firebase Authentication, se adequado ao modelo de login.
- Firebase Cloud Messaging apenas se notificacoes push forem priorizadas.

## 5. Perfis de acesso

### Usuario autenticado

Pode consultar informacoes internas permitidas, como disponibilidade de chaves e
informacoes de ambientes, respeitando regras de privacidade.

### Portaria

Pode:

- Visualizar chaves.
- Registrar retirada.
- Registrar devolucao.
- Consultar historico operacional.
- Registrar ocorrencias.
- Identificar chaves atrasadas, perdidas ou danificadas.
- Ver reservas relacionadas, quando houver integracao com SUAP.

### Administrador

Pode gerenciar:

- Chaves.
- Ambientes.
- Usuarios.
- Perfis e permissoes.
- Configuracoes.
- Historico.
- Relatorios.
- Integracoes.

A autorizacao deve ser aplicada no backend, nao apenas por ocultacao visual no
frontend.

## 6. Estados da chave

Estados iniciais recomendados:

```text
disponivel
bloqueada_por_reserva
retirada
atrasada
em_manutencao
perdida
danificada
```

Esses estados representam a situacao operacional atual da chave.

## 7. Eventos auditaveis

Toda movimentacao importante deve gerar registro historico.

Eventos iniciais:

```text
retirada
devolucao
ocorrencia
bloqueio
liberacao
ajuste_admin
```

Cada evento deve registrar, no minimo:

- Usuario que executou a acao.
- Pessoa responsavel pela chave, quando aplicavel.
- Chave.
- Ambiente.
- Data e horario.
- Origem da acao.
- Observacao, quando aplicavel.

## 8. Integracao com SUAP

O SUAP deve ser tratado como fonte oficial das reservas de ambientes.

Fluxo esperado:

```text
Usuario reserva ambiente no SUAP
        |
Backend consulta reservas autorizadas
        |
Sistema associa reserva ao ambiente local
        |
Sistema identifica a chave vinculada
        |
Portaria entrega a chave ao responsavel
        |
Sistema registra retirada e devolucao
```

Regras:

- A PWA nao deve capturar senha do SUAP.
- A integracao deve usar API/OAuth/token autorizado pela instituicao.
- Scraping ou automacao da interface web do SUAP nao devem ser primeira opcao.
- Qualquer alternativa nao oficial precisa de autorizacao institucional.

## 9. Regra de reserva e bloqueio

Regra inicial sugerida:

- Uma reserva do SUAP pode bloquear a chave vinculada ao ambiente 30 minutos
  antes do horario de inicio.
- O bloqueio impede retirada por terceiros.
- A chave deve ficar disponivel para o responsavel da reserva no horario
  previsto.

Casos que precisam de regra explicita:

- Chave ja retirada antes do inicio do bloqueio.
- Retirada direta com reserva futura proxima.
- Reserva cancelada no SUAP.
- Reserva alterada no SUAP.
- Reservas sobrepostas.
- Chaves mestras.
- Uma chave para varios ambientes.
- Varias chaves para um mesmo ambiente.

Recomendacao: retirada sem reserva so deve ser permitida quando nao comprometer
uma reserva futura conhecida.

## 10. Privacidade

Nem todo usuario deve ver todos os dados pessoais.

Para portaria e administrador, faz sentido visualizar o responsavel atual pela
chave. Para usuario comum, a interface pode mostrar apenas disponibilidade,
previsao de devolucao ou status de indisponibilidade, conforme politica interna.

Essa regra deve ser validada com a gestao do campus e, se necessario, com a DTI.

## 11. Autenticacao institucional

Opcoes a avaliar:

- Login pelo SUAP via OAuth, se autorizado.
- Login via provedor institucional, se disponivel.
- Firebase Authentication com controle de dominio institucional.
- Cadastro controlado por administrador para perfis sensiveis.

Perfis de portaria e administrador devem ter concessao controlada. Nao devem
ser definidos apenas por informacao editavel no frontend.

## 12. Ordem recomendada de desenvolvimento

1. MVP local sem SUAP.
2. Autenticacao e perfis.
3. Cadastro de ambientes.
4. Cadastro de chaves.
5. Vinculo ambiente-chave.
6. Retirada e devolucao.
7. Historico e auditoria.
8. Ocorrencias.
9. Interface da portaria.
10. Interface de consulta.
11. Adaptador preparado para SUAP.
12. Integracao SUAP apos confirmacao institucional.

## 13. Decisoes pendentes

- Confirmar endpoints do SUAP IFBA para reservas de ambientes.
- Confirmar permissao institucional para registrar aplicacao OAuth/API.
- Definir autenticacao inicial.
- Definir politica de exibicao de dados pessoais.
- Definir ambiente de producao.
- Definir pipeline de deploy.

