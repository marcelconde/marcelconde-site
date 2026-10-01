# Estado atual

Verificado em 2026-10-01 no checkout local e na `main` remota: `8cbf660` (`Allow cancelling pending gallery charges`). O working tree estava limpo antes da criação desta memória. Reconfirme após novos commits ou alterações feitas no PC Windows.

## Disponível no código

- Site e admin publicados pelo GitHub Pages; API Cloudflare Worker `cloudinary` com bindings `LIKES_KV` e `GALLERY_DB`.
- Cadastro de clientes reais/de teste, orçamentos e contratos em PDF, galerias privadas com upload Cloudinary, seleção persistente, histórico, filtros de fotos e entrega final.
- Busca de galeria por nome/ID, prévia administrativa somente leitura e CSV das fotos escolhidas.
- Asaas Sandbox para clientes de teste, com chaves/webhook separados; Mercado Pago permanece no código para clientes reais sem Asaas de produção e para cobranças anteriores. Cancelamento de cobrança pendente de fotos extras disponível ao cliente e no admin.
- Testes em `tests/*.cjs`; comando `node --test tests/*.cjs` (Node 22.13+). O último conjunto relatado para `8cbf660` passou com 48 testes, mas rode de novo depois de mudanças.

## Estado externo a conferir

- Em 2026-10-01, a lista de nomes de secrets do Worker incluía `ASAAS_SANDBOX_API_KEY` e `ASAAS_SANDBOX_WEBHOOK_TOKEN`, mas não `ASAAS_API_KEY` nem `ASAAS_WEBHOOK_TOKEN`. Isso mostra que o checkout Asaas de produção ainda não estava configurado naquele momento; não comprova o estado cadastral atual da conta PJ.
- A integração Asaas não tinha confirmação registrada de validação financeira completa de ponta a ponta. Testes locais simulam provedores; confira checkout, webhook, saldo e taxas no ambiente correspondente.
- Trabalhos locais no outro computador podem existir sem push. Compare branch, commits e arquivos antes de começar uma tarefa cruzada entre máquinas.

## Ainda não implementado nesta `main`

- Envio das fotos selecionadas para uma coleção do Lightroom Classic no Windows.
- Emissão automática de NFSe.
- API Pix do Bradesco.

Leia [`docs/gallery-workflow.md`](../../docs/gallery-workflow.md) e [`docs/asaas-payments.md`](../../docs/asaas-payments.md) antes de mexer em armazenamento ou cobrança.
