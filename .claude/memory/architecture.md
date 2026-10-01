# Arquitetura

Última revisão: 2026-10-01, `main` em `8cbf660`. Confira o código antes de usar este documento como estado atual.

## Superfícies

| Área | Arquivos principais | Responsabilidade |
| --- | --- | --- |
| Site público | `index.html`, `categoria.html`, `encontre/`, `contato/`, `theme.js` | Apresentação, portfólio, álbuns públicos e contato |
| Admin | `admin/` | Login, clientes, orçamentos, galerias, publicação e auditoria |
| Área do cliente | `clientes/login/`, `clientes/dashboard/`, `clientes/orcamento/`, `clientes/galeria/` | Acesso a orçamentos, contratos, seleção e entrega de fotos |
| API | `worker.js` | Autorização, regras de negócio, integrações, webhooks, e-mails e PDFs |
| Infraestrutura | `wrangler.jsonc`, `migrations/0001_gallery_records.sql` | Bindings do Worker e tabela D1 |

O frontend usa HTML, CSS e JavaScript nativos, sem `package.json` ou build. O GitHub Pages serve a raiz da branch `main` em `marcelconde.com.br`. O Worker Cloudflare `cloudinary` atende `api.marcelconde.com.br`. Fontes Inter e Cormorant Garamond vêm do Google Fonts; há Google Analytics/gtag, `robots.txt` e `sitemap.xml`. O tema padrão é escuro; `theme.js` guarda a escolha da sessão em `sessionStorage`.

## Dados e imagens

- `GALLERY_DB` é Cloudflare D1. A tabela `gallery_records` guarda documentos JSON por chave para galerias privadas, clientes, imagens, seleção, eventos, índices e auditoria administrativa. Na primeira leitura, registros legados são importados do KV com `INSERT OR IGNORE`; depois, D1 é a fonte oficial. Exclusões deixam um valor `null` para evitar reimportação.
- `LIKES_KV` ainda atende contas e sessões, orçamentos, conteúdo público, curtidas e associações de pagamentos. O Worker contém fallback para desenvolvimento sem D1, sem as garantias de concorrência da produção.
- Cloudinary hospeda álbuns públicos (`portfolio/...`, `site/...`) e fotos privadas (`clientes/<slug>/selecao` e `clientes/<slug>/finais`). O Worker assina uploads; o navegador envia diretamente ao Cloudinary e registra a imagem pela API. O registro guarda `public_id`, URL, `filename`, fase e metadados. `filename` recebe o nome do arquivo enviado, mesmo quando a cópia para a web foi convertida/comprimida.
- O upload administrativo mantém fila aditiva, duas transferências simultâneas e reaproveitamento de um arquivo já enviado se falhar só o registro. A fila não persiste após fechar/recarregar a página.

## Fluxos de negócio

- Admin e clientes têm autenticação e sessões separadas. Convites e recuperação de senha chegam por e-mail. A API restringe cada cliente aos seus próprios orçamentos e galerias; há funções administrativas e trilha de auditoria.
- Orçamentos são criados e publicados pelo admin, com itens, descontos, cláusulas, prazo e percentual de reserva. O cliente pode aceitar e, quando o pagamento está habilitado para ele, escolher entrada ou valor integral. O Worker gera PDF e envia e-mails via Resend.
- A galeria passa por `selection`, `editing` e `final`. O cliente marca fotos; favoritos são salvos no servidor, enquanto mudanças ainda não sincronizadas ficam no `localStorage`. A página verifica atualizações periodicamente, sem conexão em tempo real. `selectionLimit: 0` cobra todas as fotos escolhidas.
- O admin pode filtrar fotos escolhidas, consultar seleção/histórico e exportar CSV por `GET /private/gallery/export-selected?id=...`. `GET /private/gallery?id=...` retorna galeria, imagens, seleção e eventos. A prévia “Ver como cliente” usa token temporário de uma galeria, somente leitura.
- O Asaas usa checkout hospedado, ambientes Sandbox e produção separados e webhooks próprios. Clientes de teste usam Sandbox; sem chave Asaas de produção, clientes reais continuam no fluxo Mercado Pago para Pix de fotos extras. Cobranças antigas do Mercado Pago continuam conciliáveis. O site não recebe dados de cartão.
- Uma cobrança pendente de fotos extras bloqueia alterações na seleção. Cliente e admin podem cancelar a cobrança específica após verificação no provedor; as fotos marcadas permanecem, e uma nova cobrança pode ser gerada. Pagamento confirmado requer estorno separado.

## Serviços externos e limites

Resend envia e-mails. Fotto, Fotop e Banlek aparecem como plataformas externas na página “Encontre suas fotos”; seus dados não são a base de galerias privadas do site. A API Pix do Bradesco não está integrada. Não há implementação de NFSe nem de Lightroom Classic na `main` desta revisão.

O clone Git não contém dados D1/KV de produção, conteúdo remoto do Cloudinary, secrets do Worker, cadastros dos provedores ou originais RAW do computador. Consulte [`docs/gallery-workflow.md`](../../docs/gallery-workflow.md) e [`docs/asaas-payments.md`](../../docs/asaas-payments.md) para implantação e recuperação.
