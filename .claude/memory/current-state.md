# Estado atual

Verificado em 2026-10-01: `main` = `origin/main` após `6e4d9f0` (memória/CLAUDE.md); último código de aplicação em `8cbf660` (cancelamento de cobranças pendentes). Reconfirme após novos commits ou trabalho feito no Windows.

## Funcionando (no código)

- Site/admin via GitHub Pages; API Worker `cloudinary` com `LIKES_KV` e `GALLERY_DB` (D1). `/health` e `/albums` respondendo.
- Clientes reais/de teste, orçamentos e PDFs, galerias privadas com upload Cloudinary, seleção persistente, histórico, filtros, entrega final, busca, "Ver como cliente" e CSV da seleção.
- Asaas Sandbox para clientes de teste; Mercado Pago para clientes reais sem Asaas de produção e cobranças antigas. Cancelamento de cobrança pendente (cliente e admin).
- Testes: `node --test tests/*.cjs` — 48/48 passando em 2026-10-01 (Node local v26.8.1).

## Estado externo

- Secrets do Worker em 2026-10-01: Sandbox Asaas configurado; `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` ausentes (Asaas produção inativo).
- Sem validação financeira real de ponta a ponta registrada.
- Pode haver trabalho local não enviado no PC Windows; compare antes de tarefas entre máquinas.

## Em andamento

Branch `asaas-only` (não mesclada, Worker não publicado): remove Mercado Pago; Asaas único para todos os clientes. Testes 47/47. Bloqueio: `ASAAS_API_KEY`/`ASAAS_WEBHOOK_TOKEN` de produção ausentes — publicar antes disso impede clientes reais de aceitar orçamentos com valor e pagar fotos extras (503). D1 tinha só 2 cobranças Mercado Pago, ambas `rejected` (2026-10-01).

Referências: `architecture.md` (visão do sistema), `bugs.md` (defeitos), `docs/`.
