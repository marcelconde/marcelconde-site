const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

function app() {
  const data = new Map();
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(require.resolve('../migrations/0001_gallery_records.sql'), 'utf8'));
  const database = { prepare(sql) {
    const stmt = sqlite.prepare(sql);
    let args = [];
    return { bind(...values) { args = values; return this; },
      async first() { return stmt.get(...args) || null; },
      async run() { return stmt.run(...args); } };
  }};
  const kv = {
    async get(key, type) { const value = data.get(key); return value == null ? null : type === 'json' ? JSON.parse(value) : value; },
    async put(key, value) { data.set(key, value); }, async delete(key) { data.delete(key); },
  };
  const tasks = [];
  const context = vm.createContext({ crypto: webcrypto, Request, Response, Headers, URL, URLSearchParams, AbortController, TextEncoder, TextDecoder, btoa, atob, console, setTimeout, clearTimeout, fetch: () => { throw Error('Unexpected external request'); } });
  const source = fs.readFileSync(require.resolve('../worker.js'), 'utf8').replace('export default {', 'globalThis.worker = {');
  vm.runInContext(source + '\nglobalThis.helpers = {readKvJson, writeKvJson, deleteGalleryRecord, savePrivateGallery, changeGalleryFavorites, calculateSelectionPricing, claimAsaasIntent, saveClientPassword, saveUserPassword};', context);
  const env = { LIKES_KV: kv, GALLERY_DB: database, ADMIN_KEY: 'local-test-key' };
  const seed = (key, value) => data.set(key, JSON.stringify(value));
  const request = (path, body, token = 'local-test-key') => context.worker.fetch(new Request('https://example.test' + path, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : {body: JSON.stringify(body)}) }), env, {waitUntil(p) { tasks.push(p); }});
  seed('private_gallery:g', {id:'g', slug:'race', clientId:'c', title:'Race', selectionLimit:15, extraPhotoPriceCents:1000, status:'selection'});
  seed('private_gallery_slug:race','g');
  seed('private_client:c', {id:'c', name:'Client', email:'client@example.test'});
  seed('private_gallery_images:g', ['a','b','c'].map(public_id => ({public_id, phase:'selection', url:'https://example.test/'+public_id})));
  seed('private_gallery_selection:g', ['a']);
  seed('client_session:client-token', { email:'client@example.test', expiresAt:Date.now()+100000 });
  return { ...context.helpers, env, seed, data, request, tasks, context, sqlite };
}

test('D1 imports once, keeps fresh writes despite stale KV, and tombstones prevent resurrection', async () => {
  const a = app();
  assert.equal((await a.readKvJson(a.env,'private_gallery:g',null)).selectionLimit,15);
  await a.savePrivateGallery(a.env, {id:'g',selectionLimit:0,subtitle:'',message:''});
  assert.equal((await a.readKvJson(a.env,'private_gallery:g',null)).selectionLimit,0);
  assert.equal(JSON.parse(a.data.get('private_gallery:g')).selectionLimit,15);
  await a.deleteGalleryRecord(a.env,'private_gallery:g');
  a.seed('private_gallery:g',{id:'g',selectionLimit:15});
  assert.equal(await a.readKvJson(a.env,'private_gallery:g',null),null);
});

test('zero means all photos priced; reopening and changing quota preserve favorites', async () => {
  const a = app();
  await a.writeKvJson(a.env,'private_gallery:g',{id:'g',slug:'race',status:'editing',selectionLimit:15,selectionCompletedAt:'2026-09-01',extraPhotoPriceCents:1000});
  const gallery = await a.savePrivateGallery(a.env,{id:'g',status:'selection',selectionLimit:0});
  assert.equal(gallery.selectionLimit,0);
  assert.deepEqual(Array.from(await a.readKvJson(a.env,'private_gallery_selection:g',[])),['a']);
  const price = a.calculateSelectionPricing(gallery,[{public_id:'a'},{public_id:'b'}],['a','b']);
  assert.equal(price.totalCents,2000); assert.equal(price.requiresPayment,true);
  assert.equal((await a.savePrivateGallery(a.env,{title:'New'})).selectionLimit,0);
});

