# Pagamentos Asaas

## Fluxo

- Asaas é o único intermediador. Cliente de teste usa `ASAAS_SANDBOX_API_KEY` e API Sandbox; cliente real usa `ASAAS_API_KEY` e API de produção. Sem a chave do ambiente, aceite de orçamento com valor e cobrança de fotos extras falham com 503, sem alternativa. O tipo do cliente não pode ser alterado após a criação.
- Orçamento com valor exige pagamento após o aceite. O cliente escolhe entrada percentual, quando configurada, ou valor integral. A confirmação do provedor muda o orçamento para aceito. O valor pago e o saldo restante aparecem ao cliente e no admin; o saldo não é cobrado automaticamente nesta versão.
- Fotos extras geram uma única cobrança Asaas e a seleção só é concluída após confirmação do provedor. A cobrança nasce como Pix e o QR Code aparece na própria galeria; "Pagar com cartão" troca o tipo da mesma cobrança (`PUT /payments/{id}`) e abre a página do Asaas, e "Pagar com Pix" faz o caminho de volta. Assim nunca há duas cobranças nem oferta de boleto. Se o Asaas recusar o Pix na criação, a cobrança é criada como cartão. O QR Code é lido do Asaas a cada abertura do pagamento e não é guardado, porque muda quando a cobrança é atualizada. O Mercado Pago foi removido; registros antigos (todos recusados) ficam apenas como histórico.
- Durante cobrança pendente de fotos extras, a seleção e alterações administrativas que possam mudar a galeria ficam bloqueadas. Cliente e admin podem cancelar a cobrança; o site a exclui no Asaas, registra o evento e libera a seleção para ajuste. Cobrança confirmada exige estorno separado e não pode ser cancelada por esse botão.
- Orçamentos usam `billingType: UNDEFINED`, que oferece na fatura Asaas todas as formas habilitadas na conta, inclusive boleto. A [documentação oficial](https://docs.asaas.com/reference/criar-nova-cobranca) lista boleto, Pix e cartão de crédito; débito não está disponível nesse fluxo.
- A aprovação exige consultar a cobrança no Asaas e conferir ambiente, ID, referência e valor. O site nunca recebe dados de cartão.
- O site usa uma conta Asaas própria, separada da conta da Fotop (desde 2026-10-05). Clientes Asaas criados pelo site usam referência própria.

## Configuração do Worker `cloudinary`

`wrangler.jsonc` replica os bindings e a variável pública do Worker atual. Manter todos os secrets existentes. Adicionar os secrets abaixo sem gravar seus valores no Git:

| Secret | Uso |
| --- | --- |
| `ASAAS_API_KEY` | Chave da conta de produção; adicionar somente após a validação PJ e ativação dos meios de pagamento |
| `ASAAS_SANDBOX_API_KEY` | Chave da conta Sandbox |
| `ASAAS_WEBHOOK_TOKEN` | Token exclusivo do webhook de produção |
| `ASAAS_SANDBOX_WEBHOOK_TOKEN` | Token exclusivo do webhook Sandbox |

Configurar no Asaas webhooks de cobranças com esses tokens, separados por ambiente. O de produção usa v3, envio não sequencial e o nome "marcelconde.com.br - site":

- Produção: `https://api.marcelconde.com.br/payments/asaas/webhook`
- Sandbox: `https://api.marcelconde.com.br/payments/asaas/sandbox/webhook`

Eventos de cobrança devem incluir pagamento confirmado, recebido, recusado, excluído e estornado. O Worker autentica cada webhook pelo cabeçalho `asaas-access-token`, ignora cobranças de outras integrações da mesma conta e consulta as cobranças do site diretamente no ambiente correto. Se o webhook falhar, a consulta de status na página do cliente também tenta conciliar.

## Publicação e validação

1. Conferir bindings e a versão atual do Worker para rollback. Salvar os secrets Sandbox no Worker e cadastrar seu webhook.
2. Publicar primeiro os arquivos estáticos no GitHub Pages; eles são compatíveis com o Worker anterior. Publicar depois `worker.js` no Worker `cloudinary` em `api.marcelconde.com.br`.
3. Testar com cliente de teste: orçamento de R$ 300, entrada e valor integral; galeria com fotos extras. Confirmar que a fatura abre em `sandbox.asaas.com`, que o saldo fictício muda no Sandbox e que a seleção/aceite só conclui após confirmação.
4. Os secrets `MERCADO_PAGO_ACCESS_TOKEN` e `MERCADO_PAGO_WEBHOOK_SECRET` não são mais usados e podem ser removidos do Worker; desative também o webhook no painel do Mercado Pago.
5. Com `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` e o webhook de produção configurados, e depois que o Asaas aprovar o cadastro, fazer uma cobrança real de valor pequeno. Confirmar fatura em `www.asaas.com`, recebimento na conta, taxa, e-mail, status e saldo restante quando houver entrada.

Testes locais: `node --test tests/*.cjs`. Eles usam respostas simuladas; não provam que as chaves, permissões da conta, checkout e webhooks reais funcionam.
