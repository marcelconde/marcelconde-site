# Estado atual

Verificado em 2026-10-05: `main` = `origin/main`. Worker `cloudinary` publicado a partir da `main` (versão `ea5fa866`, commit `b661ac4`). Reconfirme após novos commits ou trabalho feito no Windows.

## Funcionando

- Site/admin via GitHub Pages; API Worker `cloudinary` com `LIKES_KV`, `GALLERY_DB` (D1) e 13 secrets. Worker roda em `aws:us-east-1` (placement; header `cf-placement: remote-IAD`): D1 ~15 ms por consulta, contra ~140 ms a partir do Brasil.
- Clientes reais/de teste, orçamentos e PDFs, galerias privadas, seleção persistente, histórico, filtros, busca, "Ver como cliente", CSV da seleção, máscara CPF/CNPJ (`document-mask.js`).
- Galerias: exclusão em lotes pela Admin API do Cloudinary; seção "Fotos editadas" com conferência por nome de arquivo e "Concluir entrega" (`/private/gallery/complete-delivery`), que apaga os originais da seleção e guarda os nomes em `gallery.deliveredSelection`.
- Upload de galeria: mantém resolução até 25 MP e busca a maior qualidade JPEG em ~9,9 MB (plano Free: 10 MB e 25 MP); 3 envios simultâneos. Portfólio também envia 3 por vez.
- Fotos extras (2026-10-05): a cobrança nasce como Pix e o QR Code aparece no modal da galeria; "Pagar com cartão" troca o tipo da mesma cobrança e abre a página do Asaas, sem boleto; se o Asaas recusar Pix, a cobrança sai como cartão. Rota `/client-gallery/payment/method`. Detalhes em `docs/asaas-payments.md`.
- Galeria "em edição" (2026-10-05): o cliente não recebe fotos nem capa e não altera a seleção; vê só o aviso de edição até o admin reabrir a seleção ou liberar o download. `content-guard.js` na galeria do cliente bloqueia menu de contexto, arrastar, salvar e imprimir e limpa a página ao abrir as ferramentas de desenvolvedor (só dissuasão).
- Proteção de login (admin e cliente, 2026-10-05): após 1 senha errada exige Cloudflare Turnstile (site key em `login-guard.js`, `TURNSTILE_SECRET_KEY` no Worker); após 5 erros em 24 h a conta bloqueia, envia e-mail com botão de redefinição e só libera com nova senha. O admin vê contas bloqueadas e pode bloquear/desbloquear em Clientes ("Acesso e senha") e em Usuários; bloqueio do admin derruba sessões e resiste a redefinição. Estado em D1: `login_guard:<escopo>:<email>` (`lockedBy`: `attempts` ou `admin`).
- Testes: `node --test tests/*.cjs` — 55/55 em 2026-10-05.

## Ainda não validado no uso real

- Exclusão em lotes e "Concluir entrega": testadas com simulação e tela local. A galeria `gal_OFvN_CL1W9R7` ("Cobertura colocação de grau") tem 50 fotos não selecionadas já apagadas no Cloudinary com registro órfão; "Remover não selecionadas" deve limpar (`not_found` conta como removida).
- Melhora de velocidade do admin: medida no servidor, falta Marcel confirmar.

## Pagamentos (conta Asaas nova em configuração)

- Clientes reais ainda não conseguem pagar. Marcel abriu uma conta Asaas nova só para o site; a antiga fica só com a Fotop (nela a produção respondia `403 not_allowed_ip` para qualquer IP).
- Conta nova (2026-10-05): cadastro em análise (`myAccount/status`: commercialInfo APPROVED, bankAccountInfo PENDING, documentation e general AWAITING_APPROVAL); webhook de produção "marcelconde.com.br - site" salvo e ativo (v3, não sequencial, eventos CONFIRMED, RECEIVED, DELETED, REFUNDED, REPROVED_BY_RISK_ANALYSIS, CREDIT_CARD_CAPTURE_REFUSED); `ASAAS_WEBHOOK_TOKEN` regravado com o token dele. Sem IPs autorizados (API aceita qualquer IP) e validação de saque por webhook desabilitada. Sandbox não criado nela. O Worker (`us-east-1`) já criou cobrança real nela em 2026-10-05, sem bloqueio de IP. Pix indisponível até o Asaas aprovar os documentos (painel Pix: "Envie seus documentos — Em análise"); até lá fotos extras saem como cartão e a fatura de orçamento mostra boleto e cartões. Webhooks de produção chegam e passam pelo token (confirmado nos logs em 2026-10-05). Primeiro pagamento real concluído em 2026-10-05 (cartão de crédito, R$ 5, fotos extras): o webhook confirmou e a galeria foi para "em edição". Webhook ativo, 0 eventos penalizados.
- `ASAAS_API_KEY` do Worker regravada em 2026-10-05 com a chave "marcelconde.com.br - site" da conta nova (gravada só após HTTP 200). O webhook de mesmo nome criado antes está na conta antiga.
- Mercado Pago removido do código (merge da `asaas-only`, commit `902f241`, publicado em 2026-10-05); `/payments/mercadopago/webhook` responde 405. Os secrets `MERCADO_PAGO_*` ainda existem no Worker, sem uso. A branch remota `asaas-only` já está mesclada e pode ser apagada.
- D1 tinha só 2 cobranças Mercado Pago, ambas `rejected` (2026-10-01).

## Ambiente

- PC Windows (2026-10-05): há um início da integração Lightroom sem commit, de 2026-09-26 (botão "Levar seleção ao Lightroom" no admin, `tools/lightroom/`, `docs/lightroom-classic.md`, testes); aguarda Marcel decidir se vai para uma branch `lightroom-wip`. Node 24.19.0 instalado em 2026-10-05; testes 57/57 nesse PC (55 da `main` + 2 do Lightroom local). Não há `package.json`: `npx` baixa o `wrangler` a cada uso; no PowerShell usar `npx.cmd`.
- O navegador interno do Claude no Windows fica logado na conta Asaas nova; a aba "Chaves de API" é bloqueada para o Claude.

Referências: `architecture.md`, `decisions.md`, `bugs.md`, `docs/`.