test('concurrent favorites from two devices preserve both changes and validate ownership', async () => {
  const a = app();
  const results = await Promise.all([
    a.request('/client-gallery/favorites',{slug:'race',changes:[{publicId:'b',selected:true}]},'client-token'),
    a.request('/client-gallery/favorites',{slug:'race',changes:[{publicId:'c',selected:true}]},'client-token'),
  ]);
  for (const res of results) assert.equal(res.status,200,await res.text());
  const current = await a.readKvJson(a.env,'private_gallery_selection:g',[]);
  assert.deepEqual(Array.from(current).sort(),['a','b','c']);
  assert.equal((await a.request('/client-gallery/favorites',{slug:'race',changes:[{publicId:'foreign',selected:true}]},'client-token')).status,400);
  a.seed('client_session:other-token',{email:'other@example.test',expiresAt:Date.now()+100000});
  assert.equal((await a.request('/client-gallery?slug=race',undefined,'other-token')).status,403);
  const res = await a.request('/client-gallery?slug=race',undefined,'client-token');
  assert.equal(res.status,200);
  assert.deepEqual((await res.json()).gallery.selectedPublicIds.sort(),['a','b','c']);
  await Promise.all(a.tasks);
  assert.equal((await a.readKvJson(a.env,'private_gallery_events:g',[])).filter(e => e.action === 'favoritar_foto').length,2);
});

test('a pending Asaas charge freezes gallery favorites and completion', async () => {
  const a = app();
  await a.env.GALLERY_DB.prepare('INSERT INTO gallery_records (key, value) VALUES (?, ?)')
    .bind('asaas_intent:gallery:g', JSON.stringify({ paymentId: 'pay_1', status: 'pending' })).run();
  for (const [path, body] of [
    ['/client-gallery/favorites', { slug: 'race', changes: [{ publicId: 'b', selected: true }] }],
    ['/client-gallery/select-all', { slug: 'race' }],
    ['/client-gallery/complete', { slug: 'race' }],
  ]) {
    assert.equal((await a.request(path, body, 'client-token')).status, 409);
  }
  assert.equal((await a.request('/private/galleries', { id: 'g', selectionLimit: 0 })).status, 409);
  assert.equal((await a.request('/private/gallery/delete', { galleryId: 'g' })).status, 409);
  assert.deepEqual(Array.from(await a.readKvJson(a.env, 'private_gallery_selection:g', [])), ['a']);
  await a.env.GALLERY_DB.prepare('UPDATE gallery_records SET value = ? WHERE key = ?')
    .bind(JSON.stringify({ paymentId: 'pay_1', status: 'rejected' }), 'asaas_intent:gallery:g').run();
  assert.equal((await a.request('/client-gallery/favorites',
    { slug: 'race', changes: [{ publicId: 'b', selected: true }] }, 'client-token')).status, 200);
});

test('a client can retrieve an in-progress gallery charge without creating another one', async () => {
  const a = app();
  const payment = {
    id: 'pay_1', provider: 'asaas', environment: 'sandbox', status: 'creating',
    galleryId: 'g', gallerySlug: 'race', amountCents: 1000,
  };
  await a.env.GALLERY_DB.prepare('INSERT INTO gallery_records (key, value) VALUES (?, ?)')
    .bind('asaas_intent:gallery:g', JSON.stringify({ paymentId: payment.id, payment, status: 'creating' })).run();
  await a.writeKvJson(a.env, 'private_gallery_payment:pay_1', payment);

  const response = await a.request('/client-gallery/payment/current?slug=race', undefined, 'client-token');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.payment.id, 'pay_1');
  assert.equal(body.payment.status, 'creating');
  assert.equal(body.payment.amountCents, 1000);
});

