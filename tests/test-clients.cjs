const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

function app() {
  const data = new Map();
  const kv = {
    async get(key, type) { const value = data.get(key); return value == null ? null : type === 'json' ? JSON.parse(value) : value; },
    async put(key, value) { data.set(key, value); },
    async delete(key) { data.delete(key); },
  };
  const context = vm.createContext({ crypto: webcrypto, Request, Response, Headers, URL, TextEncoder, TextDecoder, btoa, atob, console, setTimeout, clearTimeout, fetch: () => { throw Error('Unexpected external request'); } });
  const source = fs.readFileSync(require.resolve('../worker.js'), 'utf8').replace('export default {', 'globalThis.worker = {');
  vm.runInContext(source + '\nglobalThis.helpers = {savePrivateClient, savePrivateQuote, deletePrivateQuote, deletePrivateClient, publicQuote, buildQuotePdf};', context);
  const env = { LIKES_KV: kv, ADMIN_KEY: 'local-test-key' };
  const seed = (key, value) => data.set(key, JSON.stringify(value));
  const read = key => JSON.parse(data.get(key) || 'null');
  const request = (path, body, token = 'local-test-key') => context.worker.fetch(new Request('https://example.test' + path, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env, {});
  return { ...context.helpers, env, data, seed, read, request };
}

test('test type is explicit, boolean and immutable; API requires authentication', async () => {
  const a = app();
  assert.equal((await a.request('/private/clients', { name: 'Denied', isTest: true }, 'invalid')).status, 401);
  const real = await a.savePrivateClient(a.env, { name: 'Real' });
  const demo = await a.savePrivateClient(a.env, { name: 'Demo', isTest: true });
  assert.equal(real.isTest, false); assert.equal(demo.isTest, true);
  assert.equal((await a.request('/private/clients', { id: real.id, isTest: true })).status, 409);
  assert.equal((await a.request('/private/clients', { name: 'Bad', isTest: 'true' })).status, 400);
  await assert.rejects(a.savePrivateClient(a.env, { id: demo.id, isTest: false }), e => e.status === 409);
  assert.equal((await a.savePrivateClient(a.env, { id: demo.id, name: 'Changed' })).isTest, true);
});

test('real accepted contracts cannot be changed, deleted or transferred to test clients', async () => {
  const a = app();
  const real = await a.savePrivateClient(a.env, { name: 'Real' });
  const demo = await a.savePrivateClient(a.env, { name: 'Demo', isTest: true });
  const quote = await a.savePrivateQuote(a.env, { clientId: real.id, isTest: true });
  assert.equal(quote.isTest, false);
  a.seed('private_quote:' + quote.id, { ...quote, status: 'accepted' });
  for (const payload of [{ id: quote.id, title: 'Changed' }, { id: quote.id, clientId: demo.id, isTest: true }]) {
    assert.equal((await a.request('/private/quotes', payload)).status, 409);
  }
  assert.equal((await a.request('/private/quote/delete', { quoteId: quote.id, isTest: true })).status, 409);
  assert.equal((await a.request('/private/quote/publish', { quoteId: quote.id })).status, 409);
  assert.equal((await a.request('/private/client/delete', { clientId: real.id })).status, 409);
  assert.equal(a.read('private_quote:' + quote.id).status, 'accepted');
});

test('test quote inherits type, resets acceptance on edit and can be deleted after acceptance', async () => {
  const a = app();
  const client = await a.savePrivateClient(a.env, { name: 'Demo', isTest: true });
  const quote = await a.savePrivateQuote(a.env, { clientId: client.id });
  assert.equal(a.publicQuote(quote).isTest, true);
  const accepted = { ...quote, status: 'accepted', acceptance: { name: 'Test' }, acceptedAt: '2026-09-15', publishedSnapshot: {}, publishedHash: 'old', acceptanceEmails: {} };
  a.seed('private_quote:' + quote.id, accepted);
  const res = await a.request('/private/quotes', { id: quote.id, title: 'Edited test' });
  assert.equal(res.status, 200);
  const updated = a.read('private_quote:' + quote.id);
  assert.equal(updated.status, 'draft');
  for (const key of ['acceptance', 'acceptedAt', 'publishedSnapshot', 'publishedHash', 'acceptanceEmails']) assert.equal(updated[key], null);
  a.seed('private_quote:' + quote.id, accepted);
  assert.equal((await a.request('/private/quote/delete', { quoteId: quote.id })).status, 200);
  assert.equal(a.read('private_quote:' + quote.id), null);
  assert(!a.read('private_quotes_index').includes(quote.id));
});

test('cleanup deletes only test client and its quotes, preserving galleries, photos and shared access', async () => {
  const a = app();
  const real = await a.savePrivateClient(a.env, { name: 'Real', email: 'shared@example.test' });
  const demo = await a.savePrivateClient(a.env, { name: 'Demo', email: 'shared@example.test', isTest: true });
  const realQuote = await a.savePrivateQuote(a.env, { clientId: real.id });
  const demoQuote = await a.savePrivateQuote(a.env, { clientId: demo.id });
  a.seed('private_quote:' + demoQuote.id, { ...demoQuote, status: 'accepted' });
  a.seed('private_galleries_index', ['test-gallery', 'real-gallery']);
  a.seed('private_gallery:test-gallery', { id: 'test-gallery', clientId: demo.id, status: 'final' });
  a.seed('private_gallery:real-gallery', { id: 'real-gallery', clientId: real.id, status: 'final' });
  a.seed('private_gallery_images:test-gallery', [{ public_id: 'preserved-photo' }]);
  a.seed('client_user:shared@example.test', { passwordHash: 'preserved' });
  assert.equal((await a.request('/private/client/delete', { clientId: demo.id, confirmName: 'wrong' })).status, 400);
  assert(a.read('private_quote:' + demoQuote.id));
  assert.equal((await a.request('/private/client/delete', { clientId: demo.id, confirmName: 'Demo' })).status, 200);
  assert.equal(a.read('private_client:' + demo.id), null);
  assert.equal(a.read('private_quote:' + demoQuote.id), null);
  assert(a.read('private_quote:' + realQuote.id));
  assert.equal(a.read('private_gallery:test-gallery').clientId, '');
  assert.equal(a.read('private_gallery:real-gallery').clientId, real.id);
  assert.equal(a.read('private_gallery_images:test-gallery')[0].public_id, 'preserved-photo');
  assert(a.read('client_user:shared@example.test'));
});

test('cleanup refuses inconsistent real quotes and reports storage failures', async () => {
  const a = app();
  const demo = await a.savePrivateClient(a.env, { name: 'Demo', isTest: true });
  a.seed('private_quotes_index', ['legacy']);
  a.seed('private_quote:legacy', { id: 'legacy', clientId: demo.id, status: 'accepted' });
  assert.equal((await a.request('/private/client/delete', { clientId: demo.id, confirmName: 'Demo' })).status, 409);
  a.seed('private_quotes_index', []);
  a.env.LIKES_KV.delete = async () => { throw Error('Storage unavailable'); };
  assert.equal((await a.request('/private/client/delete', { clientId: demo.id, confirmName: 'Demo' })).status, 500);
  assert(a.read('private_client:' + demo.id));
  assert(a.read('private_clients_index').includes(demo.id));
});


test('test PDF is clearly marked, while regular documents are unchanged', async () => {
  const a = app();
  const client = await a.savePrivateClient(a.env, { name: 'Demo', isTest: true });
  const quote = await a.savePrivateQuote(a.env, { clientId: client.id });
  const pdf = Buffer.from(a.buildQuotePdf(a.env, quote, client)).toString('latin1');
  assert(pdf.startsWith('%PDF-1.4'));
  assert(pdf.includes('DOCUMENTO DE TESTE - SEM VALIDADE CONTRATUAL'));
  assert(pdf.includes('TESTE | '));
  assert(!Buffer.from(a.buildQuotePdf(a.env, { ...quote, isTest: false }, client)).toString('latin1').includes('DOCUMENTO DE TESTE'));
});

test('quote reservation percentage is explicit, calculated after discount and absent on legacy quotes', async () => {
  const a = app();
  const client = await a.savePrivateClient(a.env, { name: 'Client' });
  const quote = await a.savePrivateQuote(a.env, {
    clientId: client.id,
    items: [{ description: 'Ensaio', quantity: 1, unitPriceCents: 30000 }],
    reservePercent: 30,
  });
  assert.equal(a.publicQuote(quote).reserveAmountCents, 9000);
  assert(Buffer.from(a.buildQuotePdf(a.env, quote, client)).toString('latin1').includes('Reserva mínima: 30%'));
  await a.savePrivateQuote(a.env, { id: quote.id, discountType: 'fixed', discountValue: 10000 });
  assert.equal(a.publicQuote(a.read('private_quote:' + quote.id)).reserveAmountCents, 6000);
  await a.savePrivateQuote(a.env, { id: quote.id, reservePercent: null });
  assert.equal(a.publicQuote(a.read('private_quote:' + quote.id)).reserveAmountCents, null);
  assert.equal(a.publicQuote({ items: quote.items }).reservePercent, null);
  assert.equal((await a.request('/private/quotes', { id: quote.id, reservePercent: 101 })).status, 400);
});
