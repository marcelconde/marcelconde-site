# Galerias, seleção e pagamentos

## Comportamento

- Fotos inclusas é a quantidade já contratada. Zero significa que todas as selecionadas são cobradas pelo preço configurado em Preços. Não significa bloquear seleção.
- O admin guarda rascunhos das configurações por usuário e galeria em `sessionStorage`. Trocar de seção, navegar dentro da mesma aba e atualizar a página preserva o rascunho. Salvar ou Publicar aplica as alterações no servidor; publicar continua enviando e-mail.
- Upload mantém uma fila aditiva na página, com duas transferências simultâneas e registros ordenados. Arquivos adicionados durante o envio entram na fila. Uma falha de registro reaproveita o arquivo já enviado ao Cloudinary. A fila de arquivos não sobrevive a fechar/recarregar a página; há aviso antes de sair durante envios pendentes.
- Favoritos são salvos antes da confirmação. Alterações ainda sem resposta ficam em `localStorage`, separadas por cliente e galeria, e são reenviadas após conexão/retorno. Confirmação aguarda sincronização. Somente a confirmação ou pagamento aprovado inicia a edição.
- A galeria verifica configurações e seleção a cada 15 segundos enquanto visível e ao voltar para a aba. Não é uma conexão em tempo real.
- Ver como cliente cria uma credencial temporária de uma hora, restrita a uma galeria e somente leitura. Mostra favoritos reais, inclusive os não confirmados; alterações ainda offline no aparelho do cliente só aparecem após sincronização. O token fica no fragmento do link e é removido do endereço ao abrir. Não permite confirmar nem criar pagamentos.

## Armazenamento

O binding `GALLERY_DB` usa Cloudflare D1, tabela `gallery_records`, criada por `migrations/0001_gallery_records.sql`. Dados de galerias, clientes, índices associados e auditoria administrativa usam D1. Contas de acesso, sessões, orçamentos, conteúdo público e a associação de IDs do Mercado Pago continuam em KV.

Na primeira leitura, cada registro é importado do KV com `INSERT OR IGNORE`. Depois, D1 é a fonte oficial; o KV legado não é regravado. Exclusões deixam um marcador `null` para impedir reimportação de um valor antigo. Favoritos, índices, registros de fotos e eventos usam atualizações SQL atômicas, evitando substituir modificações concorrentes.

O Worker mantém compatibilidade sem o binding para desenvolvimento. Em produção, não remover `GALLERY_DB`: voltar ao KV depois de haver novas gravações perde a visão dos dados novos. O fallback não oferece as garantias de concorrência do D1.

### Publicação e recuperação

1. Salvar cópia do Worker, bindings e registros KV antes de publicar.
2. Criar D1, aplicar a migração e adicionar binding `GALLERY_DB` preservando todos os bindings e secrets existentes.
3. Publicar o Worker antes do JavaScript do site e verificar autenticação, leitura e gravação com dados de teste.
4. Se houver rollback, preferir corrigir o Worker mantendo D1. Antes de voltar a código que só lê KV, exportar D1 e reconciliar valores e marcadores de exclusão para KV, com gravações suspensas durante a transferência. Não basta publicar o Worker antigo.

Testes: Node 22.13 ou posterior, `node --test tests/*.cjs`. Os testes de banco executam SQL em SQLite real e simulam o binding D1.

## Desempenho

KV tem consistência eventual, cache de leitura e limite de gravações por chave. Não é adequado para substituir repetidamente um array compartilhado a cada clique. D1 resolve a consistência dos registros operacionais; leituras independentes usam paralelismo e o admin usa a resposta do salvamento sem buscar tudo outra vez.

Upload continua dependente da conexão, tamanho das fotos e Cloudinary. A compressão agora encerra na primeira versão que cabe no limite; antes podia continuar reprocessando uma foto mesmo após obter arquivo adequado. Não foi contratado aumento de limite ou plano do Cloudinary.

Referência: https://developers.cloudflare.com/kv/concepts/how-kv-works/

## Bradesco

A integração atual continua sendo Mercado Pago. Em 22/09/2026, o produto "Pix - geração de QR Code" aparecia como inscrito no Portal Bradesco Developers, mas a conta não tinha aplicação registrada nem credencial disponível. A inscrição no produto, por si só, não conclui a integração. O catálogo visível não oferecia checkout de cartão de crédito ou débito para recebimentos.

Registrar a aplicação para a API Pix, concluir os requisitos do produto, obter credenciais e certificados no portal, e homologar os ambientes de teste e produção. Para cartões, confirmar e contratar um produto de adquirência/checkout específico antes de desenhar sua integração. Portal oficial: https://developers.bradesco.com.br/

Com acesso liberado, implementar e homologar criação de cobrança, consulta de status, autenticação, validação de notificações, expiração, idempotência e conciliação de valor/identificador. Configurar certificados e secrets diretamente no ambiente apropriado, nunca em Git ou mensagens. Cobranças Mercado Pago existentes devem continuar sendo conciliadas durante a troca.

O cliente não pode marcar pagamento como aprovado. Trocar o QR por uma chave Pix estática não substitui a confirmação automática de pagamento. Recusas de risco do provedor não devem ser tratadas como aprovação ou pagamento pendente utilizável.
