# Pendências

Remova o item quando resolvido. Registre aqui o que Marcel pedir para lembrar ou deixar para depois.

- **Aguardando suporte Asaas (chat aberto por Marcel em 2026-10-02)** sobre `403 not_allowed_ip` em qualquer IP (códigos 03AZUURAAU, 0329CZDNFZ). Marcel decidiu manter esta conta (não abrir outra) e não voltar ao Mercado Pago. Após liberação: gerar chave nova (não enviar no chat), rodar o teste do Mac que só grava no Worker se HTTP 200, fazer cobrança real ≥ R$ 5, excluir no Asaas as chaves criadas/expostas em 2026-10-01/02 (não a da Fotop).
- **Publicar Asaas único (branch `asaas-only`).** Secrets e webhook feitos em 2026-10-01. Falta: mesclar, aguardar Pages, `wrangler deploy`, cobrança real pequena, remover secrets/webhook do Mercado Pago.
- **Validação Asaas de ponta a ponta.** Sandbox (orçamento R$ 300 com entrada/integral; fotos extras) e, após liberação PJ, configurar `ASAAS_API_KEY`/`ASAAS_WEBHOOK_TOKEN`, webhook de produção e cobrança real pequena. Roteiro em `docs/asaas-payments.md`.
- **Integração Lightroom Classic (Windows).** Só lembrar Marcel quando o Asaas estiver 100% concluído. Enviar fotos selecionadas para uma coleção. Usar CSV/API da seleção; originais ficam no disco Windows. Validar nomes, ausências e duplicatas.
- **Ideias não iniciadas:** NFSe automática; API Pix Bradesco (apenas inscrita no portal).
- **Limpeza menor:** `.DS_Store` rastreados no Git; `README.md` quase vazio.
