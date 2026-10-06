# Marcel Conde — guia do projeto

Este repositório contém o site de fotografia de Marcel Conde. Antes de alterar um fluxo, leia o código responsável e `current-state.md` e `pending.md` em [`.claude/memory/`](.claude/memory/). Eles são um ponto de partida; confirme informações que possam ter mudado no GitHub e nos serviços de produção.

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
- Tudo que for do site ou da empresa usa `contato@marcelconde.com.br` (cadastros, integrações, avisos, remetentes); não use e-mails pessoais de Marcel.
- Não registre secrets, tokens, CPF/CNPJ de clientes, arquivos RAW ou caminhos locais privados no Git. Preserve `.claude/settings.local.json` e `.claude/worktrees/`.

## Publicação

O site estático sai da `main` pelo GitHub Pages em `https://marcelconde.com.br`. A API é o Worker `cloudinary` em `https://api.marcelconde.com.br`. Em uma mudança que envolva ambos, publique e verifique os arquivos estáticos antes de atualizar o Worker; preserve bindings e secrets. Testes simulados não comprovam pagamento ou webhook real.

## Sincronização Mac ↔ Windows

Marcel trabalha neste repositório em um Mac e em um PC Windows. O GitHub (`main`) é a única fonte de verdade.

- Antes de cada tarefa: `git fetch`, `git status` e `git pull --ff-only`. Se houver divergência ou alterações locais inesperadas, resolva antes de editar.
- Depois de cada tarefa que altere código, documentação ou memória: atualize `.claude/memory/` com fatos verificados, faça commit e `git push` na `main`, e confirme que `git status` está limpo e o commit local é igual ao `origin/main`.
- Nunca encerre com trabalho sem push. Não versione secrets, `.DS_Store` novos ou `.claude/settings.local.json`.

## Memória persistente (`.claude/memory/`)

Fonte de contexto entre sessões; não dependa do histórico da conversa.

- Início de sessão: leia `current-state.md` e `pending.md`. Consulte `decisions.md`, `architecture.md` e `bugs.md` só quando relevantes.
- `current-state.md`: estado atual, o que funciona, trabalho em andamento e o necessário para continuar. Atualize ao concluir mudança importante.
- `pending.md`: tarefas adiadas e o que Marcel pedir para lembrar ("depois fazemos", "me lembre", "deixa para depois"…) — registre automaticamente; remova quando resolvido.
- `decisions.md`: decisões arquiteturais duradouras e o motivo; nada trivial.
- `architecture.md`: visão do sistema. `bugs.md`: defeitos reproduzíveis.
- Ao concluir uma tarefa, consulte `pending.md` e mencione brevemente pendências relevantes.
- Registre só fatos verificados e úteis no futuro; consolide e remova o obsoleto para manter os arquivos pequenos.

## Estilo de trabalho

- Respostas extremamente diretas e curtas; sem repetir a pergunta, explicar o básico, narrar planos ou mostrar raciocínio. Explicação longa só se Marcel pedir.
- Desenvolvimento com profundidade: analisar antes de mudar, considerar segurança, desempenho, UX e efeitos colaterais, preservar a arquitetura existente, sem complexidade desnecessária nem mudanças não relacionadas. Entregar resultado profissional, não só o mínimo.
- Executar, testar e validar antes de concluir; revisar o próprio trabalho.
- Economia de contexto: ler só os arquivos e trechos necessários; filtrar saídas grandes (grep/head/tail); não exibir arquivos inteiros, diffs completos ou logs extensos.
- Resposta final de tarefa: o que foi feito, arquivos relevantes, testes/validações, pendências importantes.
- Perguntas simples: esforço baixo. Tarefas complexas: sugerir esforço Max/Ultracode se a sessão estiver em nível menor.
