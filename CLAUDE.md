# Marcel Conde — guia do projeto

Este repositório contém o site de fotografia de Marcel Conde. Antes de alterar um fluxo, leia o código responsável e os registros em [`.claude/memory/`](.claude/memory/). Eles são um ponto de partida; confirme informações que possam ter mudado no GitHub e nos serviços de produção.

## Onde trabalhar

- Frontend: HTML, CSS e JavaScript nativos na raiz, em `admin/` e em `clientes/`. Não há framework ou etapa de build.
- API e regras de negócio: `worker.js`, um Cloudflare Worker configurado por `wrangler.jsonc`.
- Dados: Cloudflare D1 (`GALLERY_DB`) para galerias e clientes; KV (`LIKES_KV`) ainda atende sessões, orçamentos e outros registros. A migração inicial está em `migrations/0001_gallery_records.sql`.
- Referências de funcionamento: [`docs/gallery-workflow.md`](docs/gallery-workflow.md) e [`docs/asaas-payments.md`](docs/asaas-payments.md).
- Testes: `node --test tests/*.cjs` com Node 22.13 ou superior.

## Invariantes importantes

- `selectionLimit: 0` significa que nenhuma foto está inclusa no pacote e todas as selecionadas são cobradas; não significa impedir seleção.
- A seleção salva do cliente é a fonte para preços, pagamentos e exportação. Enquanto uma cobrança está pendente, não altere fotos ou preços ligados àquela cobrança.
- Clientes de teste usam Asaas Sandbox. Não misture cobranças Sandbox e de produção, nem reutilize cadastros de outras integrações da mesma conta Asaas.
- Não remova o binding D1 nem volte a ler apenas KV: isso ocultaria dados gravados depois da migração.
- Mantenha autorização por cliente/galeria, autenticação de admin e validação do estado do provedor em qualquer novo fluxo de pagamento.
- Não registre secrets, tokens, CPF/CNPJ de clientes, arquivos RAW ou caminhos locais privados no Git. Preserve `.claude/settings.local.json` e `.claude/worktrees/`.

## Publicação

O site estático sai da `main` pelo GitHub Pages em `https://marcelconde.com.br`. A API é o Worker `cloudinary` em `https://api.marcelconde.com.br`. Em uma mudança que envolva ambos, publique e verifique os arquivos estáticos antes de atualizar o Worker; preserve bindings e secrets. Testes simulados não comprovam pagamento ou webhook real.

Atualize os arquivos de memória somente com fatos verificados. Use `current-state.md` para situação atual, `decisions.md` para decisões duradouras, `bugs.md` para defeitos reproduzíveis e `summaries/session-latest.md` para a passagem da última sessão.
