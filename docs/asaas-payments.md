# Pagamentos Asaas

## Fluxo

- Cliente de teste usa `ASAAS_SANDBOX_API_KEY` e API Sandbox. Enquanto a conta PJ estiver em análise e `ASAAS_API_KEY` não estiver configurada, clientes reais mantêm o aceite de orçamento atual e o Pix de fotos extras pelo Mercado Pago. Após a liberação PJ, adicionar a chave de produção ativa o Asaas para clientes reais. O tipo do cliente não pode ser alterado após a criação.
- Orçamento de cliente de teste com valor exige pagamento após o aceite; isso também valerá para clientes reais quando a chave de produção for ativada. O cliente escolhe entrada percentual, quando configurada, ou valor integral. A confirmação do provedor muda o orçamento para aceito. O valor pago e o saldo restante aparecem ao cliente e no admin; o saldo não é cobrado automaticamente nesta versão.
- Fotos extras geram cobrança hospedada e a seleção só é concluída após confirmação do provedor. Cobranças antigas do Mercado Pago continuam consultáveis.
- Durante cobrança Asaas pendente, a seleção e alterações administrativas que possam mudar a galeria ficam bloqueadas. Após recusa, é possível ajustar as fotos e gerar outra cobrança.
- `billingType: UNDEFINED` oferece as formas habilitadas na fatura Asaas. A [documentação oficial](https://docs.asaas.com/reference/criar-nova-cobranca) lista boleto, Pix e cartão de crédito; débito não está disponível nesse fluxo.
- A aprovação exige consultar a cobrança no Asaas e conferir ambiente, ID, referência e valor. O site nunca recebe dados de cartão.
- Clientes Asaas criados pelo site usam referência própria; cadastros da Fotop na mesma conta não são reutilizados.

## Configuração do Worker `cloudinary`

`wrangler.jsonc` replica os bindings e a variável pública do Worker atual. Manter todos os secrets existentes. Adicionar os secrets abaixo sem gravar seus valores no Git:

| Secret | Uso |
| --- | --- |
| `ASAAS_API_KEY` | Chave da conta de produção; adicionar somente após a validação PJ e ativação dos meios de pagamento |
| `ASAAS_SANDBOX_API_KEY` | Chave da conta Sandbox |
| `ASAAS_WEBHOOK_TOKEN` | Token exclusivo do webhook de produção |
| `ASAAS_SANDBOX_WEBHOOK_TOKEN` | Token exclusivo do webhook Sandbox |

Configurar no Asaas webhooks de cobranças com esses tokens, separados por ambiente. O webhook de produção será criado quando o Asaas liberar a conta PJ:

- Produção: `https://api.marcelconde.com.br/payments/asaas/webhook`
- Sandbox: `https://api.marcelconde.com.br/payments/asaas/sandbox/webhook`

Eventos de cobrança devem incluir pagamento confirmado, recebido, recusado, excluído e estornado. O Worker autentica cada webhook pelo cabeçalho `asaas-access-token` e consulta o pagamento diretamente no ambiente correto. Se o webhook falhar, a consulta de status na página do cliente também tenta conciliar. Não remover os secrets do Mercado Pago enquanto houver cobranças antigas pendentes.

## Publicação e validação

1. Conferir bindings e a versão atual do Worker para rollback. Salvar os secrets Sandbox no Worker e cadastrar seu webhook.
2. Publicar primeiro os arquivos estáticos no GitHub Pages; eles são compatíveis com o Worker anterior. Publicar depois `worker.js` no Worker `cloudinary` em `api.marcelconde.com.br`.
3. Testar com cliente de teste: orçamento de R$ 300, entrada e valor integral; galeria com fotos extras. Confirmar que a fatura abre em `sandbox.asaas.com`, que o saldo fictício muda no Sandbox e que a seleção/aceite só conclui após confirmação.
4. Depois que o Asaas validar a conta PJ e habilitar os meios desejados, salvar `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN`, cadastrar o webhook de produção e fazer uma cobrança real de valor pequeno. Confirmar fatura em `www.asaas.com`, recebimento na conta, taxa, e-mail, status e saldo restante quando houver entrada.

Testes locais: `node --test tests/*.cjs`. Eles usam respostas simuladas; não provam que as chaves, permissões da conta, checkout e webhooks reais funcionam.
