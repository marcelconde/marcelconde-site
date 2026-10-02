# Pendências

Remova o item quando resolvido. Registre aqui o que Marcel pedir para lembrar ou deixar para depois.

- **Resolver 403 "IP não autorizado" do Asaas produção** (código 03AZUURAAU). Restrição é da conta (403 até do IP residencial). Caminhos: suporte Asaas/Fotop remover a whitelist herdada, ou abrir conta Asaas independente para o site. Decidir se remove `ASAAS_API_KEY` temporariamente para clientes reais voltarem ao Mercado Pago.
- **Publicar Asaas único (branch `asaas-only`).** Secrets e webhook feitos em 2026-10-01. Falta: mesclar, aguardar Pages, `wrangler deploy`, cobrança real pequena, remover secrets/webhook do Mercado Pago.
- **Validação Asaas de ponta a ponta.** Sandbox (orçamento R$ 300 com entrada/integral; fotos extras) e, após liberação PJ, configurar `ASAAS_API_KEY`/`ASAAS_WEBHOOK_TOKEN`, webhook de produção e cobrança real pequena. Roteiro em `docs/asaas-payments.md`.
- **Integração Lightroom Classic (Windows).** Enviar fotos selecionadas para uma coleção. Usar CSV/API da seleção; originais ficam no disco Windows. Validar nomes, ausências e duplicatas.
- **Ideias não iniciadas:** NFSe automática; API Pix Bradesco (apenas inscrita no portal).
- **Limpeza menor:** `.DS_Store` rastreados no Git; `README.md` quase vazio.
