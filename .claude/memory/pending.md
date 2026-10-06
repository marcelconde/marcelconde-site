# Pendências

Remova o item quando resolvido. Registre aqui o que Marcel pedir para lembrar ou deixar para depois.

- **Asaas — conta nova só do site** (a antiga fica com a Fotop; o chamado do `403 not_allowed_ip` deixou de bloquear o site). Não voltar ao Mercado Pago. Falta:
  1. Aguardar o Asaas aprovar o cadastro (documentação e geral em análise; dados bancários pendentes — Marcel confere em Minha conta se falta enviar algo).
  2. Testar a produção a partir do Worker (não há rota de diagnóstico; hoje só com cobrança real). Se recusar IP fora do Brasil, isolar as rotas de pagamento ou remover `placement` do `wrangler.jsonc`.
  3. Mesclar `asaas-only` na `main`, publicar Pages e depois o Worker.
  4. Cobrança real ≥ R$ 5 e conferência de webhook, saldo e e-mail; Sandbox conforme `docs/asaas-payments.md`.
  5. Na conta antiga: excluir as chaves criadas/expostas em 2026-10-01/02 (não a da Fotop) e o webhook "marcelconde.com.br - site". Remover secrets e webhook do Mercado Pago.
  6. Sandbox: a conta nova não tem Sandbox; conferir se `ASAAS_SANDBOX_API_KEY` e o webhook Sandbox atuais continuam válidos ou criar o Sandbox da conta nova.
- **Lightroom sem commit no PC Windows:** Marcel ainda não respondeu se o trabalho de 2026-09-26 vai para a branch `lightroom-wip`. Não enviar para a `main` (publicaria o botão no admin).
- **Validar login no uso real:** (1) captcha resolvido de verdade é aceito (se a secret estiver errada, ninguém passa do 2º erro); (2) e-mail de conta bloqueada chega com o botão de redefinir; (3) bloquear/desbloquear em Clientes e Usuários.
- **Integração Lightroom Classic (Windows).** Só lembrar Marcel quando o Asaas estiver 100% concluído. Enviar fotos selecionadas para uma coleção; usar CSV/API da seleção; originais no disco Windows; validar nomes, ausências e duplicatas.
- **Nota fiscal automática (pedido de Marcel em 2026-10-05).** Só depois do Asaas 100% concluído; lembrar Marcel nessa hora. Quando o cliente pagar o trabalho ou as fotos extras, cliente e Marcel recebem por e-mail o comprovante de pagamento junto com a nota fiscal. Avaliar primeiro a emissão de NFS-e do próprio Asaas (há eventos de "Notas fiscais" no webhook) antes de integrar outro sistema.
- **E-mail pessoal no código:** `admin/admin.js` (`adminEmail`) e o fallback de `ADMIN_EMAIL` em `worker.js` ainda usam o e-mail pessoal de Marcel. É o login do admin; perguntar a Marcel antes de trocar para `contato@marcelconde.com.br`.
- **Ideia não iniciada:** API Pix Bradesco (apenas inscrita no portal).
- **Limpeza menor:** `.DS_Store` rastreados no Git; `README.md` quase vazio.
