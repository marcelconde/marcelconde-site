# Galerias, seleção e pagamentos

## Comportamento

- Fotos inclusas é a quantidade já contratada. Zero significa que todas as selecionadas são cobradas pelo preço configurado em Preços. Não significa bloquear seleção.
- O admin guarda rascunhos das configurações por usuário e galeria em `sessionStorage`. Trocar de seção, navegar dentro da mesma aba e atualizar a página preserva o rascunho. Salvar ou Publicar aplica as alterações no servidor; publicar continua enviando e-mail.
- Upload mantém uma fila aditiva na página, com duas transferências simultâneas e registros ordenados. Arquivos adicionados durante o envio entram na fila. Uma falha de registro reaproveita o arquivo já enviado ao Cloudinary. A fila de arquivos não sobrevive a fechar/recarregar a página; há aviso antes de sair durante envios pendentes.
- Favoritos são salvos antes da confirmação. Alterações ainda sem resposta ficam em `localStorage`, separadas por cliente e galeria, e são reenviadas após conexão/retorno. Confirmação aguarda sincronização. Somente a confirmação ou pagamento aprovado inicia a edição.
- A galeria verifica configurações e seleção a cada 15 segundos enquanto visível e ao voltar para a aba. Não é uma conexão em tempo real.
- Ver como cliente cria uma credencial temporária de uma hora, restrita a uma galeria e somente leitura. Mostra favoritos reais, inclusive os não confirmados; alterações ainda offline no aparelho do cliente só aparecem após sincronização. O token fica no fragmento do link e é removido do endereço ao abrir. Não permite confirmar nem criar pagamentos.

## Armazenamento

O binding `GALLERY_DB` usa Cloudflare D1, tabela `gallery_records`, criada por `migrations/0001_gallery_records.sql`. Dados de galerias, clientes, índices associados e auditoria administrativa usam D1. Contas de acesso, sessões, orçamentos, conteúdo público e associações de IDs dos provedores de pagamento continuam em KV. A trava de criação e conciliação de cobranças Asaas usa D1.

Na primeira leitura, cada registro é importado do KV com `INSERT OR IGNORE`. Depois, D1 é a fonte oficial; o KV legado não é regravado. Exclusões deixam um marcador `null` para impedir reimportação de um valor antigo. Favoritos, índices, registros de fotos e eventos usam atualizações SQL atômicas, evitando substituir modificações concorrentes.

O Worker mantém compatibilidade sem o binding para desenvolvimento. Em produção, não remover `GALLERY_DB`: voltar ao KV depois de haver novas gravações perde a visão dos dados novos. O fallback não oferece as garantias de concorrência do D1.

### Publicação e recuperação

1. Salvar cópia do Worker, bindings e registros KV antes de publicar.
2. Criar D1, aplicar a migração e adicionar binding `GALLERY_DB` preservando todos os bindings e secrets existentes.
3. Publicar os arquivos estáticos compatíveis antes do Worker e verificar autenticação, leitura e gravação com dados de teste. Para a troca de provedor, seguir `docs/asaas-payments.md`.
4. Se houver rollback, preferir corrigir o Worker mantendo D1. Antes de voltar a código que só lê KV, exportar D1 e reconciliar valores e marcadores de exclusão para KV, com gravações suspensas durante a transferência. Não basta publicar o Worker antigo.

Testes: Node 22.13 ou posterior, `node --test tests/*.cjs`. Os testes de banco executam SQL em SQLite real e simulam o binding D1.

## Desempenho

KV tem consistência eventual, cache de leitura e limite de gravações por chave. Não é adequado para substituir repetidamente um array compartilhado a cada clique. D1 resolve a consistência dos registros operacionais; leituras independentes usam paralelismo e o admin usa a resposta do salvamento sem buscar tudo outra vez.

Upload continua dependente da conexão, tamanho das fotos e Cloudinary. A compressão agora encerra na primeira versão que cabe no limite; antes podia continuar reprocessando uma foto mesmo após obter arquivo adequado. Não foi contratado aumento de limite ou plano do Cloudinary.

Referência: https://developers.cloudflare.com/kv/concepts/how-kv-works/

## Pagamentos

Novas cobranças usam Asaas, separando produção para clientes reais e Sandbox para clientes de teste. O checkout hospedado mostra os meios habilitados na conta; a API de cobrança permite Pix, boleto e cartão de crédito, mas não oferece débito nesse fluxo. Cobranças antigas do Mercado Pago continuam conciliáveis. Implantação, secrets e validação: `docs/asaas-payments.md`.

Cobranças pendentes de fotos extras podem ser canceladas na galeria pelo cliente ou na seção Seleção do admin. O cancelamento confirma o estado com o provedor, encerra apenas a cobrança escolhida e preserva as fotos marcadas; o cliente pode retirar algumas e gerar uma nova cobrança. Pagamentos aprovados não usam esse fluxo.

A API Pix do Bradesco foi apenas inscrita no portal; não foi integrada ao site. Ela não oferece o checkout de cartão solicitado.
