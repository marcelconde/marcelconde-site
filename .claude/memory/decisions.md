# Decisões de arquitetura e produto

Última revisão: 2026-10-01. Registre aqui decisões duradouras; mudanças de estado pertencem a `current-state.md`.

1. **Frontend estático e Worker separado.** HTML/CSS/JS são servidos pelo GitHub Pages; a API e integrações ficam em `worker.js` na Cloudflare. Em mudanças nos dois lados, o frontend compatível é publicado primeiro.
2. **D1 é a fonte oficial dos registros operacionais de galerias.** KV tinha consistência eventual e gravações concorrentes de arrays; a migração importa registros antigos uma vez e usa atualizações SQL atômicas. O fallback KV existe para desenvolvimento, não para rollback direto de produção.
3. **Seleção persistente antes da confirmação.** Favoritos salvos no servidor sobrevivem a recarga; alterações ainda offline ficam temporariamente no navegador. Só confirmação ou pagamento aprovado inicia edição.
4. **Zero fotos inclusas significa compra de toda a seleção.** O preço vem das configurações da galeria; zero não desabilita escolha de fotos.
5. **Cobranças de teste isoladas.** Clientes explicitamente marcados como teste usam Asaas Sandbox. O tipo não muda depois da criação, para não misturar histórico financeiro de ambientes.
6. **Provedor confirma dinheiro.** O Worker verifica referência, valor, ambiente e estado no Asaas/Mercado Pago antes de concluir fluxo ou cancelar cobrança. Cobrança aprovada não é cancelada pelo botão de pendência; estorno é outro processo.
7. **Originais ficam fora do site.** Cloudinary guarda as cópias do site; eventual integração Lightroom Classic deve localizar os originais no Windows, sem presumir que o Worker ou o navegador acessam esse disco. Já existe exportação CSV autenticada da seleção.
8. **Secrets fora do Git.** `wrangler.jsonc` guarda bindings e variável pública; chaves de Cloudinary, pagamentos e Resend pertencem aos secrets do Worker.
9. **Asaas é o único intermediador (2026-10-01).** Mercado Pago removido do código para simplificar e unificar o fluxo; sem chave do ambiente o pagamento falha fechado (503), sem fallback.
10. **Entrega de editadas substitui a seleção (2026-10-04).** Fotos editadas sobem como fase `final`; "Concluir entrega" (com confirmação, nunca automático) apaga todos os originais da seleção para liberar espaço no Cloudinary. Os nomes escolhidos ficam em `gallery.deliveredSelection`.
