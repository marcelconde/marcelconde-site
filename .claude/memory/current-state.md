# Estado atual

Verificado em 2026-10-01: `main` = `origin/main` após `6e4d9f0` (memória/CLAUDE.md); último código de aplicação em `8cbf660` (cancelamento de cobranças pendentes). Reconfirme após novos commits ou trabalho feito no Windows.

## Funcionando (no código)

- Site/admin via GitHub Pages; API Worker `cloudinary` com `LIKES_KV` e `GALLERY_DB` (D1). `/health` e `/albums` respondendo.
- Clientes reais/de teste, orçamentos e PDFs, galerias privadas com upload Cloudinary, seleção persistente, histórico, filtros, entrega final, busca, "Ver como cliente" e CSV da seleção.
- Asaas Sandbox para clientes de teste; Mercado Pago para clientes reais sem Asaas de produção e cobranças antigas. Cancelamento de cobrança pendente (cliente e admin).
- Testes: `node --test tests/*.cjs` — 48/48 passando em 2026-10-01 (Node local v26.8.1).

## Estado externo

- 2026-10-01: `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` gravados no Worker; webhook de produção "marcelconde.com.br - site" criado no Asaas (v3, não sequencial, eventos de cobrança). Worker no ar (código `8cbf660`) já usa Asaas produção para clientes reais. Chave ainda não validada por cobrança real.
- Sem validação financeira real de ponta a ponta registrada.
- Pode haver trabalho local não enviado no PC Windows; compare antes de tarefas entre máquinas.

## Em andamento

- `main` `2b193a9`: máscara CPF/CNPJ (`document-mask.js`) na galeria, orçamento e admin de clientes; publicada.

Branch `asaas-only` (não mesclada, Worker não publicado): remove Mercado Pago; Asaas único para todos os clientes. Testes 47/47. Secrets e webhook prontos, mas **Asaas produção recusa a chave com `403 IP não autorizado`** (3 tentativas rejeitadas em 2026-10-02, nenhuma cobrança criada). Whitelist da conta está vazia; egress do Worker é IP BR e chave inválida recebe 401 normal. Hipótese: conta é subconta/integrada à Fotop (validação de saque aponta para fotop.com.br) e herda whitelist da conta-pai, ou a chave é de outra conta. Enquanto isso clientes reais não conseguem pagar. Não mesclar `asaas-only` até resolver. D1 tinha só 2 cobranças Mercado Pago, ambas `rejected` (2026-10-01).

Referências: `architecture.md` (visão do sistema), `bugs.md` (defeitos), `docs/`.
