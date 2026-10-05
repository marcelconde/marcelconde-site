# Estado atual

Verificado em 2026-10-05: `main` = `origin/main`. Worker `cloudinary` publicado a partir da `main` (versão `944a0915`, commit `7d00802`). Reconfirme após novos commits ou trabalho feito no Windows.

## Funcionando

- Site/admin via GitHub Pages; API Worker `cloudinary` com `LIKES_KV`, `GALLERY_DB` (D1) e 12 secrets. Worker roda em `aws:us-east-1` (placement; header `cf-placement: remote-IAD`): D1 ~15 ms por consulta, contra ~140 ms a partir do Brasil.
- Clientes reais/de teste, orçamentos e PDFs, galerias privadas, seleção persistente, histórico, filtros, busca, "Ver como cliente", CSV da seleção, máscara CPF/CNPJ (`document-mask.js`).
- Galerias: exclusão em lotes pela Admin API do Cloudinary; seção "Fotos editadas" com conferência por nome de arquivo e "Concluir entrega" (`/private/gallery/complete-delivery`), que apaga os originais da seleção e guarda os nomes em `gallery.deliveredSelection`.
- Upload de galeria: mantém resolução até 25 MP e busca a maior qualidade JPEG em ~9,9 MB (plano Free: 10 MB e 25 MP); 3 envios simultâneos. Portfólio também envia 3 por vez.
- Proteção de login (admin e cliente, 2026-10-05): após 1 senha errada exige Cloudflare Turnstile (site key em `login-guard.js`, `TURNSTILE_SECRET_KEY` no Worker); após 5 erros em 24 h a conta bloqueia, envia e-mail com botão de redefinição e só libera com nova senha. O admin vê contas bloqueadas e pode bloquear/desbloquear em Clientes ("Acesso e senha") e em Usuários; bloqueio do admin derruba sessões e resiste a redefinição. Estado em D1: `login_guard:<escopo>:<email>` (`lockedBy`: `attempts` ou `admin`).
- Testes: `node --test tests/*.cjs` — 52/52 em 2026-10-05.

## Ainda não validado no uso real

- Exclusão em lotes e "Concluir entrega": testadas com simulação e tela local. A galeria `gal_OFvN_CL1W9R7` ("Cobertura colocação de grau") tem 50 fotos não selecionadas já apagadas no Cloudinary com registro órfão; "Remover não selecionadas" deve limpar (`not_found` conta como removida).
- Melhora de velocidade do admin: medida no servidor, falta Marcel confirmar.

## Pagamentos (bloqueado)

- Clientes reais não conseguem pagar: o Asaas de produção responde `403 not_allowed_ip` para qualquer IP, inclusive do Mac residencial (Algar, BR). Lista de IPs da conta está vazia; provável restrição herdada da Fotop (validação de saque aponta para fotop.com.br). Aguardando suporte Asaas.
- `ASAAS_API_KEY` no Worker hoje tem valor inválido; regravar após liberação. Webhook de produção "marcelconde.com.br - site" já criado (v3, não sequencial, eventos de cobrança).
- Branch `asaas-only` (não mesclada) remove o Mercado Pago. Ela partiu de `8cbf660`; a `main` avançou (lotes, entrega, placement) — refazer o merge com cuidado em `worker.js` e nos testes.
- D1 tinha só 2 cobranças Mercado Pago, ambas `rejected` (2026-10-01).

## Ambiente

- Pode haver trabalho local não enviado no PC Windows; compare antes de tarefas entre máquinas.

Referências: `architecture.md`, `decisions.md`, `bugs.md`, `docs/`.
