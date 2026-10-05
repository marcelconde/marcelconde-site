# Pendências

Remova o item quando resolvido. Registre aqui o que Marcel pedir para lembrar ou deixar para depois.

- **Asaas (aguardando suporte, chat aberto em 2026-10-02)** sobre `403 not_allowed_ip` (códigos 03AZUURAAU, 0329CZDNFZ). Marcel mantém esta conta e não aceita voltar ao Mercado Pago. Após liberação:
  1. Gerar chave nova (não enviar no chat) e rodar o teste do Mac que só grava no Worker se HTTP 200.
  2. Se a produção recusar IP fora do Brasil, isolar as rotas de pagamento ou remover `placement` do `wrangler.jsonc`.
  3. Mesclar `asaas-only` na `main`, publicar Pages e depois o Worker.
  4. Cobrança real ≥ R$ 5 e conferência de webhook, saldo e e-mail; Sandbox conforme `docs/asaas-payments.md`.
  5. Excluir no Asaas as chaves criadas/expostas em 2026-10-01/02 (não a da Fotop); remover secrets e webhook do Mercado Pago.
- **Validar o captcha do login no navegador:** `TURNSTILE_SECRET_KEY` gravada e site key publicada (2026-10-05); a API já exige o captcha após 1 erro e recusa token falso. Falta Marcel confirmar que um captcha resolvido de verdade é aceito (se a secret estiver errada, ninguém passa do 2º erro).
- **Integração Lightroom Classic (Windows).** Só lembrar Marcel quando o Asaas estiver 100% concluído. Enviar fotos selecionadas para uma coleção; usar CSV/API da seleção; originais no disco Windows; validar nomes, ausências e duplicatas.
- **Ideias não iniciadas:** NFSe automática; API Pix Bradesco (apenas inscrita no portal).
- **Limpeza menor:** `.DS_Store` rastreados no Git; `README.md` quase vazio.
