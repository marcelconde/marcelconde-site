# Pendências

Remova o item quando resolvido. Registre aqui o que Marcel pedir para lembrar ou deixar para depois.

- **Ordem dos álbuns:** Worker publicado em 2026-11-16 (rota responde); falta Marcel salvar a ordem e tirar "Animais" do primeiro card.
- **Fila do webhook Sandbox pausada desde 2026-09-24** ("marcelconde-site-sandbox", conta antiga do Asaas, 503): o código já aceita eventos órfãos (2026-11-16); falta Marcel entrar na conta antiga para reativar a fila em Integrações → Webhooks (editar → "Fila de sincronização ativada") e conferir se `ASAAS_SANDBOX_API_KEY` ainda vale.
- **ORC-2026-BCS6WW** (R$ 500, cliente "Marcel Sales Conde"/`contato@`, real): aceito em 2026-10-22 e parado em "aguardando pagamento" sem cobrança gerada; parece teste antigo de Marcel. Perguntar se apaga (o admin não apaga orçamento nesse estado).
- **Asaas — conta nova só do site** (cadastro aprovado em 2026-10-22: dados comerciais, documentos e aprovação geral). Não voltar ao Mercado Pago. Falta:
  1. Chave Pix `pix@marcelconde.com.br` (e-mail, alias do Cloudflare Email Routing para o Gmail de Marcel) cadastrada em 2026-10-22. Pix dinâmico: R$ 0,99 por cobrança recebida até 03/01/2027 (depois R$ 1,99), recebe na hora.
  2. Pix real validado em 2026-11-16 (QR na galeria, pago e confirmado). Falta conferir no uso real a troca Pix↔cartão mantendo uma cobrança só.
  3. Conferir o e-mail de confirmação do pagamento real de R$ 5 (2026-10-05); o valor aparece como confirmado (líquido R$ 4,42) e cai em 32 dias por ser cartão. Testar o Sandbox conforme `docs/asaas-payments.md`.
  4. Na conta antiga: excluir as chaves criadas/expostas em 2026-10-01/02 (não a da Fotop) e o webhook "marcelconde.com.br - site".
  5. Sandbox: a conta nova não tem Sandbox; conferir se `ASAAS_SANDBOX_API_KEY` e o webhook Sandbox atuais continuam válidos ou criar o Sandbox da conta nova.
  6. Débito na fatura do Asaas falhou em 2026-10-05 com erro 500 do servidor 3DS do Santander, fora do site. Repetir com outro banco.
- **WhatsApp para pedido de avaliação (pedido de Marcel, 2026-11-16), aguarda decisão:** (a) botão no admin que abre o WhatsApp do Marcel com a mensagem e o link `/avaliar/?t=…` prontos (sem custo, 1 clique para enviar; o Worker precisa devolver o link ao admin, hoje o token não sai da API); (b) envio automático pela WhatsApp Cloud API oficial (Meta): conta Meta Business verificada, número conectado (coexistência com o app WhatsApp Business), modelo de mensagem aprovado, token no Worker e custo por mensagem entregue. Não usar APIs não oficiais (risco de banimento do número).
- **Proteção real das fotos (proposta, aguarda Marcel):** a marca d'água da galeria é só CSS e a API entrega a URL do arquivo no Cloudinary (até 25 MP), então o bloqueio de inspeção não impede a cópia. Proposta: entregar ao cliente versão reduzida com a marca aplicada pelo Cloudinary e URL assinada, sem acesso público ao original.
- **Bloqueio de inspeção só na galeria do cliente:** perguntar a Marcel se quer `content-guard.js` também no portfólio público.
- **Marca d'água sumiu após o pagamento (relato de Marcel, 2026-10-05):** não reproduzido; em "em edição" não há mais fotos. Conferir a marca numa galeria reaberta.
- **Orçamentos ainda oferecem boleto:** a fatura usa `UNDEFINED`. Perguntar a Marcel se quer o mesmo tratamento das fotos extras (Pix na página, cartão no Asaas, sem boleto).
- **Lightroom sem commit no PC Windows:** Marcel ainda não respondeu se o trabalho de 2026-09-26 vai para a branch `lightroom-wip`. Não enviar para a `main` (publicaria o botão no admin).
- **Validar login no uso real:** (1) captcha resolvido de verdade é aceito (se a secret estiver errada, ninguém passa do 2º erro); (2) e-mail de conta bloqueada chega com o botão de redefinir; (3) bloquear em Usuários e desbloquear (bloquear em Clientes validado em 2026-11-16: sessão caiu na hora).
- **Integração Lightroom Classic (Windows).** Só lembrar Marcel quando o Asaas estiver 100% concluído. Enviar fotos selecionadas para uma coleção; usar CSV/API da seleção; originais no disco Windows; validar nomes, ausências e duplicatas.
- **Nota fiscal automática (pedido de Marcel em 2026-10-05).** Só depois do Asaas 100% concluído; lembrar Marcel nessa hora. Quando o cliente pagar o trabalho ou as fotos extras, cliente e Marcel recebem por e-mail o comprovante de pagamento junto com a nota fiscal. Avaliar primeiro a emissão de NFS-e do próprio Asaas (há eventos de "Notas fiscais" no webhook) antes de integrar outro sistema.
- **E-mail pessoal no código:** `admin/admin.js` (`adminEmail`) e o fallback de `ADMIN_EMAIL` em `worker.js` ainda usam o e-mail pessoal de Marcel. É o login do admin; perguntar a Marcel antes de trocar para `contato@marcelconde.com.br`.
- **Ideia não iniciada:** API Pix Bradesco (apenas inscrita no portal).
- **Sugestões do benchmark (2026-11-16), não feitas:** (1) galeria entregue ainda mostra a mensagem padrão "Selecione suas fotos favoritas…"; (2) o pedido de avaliação agendado para o dia seguinte não é cancelado quando a galeria é apagada; (3) o admin lista as fotos da galeria por envio (mais novas primeiro), enquanto o cliente vê por nome de arquivo; (4) apagar galeria deixa os registros de pagamento (`private_gallery_payment`, `asaas_payment`), origem dos eventos órfãos do webhook.
- **Limpeza menor:** `README.md` quase vazio.
