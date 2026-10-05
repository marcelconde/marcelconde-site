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

- 2026-10-05 `50e9c0b` (Worker 1afa062f): Worker roda em `aws:us-east-1` (placement, header `cf-placement: remote-IAD`) — D1 ~15 ms por consulta vs ~140 ms do Brasil. Upload de galeria: até 25 MP e ~9,9 MB com maior qualidade possível; 3 envios simultâneos; portfólio também 3 simultâneos. Falta Marcel confirmar a melhora no uso real.

- 2026-10-04 `6d5478a` (Worker publicado, versão 064770b8): exclusão de fotos da galeria em lotes pela Admin API do Cloudinary (antes, 1 por vez estourava o limite de 50 subrequests do plano Free e deixava registros órfãos). Galeria `gal_OFvN_CL1W9R7` tinha 50 fotos não selecionadas já apagadas no Cloudinary; nova tentativa de "Remover não selecionadas" deve limpar (not_found conta como removida). Ainda não validado contra o Cloudinary real.
- 2026-10-04 `954ccf1` (Worker versão 016c0a4a): seção "Fotos editadas" + rota `/private/gallery/complete-delivery`. Testado com simulação e tela local; ainda não usado numa galeria real.

- `main` `2b193a9`: máscara CPF/CNPJ (`document-mask.js`) na galeria, orçamento e admin de clientes; publicada.

Branch `asaas-only` (não mesclada, Worker não publicado): remove Mercado Pago; Asaas único para todos os clientes. Testes 47/47. Secrets e webhook prontos, mas **Asaas produção recusa a chave com `403 IP não autorizado`** (3 tentativas rejeitadas em 2026-10-02, nenhuma cobrança criada). Whitelist da conta está vazia; egress do Worker é IP BR e chave inválida recebe 401 normal. **Confirmado em 2026-10-02:** chave válida também recebe `403 not_allowed_ip` do Mac (IP residencial BR, Algar) → restrição de IP da conta, não da Cloudflare; provavelmente herdada da conta-pai Fotop (validação de saque aponta para fotop.com.br). Não há como contornar no código. `ASAAS_API_KEY` no Worker hoje contém valor inválido (colado errado); regravar quando a conta for liberada. Uma chave de produção ficou exposta no terminal e deve ser excluída no Asaas. Enquanto isso clientes reais não conseguem pagar. Não mesclar `asaas-only` até resolver. D1 tinha só 2 cobranças Mercado Pago, ambas `rejected` (2026-10-01).

Referências: `architecture.md` (visão do sistema), `bugs.md` (defeitos), `docs/`.