test('client cancels only the pending Asaas charge for its gallery, then can change photos and create another', async () => {
  const a = app();
  a.env.ASAAS_SANDBOX_API_KEY = 'sandbox-test-key';
  const payment = {
    id: 'pay_local', provider: 'asaas', providerPaymentId: 'pay_remote', environment: 'sandbox',
    galleryId: 'g', status: 'pending', amountCents: 1000, selectedPublicIds: ['a'],
  };
  await a.writeKvJson(a.env, 'private_gallery_payment:pay_local', payment);
  await a.writeKvJson(a.env, 'private_gallery_latest_payment:g', payment.id);
  await a.env.GALLERY_DB.prepare('INSERT INTO gallery_records (key, value) VALUES (?, ?)')
    .bind('asaas_intent:gallery:g', JSON.stringify({ paymentId: payment.id, payment, status: 'pending' })).run();
  const calls = [];
  a.context.fetch = async (url, options = {}) => {
    calls.push(options.method || 'GET');
    assert.match(url, /api-sandbox\.asaas\.com\/v3\/payments\/pay_remote$/);
    assert.equal(options.headers.access_token, 'sandbox-test-key');
    return new Response(JSON.stringify(options.method === 'DELETE' ? { deleted: true } : {
      id: 'pay_remote', externalReference: 'pay_local', value: 10, status: 'PENDING',
    }));
  };
  assert.equal((await a.request('/client-gallery/payment/cancel', { slug: 'race', paymentId: payment.id }, 'wrong')).status, 401);
  assert.equal((await a.request('/client-gallery/payment/cancel', { slug: 'race', paymentId: 'other' }, 'client-token')).status, 409);
  assert.deepEqual(calls, []);

  const response = await a.request('/client-gallery/payment/cancel', { slug: 'race', paymentId: payment.id }, 'client-token');
  assert.equal(response.status, 200, await response.text());
  assert.equal(a.data.has('private_gallery_payment:pay_local'), false); // Gallery payments live in D1.
  assert.equal((await a.readKvJson(a.env, 'private_gallery_payment:pay_local', null)).status, 'cancelled');
  assert.equal((await a.env.GALLERY_DB.prepare('SELECT value FROM gallery_records WHERE key = ?')
    .bind('asaas_intent:gallery:g').first()).value.includes('"status":"cancelled"'), true);
  assert.deepEqual(calls, ['GET', 'DELETE']);
  const current = await a.request('/client-gallery/payment/current?slug=race', undefined, 'client-token');
  assert.equal((await current.json()).payment, null);
  assert.equal((await a.request('/client-gallery/favorites',
    { slug: 'race', changes: [{ publicId: 'a', selected: false }] }, 'client-token')).status, 200);
  assert.equal(await a.claimAsaasIntent(a.env, 'gallery:g', { id: 'pay_new' }), true);
});

// Minimal Asaas double holding one charge, so tests can follow what happens to it.
function asaasCharges(a, { refusePix = false } = {}) {
  const remote = { charge: null, calls: [] };
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });
  a.env.ASAAS_SANDBOX_API_KEY = 'sandbox-test-key';
  a.seed('private_client:c', { id: 'c', name: 'Client', email: 'client@example.test', isTest: true });
  a.seed('private_gallery:g', { id: 'g', slug: 'race', clientId: 'c', title: 'Race', selectionLimit: 0, extraPhotoPriceCents: 1000, status: 'selection' });
  a.context.fetch = async (url, options = {}) => {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    remote.calls.push(method + ' ' + new URL(url).pathname.replace('/v3', ''));
    if (url.includes('/customers?')) return reply({ data: [] });
    if (url.endsWith('/customers')) return reply({ id: 'cus_1' });
    if (url.includes('/payments?')) return reply({ data: remote.charge ? [remote.charge] : [] });
    if (refusePix && body?.billingType === 'PIX') return reply({ errors: [{ description: 'Pix indisponível' }] }, 400);
    if (url.endsWith('/payments')) {
      remote.charge = { ...body, id: 'pay_remote', status: 'PENDING', invoiceUrl: 'https://sandbox.asaas.com/i/remote' };
    } else if (url.endsWith('/payments/pay_remote/pixQrCode')) {
      assert.equal(remote.charge.billingType, 'PIX');
      return reply({ encodedImage: 'QUJD', payload: '000201pix' });
    } else if (method === 'PUT') {
      assert.deepEqual([body.value, body.dueDate], [remote.charge.value, remote.charge.dueDate]);
      remote.charge = { ...remote.charge, billingType: body.billingType };
    } else if (method === 'DELETE') {
      // Asaas keeps the status of a removed charge and only flags it as deleted.
      remote.charge = { ...remote.charge, deleted: true };
      return reply({ deleted: true, id: 'pay_remote' });
    } else assert.match(url, /\/payments\/pay_remote$/);
    return reply(remote.charge);
  };
  return remote;
}

