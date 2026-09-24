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
  const context = vm.createContext({ crypto: webcrypto, Request, Response, Headers, URL, AbortController, TextEncoder, TextDecoder, btoa, atob, console, setTimeout, clearTimeout, fetch: () => { throw Error('Unexpected external request'); } });
  const source = fs.readFileSync(require.resolve('../worker.js'), 'utf8').replace('export default {', 'globalThis.worker = {');
  vm.runInContext(source + '\nglobalThis.helpers = {readKvJson, writeKvJson, deleteGalleryRecord, savePrivateGallery, changeGalleryFavorites, calculateSelectionPricing, createMercadoPagoPixPayment, claimAsaasIntent};', context);
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

test('admin can cancel a specific pending Mercado Pago charge, but cannot cancel another gallery or a paid charge', async () => {
  const a = app();
  a.env.MERCADO_PAGO_ACCESS_TOKEN = 'mp-test-key';
  const payment = {
    id: 'pay_mp_local', provider: 'mercadopago', providerPaymentId: '987', galleryId: 'g',
    status: 'pending', amountCents: 1000, selectedPublicIds: ['a'],
  };
  await a.writeKvJson(a.env, 'private_gallery_payment:pay_mp_local', payment);
  await a.writeKvJson(a.env, 'private_gallery_latest_payment:g', payment.id);
  assert.equal((await a.request('/client-gallery/favorites',
    { slug: 'race', changes: [{ publicId: 'a', selected: false }] }, 'client-token')).status, 409);
  assert.equal((await a.request('/private/galleries', { id: 'g', selectionLimit: 0 })).status, 409);
  const calls = [];
  a.context.fetch = async (url, options = {}) => {
    calls.push(options.method || 'GET');
    assert.equal(url, 'https://api.mercadopago.com/v1/payments/987');
    assert.equal(options.headers.Authorization, 'Bearer mp-test-key');
    return new Response(JSON.stringify({ id: 987, external_reference: payment.id,
      transaction_amount: 10, status: options.method === 'PUT' ? 'cancelled' : 'pending' }));
  };
  assert.equal((await a.request('/private/gallery/payment/cancel', { galleryId: 'g', paymentId: payment.id }, 'wrong')).status, 401);
  assert.equal((await a.request('/private/gallery/payment/cancel', { galleryId: 'other', paymentId: payment.id })).status, 404);
  assert.deepEqual(calls, []);
  const response = await a.request('/private/gallery/payment/cancel', { galleryId: 'g', paymentId: payment.id });
  assert.equal(response.status, 200, await response.text());
  assert.deepEqual(calls, ['GET', 'PUT']);
  assert.equal((await a.readKvJson(a.env, 'private_gallery_payment:pay_mp_local', null)).status, 'cancelled');
  assert.equal((await a.request('/client-gallery/favorites',
    { slug: 'race', changes: [{ publicId: 'a', selected: false }] }, 'client-token')).status, 200);
  const second = await a.request('/private/gallery/payment/cancel', { galleryId: 'g', paymentId: payment.id });
  assert.equal(second.status, 200);
  assert.deepEqual(calls, ['GET', 'PUT']);

  const paid = { ...payment, id: 'pay_paid', providerPaymentId: '988', status: 'approved' };
  await a.writeKvJson(a.env, 'private_gallery_payment:pay_paid', paid);
  await a.writeKvJson(a.env, 'private_gallery_latest_payment:g', paid.id);
  assert.equal((await a.request('/private/gallery/payment/cancel', { galleryId: 'g', paymentId: paid.id })).status, 409);
  assert.deepEqual(calls, ['GET', 'PUT']);
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

test('provider rejection or missing QR never becomes a usable pending Pix', async () => {
  const a=app();
  for (const body of [{status:'rejected',status_detail:'rejected_high_risk'}, {status:'pending'}]) {
    a.context.fetch=async()=>new Response(JSON.stringify(body),{status:201});
    await assert.rejects(a.createMercadoPagoPixPayment({MERCADO_PAGO_ACCESS_TOKEN:'test'},new Request('https://example.test'),{id:'pay',amountCents:1000},{title:'Race'},{email:'client@example.test'}), /não disponibilizou Pix/);
  }
});
