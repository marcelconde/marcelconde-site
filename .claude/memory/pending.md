# Pendências

Remova o item quando resolvido. Registre aqui o que Marcel pedir para lembrar ou deixar para depois.

- **Asaas — conta nova só do site** (cadastro aprovado em 2026-10-22: dados comerciais, documentos e aprovação geral). Não voltar ao Mercado Pago. Falta:
  1. Cadastrar uma chave Pix na conta (Pix → Minhas chaves está vazio em 2026-10-22); sem ela a cobrança não gera QR Code e as fotos extras caem no cartão.
  2. Depois da chave, conferir no uso real o modal de fotos extras: QR Code Pix aparece, copia e cola funciona e a troca Pix↔cartão mantém uma cobrança só.
  3. Conferir o e-mail de confirmação do pagamento real de R$ 5 (2026-10-05); o valor aparece como confirmado (líquido R$ 4,42) e cai em 32 dias por ser cartão. Testar o Sandbox conforme `docs/asaas-payments.md`.
  4. Na conta antiga: excluir as chaves criadas/expostas em 2026-10-01/02 (não a da Fotop) e o webhook "marcelconde.com.br - site".
  5. Sandbox: a conta nova não tem Sandbox; conferir se `ASAAS_SANDBOX_API_KEY` e o webhook Sandbox atuais continuam válidos ou criar o Sandbox da conta nova.
  6. Decidir com Marcel: divergência que exige conferência manual (pago com valor ou referência diferente, cobrança cancelada que reaparece) responde 503 ao Asaas a cada tentativa e pode pausar a fila após 15 falhas. Avaliar responder 200 e avisar o admin por e-mail.
  7. Débito na fatura do Asaas falhou em 2026-10-05 com erro 500 do servidor 3DS do Santander, fora do site. Repetir com outro banco.
- **Proteção real das fotos (proposta, aguarda Marcel):** a marca d'água da galeria é só CSS e a API entrega a URL do arquivo no Cloudinary (até 25 MP), então o bloqueio de inspeção não impede a cópia. Proposta: entregar ao cliente versão reduzida com a marca aplicada pelo Cloudinary e URL assinada, sem acesso público ao original.
- **Bloqueio de inspeção só na galeria do cliente:** perguntar a Marcel se quer `content-guard.js` também no portfólio público.
- **Marca d'água sumiu após o pagamento (relato de Marcel, 2026-10-05):** não reproduzido; em "em edição" não há mais fotos. Conferir a marca numa galeria reaberta.
- **Orçamentos ainda oferecem boleto:** a fatura usa `UNDEFINED`. Perguntar a Marcel se quer o mesmo tratamento das fotos extras (Pix na página, cartão no Asaas, sem boleto).
- **Lightroom sem commit no PC Windows:** Marcel ainda não respondeu se o trabalho de 2026-09-26 vai para a branch `lightroom-wip`. Não enviar para a `main` (publicaria o botão no admin).
- **Validar login no uso real:** (1) captcha resolvido de verdade é aceito (se a secret estiver errada, ninguém passa do 2º erro); (2) e-mail de conta bloqueada chega com o botão de redefinir; (3) bloquear/desbloquear em Clientes e Usuários.
- **Integração Lightroom Classic (Windows).** Só lembrar Marcel quando o Asaas estiver 100% concluído. Enviar fotos selecionadas para uma coleção; usar CSV/API da seleção; originais no disco Windows; validar nomes, ausências e duplicatas.
- **Nota fiscal automática (pedido de Marcel em 2026-10-05).** Só depois do Asaas 100% concluído; lembrar Marcel nessa hora. Quando o cliente pagar o trabalho ou as fotos extras, cliente e Marcel recebem por e-mail o comprovante de pagamento junto com a nota fiscal. Avaliar primeiro a emissão de NFS-e do próprio Asaas (há eventos de "Notas fiscais" no webhook) antes de integrar outro sistema.
- **E-mail pessoal no código:** `admin/admin.js` (`adminEmail`) e o fallback de `ADMIN_EMAIL` em `worker.js` ainda usam o e-mail pessoal de Marcel. É o login do admin; perguntar a Marcel antes de trocar para `contato@marcelconde.com.br`.
- **Ideia não iniciada:** API Pix Bradesco (apenas inscrita no portal).
- **Limpeza menor:** `README.md` quase vazio.
