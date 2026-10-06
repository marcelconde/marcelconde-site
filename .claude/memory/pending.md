# Pendências

Remova o item quando resolvido. Registre aqui o que Marcel pedir para lembrar ou deixar para depois.

- **Asaas — conta nova só do site** (a antiga fica com a Fotop; o chamado do `403 not_allowed_ip` deixou de bloquear o site). Não voltar ao Mercado Pago. Falta:
  1. Aguardar o Asaas aprovar o cadastro (documentação e geral em análise; dados bancários pendentes — Marcel confere em Minha conta se falta enviar algo).
  2. Depois da aprovação, conferir no uso real o modal de fotos extras: QR Code Pix aparece, copia e cola funciona e a troca Pix↔cartão mantém uma cobrança só (testado apenas com simulação e prévia visual).
  3. Cobrança real ≥ R$ 5 e conferência de webhook, saldo e e-mail; Sandbox conforme `docs/asaas-payments.md`.
  4. Na conta antiga: excluir as chaves criadas/expostas em 2026-10-01/02 (não a da Fotop) e o webhook "marcelconde.com.br - site". Remover secrets e webhook do Mercado Pago.
  5. Sandbox: a conta nova não tem Sandbox; conferir se `ASAAS_SANDBOX_API_KEY` e o webhook Sandbox atuais continuam válidos ou criar o Sandbox da conta nova.
  6. Marcel confere no painel, em Chaves de API, que a chave do site não tem "Permitir que esta chave execute operações de saque via API" ligado; o site só cria e consulta cobranças.
- **Orçamentos ainda oferecem boleto:** a fatura usa `UNDEFINED`. Perguntar a Marcel se quer o mesmo tratamento das fotos extras (Pix na página, cartão no Asaas, sem boleto).
- **Lightroom sem commit no PC Windows:** Marcel ainda não respondeu se o trabalho de 2026-09-26 vai para a branch `lightroom-wip`. Não enviar para a `main` (publicaria o botão no admin).
- **Validar login no uso real:** (1) captcha resolvido de verdade é aceito (se a secret estiver errada, ninguém passa do 2º erro); (2) e-mail de conta bloqueada chega com o botão de redefinir; (3) bloquear/desbloquear em Clientes e Usuários.
- **Integração Lightroom Classic (Windows).** Só lembrar Marcel quando o Asaas estiver 100% concluído. Enviar fotos selecionadas para uma coleção; usar CSV/API da seleção; originais no disco Windows; validar nomes, ausências e duplicatas.
- **Nota fiscal automática (pedido de Marcel em 2026-10-05).** Só depois do Asaas 100% concluído; lembrar Marcel nessa hora. Quando o cliente pagar o trabalho ou as fotos extras, cliente e Marcel recebem por e-mail o comprovante de pagamento junto com a nota fiscal. Avaliar primeiro a emissão de NFS-e do próprio Asaas (há eventos de "Notas fiscais" no webhook) antes de integrar outro sistema.
- **E-mail pessoal no código:** `admin/admin.js` (`adminEmail`) e o fallback de `ADMIN_EMAIL` em `worker.js` ainda usam o e-mail pessoal de Marcel. É o login do admin; perguntar a Marcel antes de trocar para `contato@marcelconde.com.br`.
- **Ideia não iniciada:** API Pix Bradesco (apenas inscrita no portal).
- **Limpeza menor:** `.DS_Store` rastreados no Git; `README.md` quase vazio.
