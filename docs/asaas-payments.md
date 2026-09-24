# Pagamentos Asaas

## Fluxo

- Cliente real usa `ASAAS_API_KEY` e API de produção. Cliente de teste usa `ASAAS_SANDBOX_API_KEY` e API Sandbox. O tipo do cliente não pode ser alterado após a criação.
- Orçamento com valor exige pagamento após o aceite. O cliente escolhe entrada percentual, quando configurada, ou valor integral. A confirmação do provedor muda o orçamento para aceito. O valor pago e o saldo restante aparecem ao cliente e no admin; o saldo não é cobrado automaticamente nesta versão.
- Fotos extras geram cobrança hospedada e a seleção só é concluída após confirmação do provedor. Cobranças antigas do Mercado Pago continuam consultáveis.
- Durante cobrança Asaas pendente, a seleção e alterações administrativas que possam mudar a galeria ficam bloqueadas. Após recusa, é possível ajustar as fotos e gerar outra cobrança.
- `billingType: UNDEFINED` oferece as formas habilitadas na fatura Asaas. A [documentação oficial](https://docs.asaas.com/reference/criar-nova-cobranca) lista boleto, Pix e cartão de crédito; débito não está disponível nesse fluxo.
- A aprovação exige consultar a cobrança no Asaas e conferir ambiente, ID, referência e valor. O site nunca recebe dados de cartão.
- Clientes Asaas criados pelo site usam referência própria; cadastros da Fotop na mesma conta não são reutilizados.

## Configuração do Worker `cloudinary`

Manter `GALLERY_DB`, `LIKES_KV` e os secrets existentes. Adicionar quatro secrets, sem gravar seus valores no Git:

| Secret | Uso |
| --- | --- |
| `ASAAS_API_KEY` | Chave da conta de produção |
| `ASAAS_SANDBOX_API_KEY` | Chave da conta Sandbox |
| `ASAAS_WEBHOOK_TOKEN` | Token exclusivo do webhook de produção |
| `ASAAS_SANDBOX_WEBHOOK_TOKEN` | Token exclusivo do webhook Sandbox |

Configurar no Asaas dois webhooks de cobranças com esses tokens, separados por ambiente:

- Produção: `https://api.marcelconde.com.br/payments/asaas/webhook`
- Sandbox: `https://api.marcelconde.com.br/payments/asaas/sandbox/webhook`

Eventos de cobrança devem incluir pagamento confirmado, recebido, recusado, excluído e estornado. O Worker autentica cada webhook pelo cabeçalho `asaas-access-token` e consulta o pagamento diretamente no ambiente correto. Se o webhook falhar, a consulta de status na página do cliente também tenta conciliar. Não remover os secrets do Mercado Pago enquanto houver cobranças antigas pendentes.

## Publicação e validação

1. Confirmar que a conta de produção está validada como PJ e que os meios de pagamento desejados estão habilitados no Asaas.
2. Fazer backup do código atual do Worker e conferir bindings. Salvar os quatro secrets no Worker; cadastrar os dois webhooks no Asaas.
3. Publicar primeiro os arquivos estáticos no GitHub Pages; eles são compatíveis com o Worker anterior. Publicar depois `worker.js` no Worker `cloudinary` em `api.marcelconde.com.br`.
4. Testar com cliente de teste: orçamento de R$ 300, entrada e valor integral; galeria com fotos extras. Confirmar que a fatura abre em `sandbox.asaas.com`, que o saldo fictício muda no Sandbox e que a seleção/aceite só conclui após confirmação.
5. Com a conta PJ validada, fazer uma cobrança real de valor pequeno com cliente real. Confirmar fatura em `www.asaas.com`, recebimento na conta, taxa, e-mail, status e saldo restante quando houver entrada.

Testes locais: `node --test tests/*.cjs`. Eles usam respostas simuladas; não provam que as chaves, permissões da conta, checkout e webhooks reais funcionam.
