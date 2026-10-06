# Pendências

Remova o item quando resolvido. Registre aqui o que Marcel pedir para lembrar ou deixar para depois.

- **Asaas — conta nova só do site** (a antiga fica com a Fotop; o chamado do `403 not_allowed_ip` deixou de bloquear o site). Não voltar ao Mercado Pago. Falta:
  0. Marcel: salvar o webhook de produção na conta nova. Formulário preenchido em 2026-10-05 no navegador interno do Windows (nome "marcelconde.com.br - site", URL de produção, v3, não sequencial, eventos CONFIRMED, RECEIVED, DELETED, REFUNDED, REPROVED_BY_RISK_ANALYSIS e CREDIT_CARD_CAPTURE_REFUSED); faltam e-mail e token. Gravar o mesmo token em `ASAAS_WEBHOOK_TOKEN`. Se o formulário se perder, refazer.
  1. Marcel: aguardar a aprovação do cadastro ("Em análise"), gerar a chave de API na conta nova (não enviar no chat) e rodar o teste do Mac que só grava `ASAAS_API_KEY` no Worker se HTTP 200.
  2. Se a produção recusar IP fora do Brasil, isolar as rotas de pagamento ou remover `placement` do `wrangler.jsonc`.
  3. Mesclar `asaas-only` na `main`, publicar Pages e depois o Worker.
  4. Cobrança real ≥ R$ 5 e conferência de webhook, saldo e e-mail; Sandbox conforme `docs/asaas-payments.md`.
  5. Na conta antiga: excluir as chaves criadas/expostas em 2026-10-01/02 (não a da Fotop) e o webhook "marcelconde.com.br - site". Remover secrets e webhook do Mercado Pago.
  6. Sandbox: a conta nova não tem Sandbox; conferir se `ASAAS_SANDBOX_API_KEY` e o webhook Sandbox atuais continuam válidos ou criar o Sandbox da conta nova.
- **Lightroom sem commit no PC Windows:** Marcel ainda não respondeu se o trabalho de 2026-09-26 vai para a branch `lightroom-wip`. Não enviar para a `main` (publicaria o botão no admin).
- **Validar login no uso real:** (1) captcha resolvido de verdade é aceito (se a secret estiver errada, ninguém passa do 2º erro); (2) e-mail de conta bloqueada chega com o botão de redefinir; (3) bloquear/desbloquear em Clientes e Usuários.
- **Integração Lightroom Classic (Windows).** Só lembrar Marcel quando o Asaas estiver 100% concluído. Enviar fotos selecionadas para uma coleção; usar CSV/API da seleção; originais no disco Windows; validar nomes, ausências e duplicatas.
- **Nota fiscal automática (pedido de Marcel em 2026-10-05).** Só depois do Asaas 100% concluído; lembrar Marcel nessa hora. Quando o cliente pagar o trabalho ou as fotos extras, cliente e Marcel recebem por e-mail o comprovante de pagamento junto com a nota fiscal. Avaliar primeiro a emissão de NFS-e do próprio Asaas (há eventos de "Notas fiscais" no webhook) antes de integrar outro sistema.
- **Ideia não iniciada:** API Pix Bradesco (apenas inscrita no portal).
- **Limpeza menor:** `.DS_Store` rastreados no Git; `README.md` quase vazio.