test('Asaas flags removed charges instead of changing their status: webhooks are acknowledged and the gallery is released', async () => {
  const a = app();
  const remote = asaasCharges(a);
  a.env.ASAAS_SANDBOX_WEBHOOK_TOKEN = 'sandbox-token';
  const post = (path, body) => a.request(path, body, 'client-token');
  const webhook = () => a.context.worker.fetch(new Request('https://example.test/payments/asaas/sandbox/webhook', {
    method: 'POST', headers: { 'asaas-access-token': 'sandbox-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'PAYMENT_DELETED', payment: { id: 'pay_remote' } }),
  }), a.env, { waitUntil() {} });
  const stored = id => a.readKvJson(a.env, 'private_gallery_payment:' + id, null);

  // Cancelled on the site: the PAYMENT_DELETED webhook must not be retried forever.
  let { payment } = await (await post('/client-gallery/payment/create', { slug: 'race', document: '12345678901' })).json();
  assert.equal((await post('/client-gallery/payment/cancel', { slug: 'race', paymentId: payment.id })).status, 200);
  assert.deepEqual([remote.charge.status, remote.charge.deleted], ['PENDING', true]);
  assert.equal((await webhook()).status, 200);
  assert.equal((await stored(payment.id)).status, 'cancelled');

  // Removed in the Asaas panel while still pending here: the sale is released.
  remote.charge = null;
  ({ payment } = await (await post('/client-gallery/payment/create', { slug: 'race', document: '12345678901' })).json());
  remote.charge.deleted = true;
  assert.equal((await post('/client-gallery/payment/method', { slug: 'race', paymentId: payment.id, method: 'card' })).status, 409);
  assert.equal((await webhook()).status, 200);
  assert.equal((await stored(payment.id)).status, 'rejected');
  assert.equal((await post('/client-gallery/favorites', { slug: 'race', changes: [{ publicId: 'b', selected: true }] })).status, 200);
});

test('a gallery charge opens as Pix with its QR Code and switches to card and back on the same charge', async () => {
  const a = app();
  const remote = asaasCharges(a);
  const post = async (path, body, token = 'client-token') => {
    const response = await a.request(path, body, token);
    return { status: response.status, ...(await response.json()) };
  };
  const created = await post('/client-gallery/payment/create', { slug: 'race', document: '12345678901' });
  assert.equal(created.status, 200, created.error);
  const { id } = created.payment;
  assert.deepEqual([created.payment.billingType, created.payment.qrCode, created.payment.qrCodeBase64, created.payment.pixAvailable], ['PIX', '000201pix', 'QUJD', true]);
  assert.equal(created.payment.ticketUrl, 'https://sandbox.asaas.com/i/remote');
  // The QR Code is never stored and page loads do not ask Asaas for it.
  assert.equal((await a.readKvJson(a.env, 'private_gallery_payment:' + id, null)).qrCode, undefined);
  const current = path => a.request(path, undefined, 'client-token').then(response => response.json());
  assert.equal((await current('/client-gallery/payment/current?slug=race')).payment.qrCode, '');
  assert.equal((await current('/client-gallery/payment/current?slug=race&qr=1')).payment.qrCode, '000201pix');

  assert.equal((await post('/client-gallery/payment/method', { slug: 'race', paymentId: id, method: 'card' }, 'wrong')).status, 401);
  assert.equal((await post('/client-gallery/payment/method', { slug: 'race', paymentId: id, method: 'boleto' })).status, 400);
  assert.equal((await post('/client-gallery/payment/method', { slug: 'race', paymentId: 'other', method: 'card' })).status, 409);
  assert.equal(remote.charge.billingType, 'PIX');

  const card = await post('/client-gallery/payment/method', { slug: 'race', paymentId: id, method: 'card' });
  assert.deepEqual([card.status, card.payment.billingType, card.payment.qrCode], [200, 'CREDIT_CARD', '']);
  assert.equal(remote.charge.billingType, 'CREDIT_CARD');
  const pix = await post('/client-gallery/payment/method', { slug: 'race', paymentId: id, method: 'pix' });
  assert.deepEqual([pix.status, pix.payment.billingType, pix.payment.qrCode], [200, 'PIX', '000201pix']);
  assert.equal(remote.calls.filter(call => call === 'POST /payments').length, 1);

  // A paid charge can no longer change method.
  remote.charge.status = 'RECEIVED';
  assert.equal((await post('/client-gallery/payment/method', { slug: 'race', paymentId: id, method: 'card' })).status, 409);
  assert.equal(remote.charge.billingType, 'PIX');
});

test('when Asaas refuses Pix the sale falls back to one card charge', async () => {
  const a = app();
  const remote = asaasCharges(a, { refusePix: true });
  const post = async (path, body) => {
    const response = await a.request(path, body, 'client-token');
    return { status: response.status, ...(await response.json()) };
  };
  const created = await post('/client-gallery/payment/create', { slug: 'race', document: '12345678901' });
  assert.equal(created.status, 200, created.error);
  assert.deepEqual([created.payment.billingType, created.payment.qrCode, created.payment.pixAvailable], ['CREDIT_CARD', '', false]);
  assert.equal(remote.calls.filter(call => call === 'POST /payments').length, 2);
  const pix = await post('/client-gallery/payment/method', { slug: 'race', paymentId: created.payment.id, method: 'pix' });
  assert.equal(pix.status, 502);
  assert.match(pix.error, /Pix indisponível/);
  assert.equal((await a.readKvJson(a.env, 'private_gallery_payment:' + created.payment.id, null)).billingType, 'CREDIT_CARD');
});

test('legacy Mercado Pago records never block selection nor reach a provider', async () => {
  const a = app();
  const payment = {
    id: 'pay_mp_local', provider: 'mercadopago', providerPaymentId: '987', galleryId: 'g',
    status: 'pending', amountCents: 1000, selectedPublicIds: ['a'],
  };
  await a.writeKvJson(a.env, 'private_gallery_payment:pay_mp_local', payment);
  await a.writeKvJson(a.env, 'private_gallery_latest_payment:g', payment.id);
  const calls = [];
  a.context.fetch = async (url) => { calls.push(url); return new Response('{}'); };
  assert.equal((await a.request('/client-gallery/favorites',
    { slug: 'race', changes: [{ publicId: 'a', selected: false }] }, 'client-token')).status, 200);
  assert.equal((await a.request('/private/gallery/payment/cancel', { galleryId: 'g', paymentId: payment.id })).status, 409);
  assert.equal((await a.request('/payments/mercadopago/webhook', { id: '987' })).status, 405);
  assert.deepEqual(calls, []);
});

test('a provider charge with mismatched reference is never cancelled', async () => {
  const a = app();
  a.env.ASAAS_SANDBOX_API_KEY = 'sandbox-test-key';
  const payment = { id: 'pay_local', provider: 'asaas', providerPaymentId: 'pay_remote',
    environment: 'sandbox', galleryId: 'g', status: 'pending', amountCents: 1000 };
  await a.writeKvJson(a.env, 'private_gallery_payment:pay_local', payment);
  await a.writeKvJson(a.env, 'private_gallery_latest_payment:g', payment.id);
  await a.env.GALLERY_DB.prepare('INSERT INTO gallery_records (key, value) VALUES (?, ?)')
    .bind('asaas_intent:gallery:g', JSON.stringify({ paymentId: payment.id, payment, status: 'pending' })).run();
  let deleted = false;
  a.context.fetch = async (_url, options = {}) => {
    if (options.method === 'DELETE') deleted = true;
    return new Response(JSON.stringify({ id: 'pay_remote', externalReference: 'someone_else', value: 10, status: 'PENDING' }));
  };
  const response = await a.request('/client-gallery/payment/cancel', { slug: 'race', paymentId: payment.id }, 'client-token');
  assert.equal(response.status, 409);
  assert.equal(deleted, false);
  assert.equal((await a.readKvJson(a.env, 'private_gallery_payment:pay_local', null)).status, 'pending');
});

test('a charge paid just before cancellation is fulfilled instead of deleted', async () => {
  const a = app();
  a.env.ASAAS_SANDBOX_API_KEY = 'sandbox-test-key';
  await a.writeKvJson(a.env, 'private_client:c', { id: 'c', name: 'Client', email: 'client@example.test', isTest: true });
  await a.writeKvJson(a.env, 'private_gallery:g', { id: 'g', slug: 'race', clientId: 'c',
    status: 'selection', selectionLimit: 0, extraPhotoPriceCents: 1000 });
  const payment = { id: 'pay_local', provider: 'asaas', providerPaymentId: 'pay_remote',
    environment: 'sandbox', galleryId: 'g', status: 'pending', amountCents: 1000, selectedPublicIds: ['a'] };
  await a.writeKvJson(a.env, 'private_gallery_payment:pay_local', payment);
  await a.writeKvJson(a.env, 'private_gallery_latest_payment:g', payment.id);
  await a.writeKvJson(a.env, 'asaas_payment:sandbox:pay_remote', { kind: 'gallery', id: payment.id });
  await a.env.GALLERY_DB.prepare('INSERT INTO gallery_records (key, value) VALUES (?, ?)')
    .bind('asaas_intent:gallery:g', JSON.stringify({ paymentId: payment.id, payment, status: 'pending' })).run();
  let deletions = 0;
  a.context.fetch = async (_url, options = {}) => {
    if (options.method === 'DELETE') deletions++;
    return new Response(JSON.stringify({ id: 'pay_remote', externalReference: payment.id,
      value: 10, status: 'RECEIVED' }));
  };
  const response = await a.request('/client-gallery/payment/cancel', { slug: 'race', paymentId: payment.id }, 'client-token');
  assert.equal(response.status, 409);
  assert.equal(deletions, 0);
  assert.equal((await a.readKvJson(a.env, 'private_gallery_payment:pay_local', null)).status, 'approved');
  assert.equal((await a.readKvJson(a.env, 'private_gallery:g', null)).status, 'editing');
});

test('admin preview is gallery-scoped, expires and cannot mutate selection or generate payment', async () => {
  const a = app();
  assert.equal((await a.request('/private/gallery/preview',{galleryId:'g'},'bad')).status,401);
  const created = await a.request('/private/gallery/preview',{galleryId:'g'});
  assert.equal(created.status,200);
  const token = new URLSearchParams(new URL((await created.json()).url).hash.slice(1)).get('preview');
  const view = await a.request('/client-gallery?slug=race',undefined,token);
  assert.equal(view.status,200);
  const body=await view.json(); assert.equal(body.gallery.adminPreview,true); assert.deepEqual(body.gallery.selectedPublicIds,['a']);
  for (const path of ['/client-gallery/favorite','/client-gallery/payment/create','/client-gallery/payment/cancel','/client-gallery/complete']) {
    assert.equal((await a.request(path,{slug:'race',publicId:'a',selected:false},token)).status,403);
  }
  a.seed('private_gallery_slug:other','other');a.seed('private_gallery:other',{id:'other',slug:'other'});
  assert.equal((await a.request('/client-gallery?slug=other',undefined,token)).status,401);
  a.seed('gallery_preview:'+token,{galleryId:'g',expiresAt:Date.now()-1});
  assert.equal((await a.request('/client-gallery?slug=race',undefined,token)).status,401);
});

test('removing unselected photos deletes in batches and only drops confirmed records', async () => {
  const a = app();
  Object.assign(a.env, { CLOUDINARY_CLOUD_NAME: 'cloud', CLOUDINARY_API_KEY: 'key', CLOUDINARY_API_SECRET: 'secret' });
  const ids = Array.from({ length: 120 }, (_, i) => 'clientes/race/selecao/p' + i);
  a.seed('private_gallery_images:g', ['a', ...ids].map(public_id => ({ public_id, phase: 'selection', url: 'https://example.test/' + public_id })));
  const calls = [];
  a.context.fetch = async (url, options = {}) => {
    assert.equal(options.method, 'DELETE');
    assert.equal(options.headers.Authorization, 'Basic ' + btoa('key:secret'));
    const batch = new URL(url).searchParams.getAll('public_ids[]');
    calls.push(batch.length);
    const deleted = Object.fromEntries(batch.map(id => [id, id.endsWith('p0') ? 'not_found' : id.endsWith('p119') ? 'error' : 'deleted']));
    return new Response(JSON.stringify({ deleted, partial: false }));
  };
  const response = await a.request('/private/gallery/prune-unselected', { galleryId: 'g' });
  assert.equal(response.status, 200, await response.clone().text());
  const body = await response.json();
  assert.deepEqual(calls, [100, 20]);
  assert.equal(body.removed, 119);
  assert.equal(body.failed, 1);
  const remaining = (await a.readKvJson(a.env, 'private_gallery_images:g', [])).map(image => image.public_id);
  assert.deepEqual(Array.from(remaining), ['a', 'clientes/race/selecao/p119']);
  assert.deepEqual(Array.from(await a.readKvJson(a.env, 'private_gallery_selection:g', [])), ['a']);
});

test('completing delivery keeps only edited photos, finalizes the gallery and preserves the chosen names', async () => {
  const a = app();
  Object.assign(a.env, { CLOUDINARY_CLOUD_NAME: 'cloud', CLOUDINARY_API_KEY: 'key', CLOUDINARY_API_SECRET: 'secret' });
  a.context.fetch = () => { throw Error('no external request before edited photos exist'); };
  assert.equal((await a.request('/private/gallery/complete-delivery', { galleryId: 'g' })).status, 400);

  await a.writeKvJson(a.env, 'private_gallery_images:g', [
    { public_id: 'f1', phase: 'final', url: 'https://example.test/f1', filename: 'A-Editar.jpg' },
    ...['a', 'b', 'c'].map(public_id => ({ public_id, phase: 'selection', url: 'https://example.test/' + public_id, filename: public_id.toUpperCase() + '.jpg' })),
  ]);
  const deletedIds = [];
  a.context.fetch = async (url, options = {}) => {
    assert.equal(options.method, 'DELETE');
    const batch = new URL(url).searchParams.getAll('public_ids[]');
    deletedIds.push(...batch);
    return new Response(JSON.stringify({ deleted: Object.fromEntries(batch.map(id => [id, 'deleted'])) }));
  };
  const response = await a.request('/private/gallery/complete-delivery', { galleryId: 'g' });
  assert.equal(response.status, 200, await response.clone().text());
  const body = await response.json();
  assert.deepEqual(deletedIds.sort(), ['a', 'b', 'c']);
  assert.equal(body.removed, 3);
  assert.deepEqual(Array.from(await a.readKvJson(a.env, 'private_gallery_images:g', [])).map(image => image.public_id), ['f1']);
  const gallery = await a.readKvJson(a.env, 'private_gallery:g', null);
  assert.equal(gallery.status, 'final');
  assert.equal(gallery.allowDownload, true);
  assert.equal(gallery.coverPublicId, 'f1');
  assert.deepEqual(Array.from(gallery.deliveredSelection, item => item.filename), ['A.jpg']);

  const csv = await (await a.request('/private/gallery/export-selected?id=g')).text();
  assert.match(csv, /A\.jpg;;a/);
});

test('login asks for captcha after one wrong password, locks after five and unlocks only with a new password', async () => {
  const a = app();
  a.env.TURNSTILE_SECRET_KEY = 'turnstile-secret';
  const verified = [];
  a.context.fetch = async (url, options = {}) => {
    assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.equal(options.body.get('secret'), 'turnstile-secret');
    verified.push(options.body.get('response'));
    return new Response(JSON.stringify({ success: options.body.get('response') === 'human' }));
  };
  for (const [path, scope, save] of [['/client-auth/login', 'client', a.saveClientPassword], ['/auth/login', 'admin', a.saveUserPassword]]) {
    const email = scope + '@example.test';
    await save(a.env, email, 'right-password');
    const login = async (password, turnstileToken) => {
      const response = await a.request(path, { email, password, turnstileToken }, '');
      return { status: response.status, ...(await response.json()) };
    };

    // The first mistake needs no captcha; a correct login clears the count.
    assert.deepEqual([(await login('wrong')).status, (await login('wrong')).status], [401, 403]);
    assert.equal((await login('right-password')).captchaRequired, true);
    assert.equal((await login('right-password', 'robot')).status, 403);
    assert.equal((await login('right-password', 'human')).status, 200);
    assert.equal((await login('wrong')).status, 401);

    // Captcha refusals are not password attempts; five wrong passwords lock the account.
    assert.equal((await login('wrong')).status, 403);
    for (let attempt = 2; attempt <= 4; attempt += 1) assert.equal((await login('wrong', 'human')).status, 401);
    const locking = await login('wrong', 'human');
    assert.equal(locking.status, 423);
    assert.equal(locking.locked, true);
    assert.equal((await login('right-password', 'human')).status, 423);

    await save(a.env, email, 'new-password');
    assert.equal((await login('right-password')).status, 401);
    assert.equal((await login('new-password', 'human')).status, 200);
  }
  // Unknown e-mails behave like real accounts.
  const unknown = await a.request('/client-auth/login', { email: 'nobody@example.test', password: 'x' }, '');
  assert.equal(unknown.status, 401);
  assert.equal((await unknown.json()).captchaRequired, true);
});

test('attempt lock e-mails a reset link; an admin block survives resets, ends sessions and is lifted only by the admin', async () => {
  const a = app();
  a.env.RESEND_API_KEY = 'resend-test';
  const emails = [];
  a.context.fetch = async (url, options = {}) => {
    assert.equal(url, 'https://api.resend.com/emails');
    emails.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ id: 'email_1' }));
  };
  const email = 'client@example.test';
  await a.writeKvJson(a.env, 'private_clients_index', ['c']);
  await a.saveClientPassword(a.env, email, 'right-password');
  const post = async (path, body, token = '') => {
    const response = await a.request(path, body, token);
    return { status: response.status, ...(await response.json().catch(() => ({}))) };
  };
  const login = password => post('/client-auth/login', { email, password });

  // Five wrong passwords: one e-mail with the reset button, nothing for unknown accounts.
  for (let attempt = 1; attempt <= 4; attempt += 1) assert.equal((await login('wrong')).status, 401);
  assert.equal((await login('wrong')).status, 423);
  assert.equal(emails.length, 1);
  assert.deepEqual(Array.from(emails[0].to), [email]);
  assert.match(emails[0].subject, /Conta bloqueada/);
  assert.match(emails[0].html, /\?redefinir=/);
  assert.match(emails[0].html, /Redefinir senha/);
  for (let attempt = 1; attempt <= 5; attempt += 1) await post('/client-auth/login', { email: 'ghost@example.test', password: 'x' });
  assert.equal(emails.length, 1);
  let access = (await post('/private/client/access', { clientId: 'c', action: 'unblock' }, 'local-test-key')).access;
  assert.equal(access.lock, null);
  assert.equal((await login('right-password')).status, 200);

  // Admin block: listed, refuses login, reset and live sessions; a new password does not lift it.
  access = (await post('/private/client/access', { clientId: 'c', action: 'block' }, 'local-test-key')).access;
  assert.equal(access.lock.by, 'admin');
  const listed = await (await a.request('/private/clients', undefined, 'local-test-key')).json();
  assert.equal(listed.clients.find(client => client.id === 'c').access.lock.by, 'admin');
  assert.match((await login('right-password')).error, /administrador/);
  assert.equal((await a.request('/client-galleries', undefined, 'client-token')).status, 401);
  await post('/client-auth/forgot', { email });
  assert.equal(emails.length, 1);
  await a.saveClientPassword(a.env, email, 'another-password');
  assert.equal((await login('another-password')).status, 423);
  await post('/private/client/access', { clientId: 'c', action: 'unblock' }, 'local-test-key');
  assert.equal((await login('another-password')).status, 200);
  assert.equal((await a.request('/client-galleries', undefined, 'client-token')).status, 200);

  // Admin users: block and unblock, never self or the main admin.
  await a.saveUserPassword(a.env, 'editor@example.test', 'editor-password', { role: 'editor' });
  assert.equal((await post('/auth/user-lock', { email: 'editor@example.test', locked: true }, 'local-test-key')).lock.by, 'admin');
  assert.equal((await post('/auth/login', { email: 'editor@example.test', password: 'editor-password' })).status, 423);
  assert.equal((await post('/auth/user-lock', { email: 'editor@example.test', locked: false }, 'local-test-key')).lock, null);
  assert.equal((await post('/auth/login', { email: 'editor@example.test', password: 'editor-password' })).status, 200);
  assert.equal((await post('/auth/user-lock', { email: 'nobody@example.test', locked: true }, 'local-test-key')).status, 404);
});
