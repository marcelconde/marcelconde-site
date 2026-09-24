const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

function setup(charge, fetchImpl) {
  const records = new Map();
  const dbRows = new Map();
  const db = {
    prepare(sql) {
      let params;
      return {
        bind(...values) { params = values; return this; },
        async first() {
          assert.match(sql, /^SELECT value/);
          return dbRows.has(params[0]) ? { value: dbRows.get(params[0]) } : null;
        },
        async run() {
          if (sql.startsWith('INSERT INTO gallery_records')) {
            const [key, value] = params;
            dbRows.set(key, value);
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith('INSERT OR IGNORE')) {
            const [key, value] = params;
            if (dbRows.has(key)) return { meta: { changes: 0 } };
            dbRows.set(key, value);
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith('DELETE FROM')) {
            const [key, value] = params;
            if (dbRows.get(key) !== value) return { meta: { changes: 0 } };
            dbRows.delete(key);
            return { meta: { changes: 1 } };
          }
          if (sql.includes('WHERE key = ? AND value = ?')) {
            const [value, key, old] = params;
            if (dbRows.get(key) !== old) return { meta: { changes: 0 } };
            dbRows.set(key, value);
            return { meta: { changes: 1 } };
          }
          if (sql.includes('json_set')) {
            const [status, key, paymentId] = params;
            const current = JSON.parse(dbRows.get(key) || 'null');
            if (!current || current.paymentId !== paymentId) return { meta: { changes: 0 } };
            current.status = status;
            dbRows.set(key, JSON.stringify(current));
            return { meta: { changes: 1 } };
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
      };
    },
  };
  const kv = {
    async get(key, type) { const value = records.get(key); return value == null ? null : type === 'json' ? JSON.parse(value) : value; },
    async put(key, value) { records.set(key, value); },
    async delete(key) { records.delete(key); },
  };
  const fetch = async (url) => {
    assert.match(url, /^https:\/\/api-sandbox\.asaas\.com\/v3\/payments\/pay_123$/);
    return new Response(JSON.stringify(charge), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const context = vm.createContext({ crypto: webcrypto, Request, Response, Headers, URL, TextEncoder, TextDecoder, AbortController, btoa, atob, console, setTimeout, clearTimeout, fetch: fetchImpl || fetch });
  const source = fs.readFileSync(require.resolve('../worker.js'), 'utf8').replace('export default {', 'globalThis.worker = {');
  vm.runInContext(source + '\nglobalThis.reconcile = reconcileAsaasPayment; globalThis.createCharge = createAsaasCharge; globalThis.recover = recoverAsaasCharge;', context);
  const seed = (key, value) => records.set(key, JSON.stringify(value));
  const read = key => JSON.parse(records.get(key) || 'null');
  vm.runInContext('globalThis.clientEnvironment = asaasEnvironmentForClient;', context);
  return { reconcile: context.reconcile, createCharge: context.createCharge, recover: context.recover,
    clientEnvironment: context.clientEnvironment, worker: context.worker,
    env: { LIKES_KV: kv, GALLERY_DB: db, ASAAS_SANDBOX_API_KEY: 'test-only' },
    seed, read, dbRows };
}

function seedTestQuote(app, quote = {}) {
  app.seed('private_client:client_1', { id: 'client_1', isTest: true });
  app.seed('private_quote:quote_1', { id: 'quote_1', clientId: 'client_1', isTest: true, ...quote });
}

function seedTestPayment(app, payment = {}) {
  app.seed('asaas_payment:sandbox:pay_123', { kind: 'quote', id: 'quote_1' });
  app.seed('private_quote_payment:quote_1', {
    id: 'local_1', provider: 'asaas', environment: 'sandbox',
    providerPaymentId: 'pay_123', amountCents: 10000, status: 'pending', ...payment,
  });
}

test('Asaas minimum blocks a small charge before any API request', async () => {
  const app = setup({});
  await assert.rejects(app.createCharge(app.env, { amountCents: 100 }, {}), /R\$ 5,00/);
});

test('test clients charge Sandbox and real clients charge production with separate keys', async () => {
  const calls = [];
  const app = setup({}, async (url, options = {}) => {
    const production = url.startsWith('https://api.asaas.com/v3/');
    const expectedKey = production ? 'production-key' : 'sandbox-key';
    assert.equal(options.headers.access_token, expectedKey);
    calls.push({ url, method: options.method || 'GET' });
    if (url.includes('/customers?')) return new Response(JSON.stringify({ data: [{
      id: 'cus_1', cpfCnpj: '12345678901',
      externalReference: new URL(url).searchParams.get('externalReference'),
    }] }));
    if (url.includes('/payments?')) return new Response(JSON.stringify({ data: [] }));
    assert.match(url, /\/payments$/);
    assert.equal(options.method, 'POST');
    const body = JSON.parse(options.body);
    return new Response(JSON.stringify({
      id: production ? 'pay_prod' : 'pay_test', customer: body.customer,
      externalReference: body.externalReference, value: body.value, status: 'PENDING',
      invoiceUrl: production ? 'https://www.asaas.com/i/production' : 'https://sandbox.asaas.com/i/test',
    }));
  });
  app.env.ASAAS_SANDBOX_API_KEY = 'sandbox-key';
  app.env.ASAAS_API_KEY = 'production-key';
  for (const client of [{ isTest: true }, { isTest: false }]) {
    const environment = app.clientEnvironment(client);
    const charge = await app.createCharge(app.env,
      { id: client.isTest ? 'test-payment' : 'real-payment', environment, amountCents: 30000 },
      { id: 'client_1', name: 'Cliente', document: '12345678901' });
    assert.match(charge.ticketUrl, client.isTest ? /sandbox\.asaas\.com/ : /www\.asaas\.com/);
  }
  assert.equal(calls.filter(call => call.method === 'POST').length, 2);
  assert.equal(calls.filter(call => call.url.startsWith('https://api-sandbox.asaas.com/')).length, 3);
  assert.equal(calls.filter(call => call.url.startsWith('https://api.asaas.com/')).length, 3);
});

test('site charges do not reuse a customer managed by another Asaas integration', async () => {
  const calls = [];
  const app = setup({}, async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body && JSON.parse(options.body) });
    if (url.includes('/customers?')) return new Response(JSON.stringify({ data: [{
      id: 'fotop_customer', cpfCnpj: '12345678901', externalReference: 'fotop',
    }] }));
    if (url.endsWith('/customers')) return new Response(JSON.stringify({ id: 'site_customer' }));
    if (url.includes('/payments?')) return new Response(JSON.stringify({ data: [] }));
    const body = JSON.parse(options.body);
    return new Response(JSON.stringify({
      id: 'pay_123', customer: body.customer, externalReference: body.externalReference,
      value: body.value, invoiceUrl: 'https://sandbox.asaas.com/i/test', status: 'PENDING',
    }));
  });
  await app.createCharge(app.env, { id: 'local_1', environment: 'sandbox', amountCents: 10000 },
    { id: 'client_1', name: 'Cliente', document: '12345678901' });
  assert.equal(calls.find(call => call.url.endsWith('/customers')).body.externalReference,
    'marcelconde-site:client_1');
  assert.equal(calls.find(call => call.url.endsWith('/payments')).body.customer, 'site_customer');
});

test('a Sandbox payment cannot be reconciled through the production environment', async () => {
  const app = setup({}, async () => { throw new Error('Provider must not be called'); });
  seedTestPayment(app);
  seedTestQuote(app, { status: 'pending_payment' });
  app.seed('asaas_payment:production:pay_123', { kind: 'quote', id: 'quote_1' });
  const result = await app.reconcile(app.env, new Request('https://example.test'), 'pay_123', 'production');
  assert.equal(result.reason, 'payment_record_not_found');
  assert.equal(app.read('private_quote:quote_1').status, 'pending_payment');
});

test('production and Sandbox webhooks require their own access tokens', async () => {
  const app = setup({});
  app.env.ASAAS_WEBHOOK_TOKEN = 'production-token';
  app.env.ASAAS_SANDBOX_WEBHOOK_TOKEN = 'sandbox-token';
  const webhook = (path, token) => app.worker.fetch(new Request(`https://example.test${path}`, {
    method: 'POST', headers: { 'asaas-access-token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ payment: { id: 'unknown' } }),
  }), app.env, {});
  assert.equal((await webhook('/payments/asaas/webhook', 'sandbox-token')).status, 401);
  assert.equal((await webhook('/payments/asaas/sandbox/webhook', 'production-token')).status, 401);
  assert.equal((await webhook('/payments/asaas/webhook', 'production-token')).status, 503);
  assert.equal((await webhook('/payments/asaas/sandbox/webhook', 'sandbox-token')).status, 503);
});

test('paid Asaas charge with wrong amount or reference never approves the quote', async () => {
  for (const mismatch of [{ value: 99 }, { externalReference: 'other' }]) {
    const app = setup({ id: 'pay_123', status: 'CONFIRMED', value: 100, externalReference: 'local_1', ...mismatch });
    seedTestPayment(app);
    seedTestQuote(app, { status: 'pending_payment' });
    const result = await app.reconcile(app.env, new Request('https://example.test'), 'pay_123', 'sandbox');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'paid_charge_mismatch');
    assert.equal(app.read('private_quote_payment:quote_1').status, 'pending');
    assert.equal(app.read('private_quote:quote_1').status, 'pending_payment');
  }
});

test('matching paid Asaas charge accepts the same quote once', async () => {
  const app = setup({ id: 'pay_123', status: 'RECEIVED', value: 100, externalReference: 'local_1' });
  seedTestPayment(app, {
    quoteId: 'quote_1', quoteVersion: 2, acceptanceHash: 'hash_1', choice: 'total',
  });
  seedTestQuote(app, {
    status: 'pending_payment', version: 2,
    acceptance: { hash: 'hash_1' }, acceptanceEmails: { sentAt: 'already-sent' },
  });
  const request = new Request('https://example.test');
  const first = await app.reconcile(app.env, request, 'pay_123', 'sandbox');
  const second = await app.reconcile(app.env, request, 'pay_123', 'sandbox');
  assert.equal(first.approved, true);
  assert.equal(second.approved, true);
  assert.equal(app.read('private_quote:quote_1').status, 'accepted');
  assert.equal(app.read('private_quote_payment:quote_1').status, 'approved');
  assert.equal(app.read('private_quote_events:quote_1').length, 1);
});

test('reserve payment accepts the quote while preserving the unpaid balance', async () => {
  const app = setup({ id: 'pay_123', status: 'CONFIRMED', value: 90, externalReference: 'local_1' });
  seedTestPayment(app, { amountCents: 9000, quoteVersion: 2, acceptanceHash: 'hash_1', choice: 'reserve' });
  seedTestQuote(app, {
    status: 'pending_payment', version: 2, publishedSnapshot: { totalCents: 30000 },
    acceptance: { hash: 'hash_1' }, acceptanceEmails: { sentAt: 'already-sent' },
  });
  const result = await app.reconcile(app.env, new Request('https://example.test'), 'pay_123', 'sandbox');
  assert.equal(result.approved, true);
  const quote = app.read('private_quote:quote_1');
  assert.equal(quote.status, 'accepted');
  assert.equal(quote.paymentAmountCents, 9000);
  assert.equal(quote.paymentBalanceCents, 21000);
});

test('reconciliation completes a payment record after quote acceptance was saved', async () => {
  const app = setup({ id: 'pay_123', status: 'CONFIRMED', value: 100, externalReference: 'local_1' });
  seedTestPayment(app, {
    quoteId: 'quote_1', quoteVersion: 2, acceptanceHash: 'hash_1',
  });
  seedTestQuote(app, {
    status: 'accepted', paymentStatus: 'approved', paymentApprovedAt: '2026-09-23T00:00:00.000Z',
    version: 2, acceptance: { hash: 'hash_1' }, acceptanceEmails: { sentAt: 'already-sent' },
  });
  const result = await app.reconcile(app.env, new Request('https://example.test'), 'pay_123', 'sandbox');
  assert.equal(result.approved, true);
  assert.equal(app.read('private_quote_payment:quote_1').status, 'approved');
  assert.equal(app.read('private_quote_events:quote_1'), null);
});

test('only one concurrent Asaas charge claim wins; rejected intent can be replaced once', async () => {
  const rows = new Map();
  const db = {
    prepare(sql) {
      let params;
      return {
        bind(...values) { params = values; return this; },
        async first() {
          assert.match(sql, /^SELECT value/);
          return rows.has(params[0]) ? { value: rows.get(params[0]) } : null;
        },
        async run() {
          const [value, key, old] = params;
          if (sql.startsWith('INSERT OR IGNORE')) {
            if (rows.has(value)) return { meta: { changes: 0 } };
            rows.set(value, key);
            return { meta: { changes: 1 } };
          }
          if (sql.includes('WHERE key = ? AND value = ?')) {
            if (rows.get(key) !== old) return { meta: { changes: 0 } };
            rows.set(key, value);
            return { meta: { changes: 1 } };
          }
          if (sql.includes('json_set')) {
            const [status, intentKey, paymentId] = params;
            const current = JSON.parse(rows.get(intentKey));
            if (current.paymentId !== paymentId) return { meta: { changes: 0 } };
            current.status = status;
            rows.set(intentKey, JSON.stringify(current));
            return { meta: { changes: 1 } };
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
      };
    },
  };
  const context = vm.createContext({ crypto: webcrypto, Request, Response, Headers, URL, TextEncoder, TextDecoder, AbortController, btoa, atob, console, setTimeout, clearTimeout });
  const source = fs.readFileSync(require.resolve('../worker.js'), 'utf8').replace('export default {', 'globalThis.worker = {');
  vm.runInContext(source + '\nglobalThis.claim = claimAsaasIntent; globalThis.setStatus = setAsaasIntentStatus;', context);
  const env = { GALLERY_DB: db };
  const first = await Promise.all([
    context.claim(env, 'quote:q1', { id: 'pay_1' }),
    context.claim(env, 'quote:q1', { id: 'pay_2' }),
  ]);
  assert.deepEqual(first, [true, false]);
  assert.equal(await context.claim(env, 'quote:q1', { id: 'pay_3' }), false);
  await context.setStatus(env, 'quote:q1', 'pay_1', 'rejected');
  const retry = await Promise.all([
    context.claim(env, 'quote:q1', { id: 'pay_3' }),
    context.claim(env, 'quote:q1', { id: 'pay_4' }),
  ]);
  assert.equal(retry.filter(Boolean).length, 1);
});

test('uncertain creation recovers the same charge without posting a second one', async () => {
  let requests = 0;
  const app = setup({}, async (url, options = {}) => {
    requests += 1;
    assert.equal(options.method, undefined);
    if (url.includes('/customers?')) {
      return new Response(JSON.stringify({ data: [{
        id: 'cus_1', cpfCnpj: '12345678901',
        externalReference: new URL(url).searchParams.get('externalReference'),
      }] }), { status: 200 });
    }
    assert.match(url, /\/payments\?externalReference=local_1/);
    return new Response(JSON.stringify({ data: [{
      id: 'pay_123', customer: 'cus_1', externalReference: 'local_1',
      value: 100, invoiceUrl: 'https://sandbox.asaas.com/i/example', status: 'PENDING',
    }] }), { status: 200 });
  });
  const payment = { id: 'local_1', quoteId: 'quote_1', amountCents: 10000, status: 'creating', environment: 'sandbox' };
  app.dbRows.set('asaas_intent:quote:quote_1', JSON.stringify({
    paymentId: payment.id, payment, status: 'creating', createdAt: Date.now() - 30000,
  }));
  const recovered = await app.recover(app.env, 'quote:quote_1', payment,
    { id: 'client_1', document: '12345678901' }, '', 'quote', 'quote_1');
  assert.equal(recovered.status, 'pending');
  assert.equal(recovered.providerPaymentId, 'pay_123');
  assert.equal(app.read('asaas_payment:sandbox:pay_123').id, 'quote_1');
  assert.equal(JSON.parse(app.dbRows.get('asaas_intent:quote:quote_1')).status, 'pending');
  assert.equal(requests, 2);
});

test('uncertain creation with no remote charge does not post another charge', async () => {
  const app = setup({}, async (url, options = {}) => {
    assert.equal(options.method, undefined);
    if (url.includes('/customers?')) {
      return new Response(JSON.stringify({ data: [{
        id: 'cus_1', cpfCnpj: '12345678901',
        externalReference: new URL(url).searchParams.get('externalReference'),
      }] }), { status: 200 });
    }
    assert.match(url, /\/payments\?externalReference=local_1/);
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  });
  const payment = { id: 'local_1', amountCents: 10000, status: 'creating', environment: 'sandbox' };
  app.dbRows.set('asaas_intent:quote:quote_1', JSON.stringify({
    paymentId: payment.id, payment, status: 'creating', createdAt: Date.now() - 30000,
  }));
  assert.equal(await app.recover(app.env, 'quote:quote_1', payment,
    { id: 'client_1', document: '12345678901' }, '', 'quote', 'quote_1'), null);
  assert.equal(JSON.parse(app.dbRows.get('asaas_intent:quote:quote_1')).status, 'creating');
});

test('concurrent paid webhooks cannot complete the same quote twice', async () => {
  let releaseFetch;
  let signalFetch;
  const fetchStarted = new Promise(resolve => { signalFetch = resolve; });
  const app = setup({}, async () => {
    signalFetch();
    await new Promise(resolve => { releaseFetch = resolve; });
    return new Response(JSON.stringify({
      id: 'pay_123', status: 'CONFIRMED', value: 100, externalReference: 'local_1',
    }), { status: 200 });
  });
  seedTestPayment(app, {
    quoteVersion: 2, acceptanceHash: 'hash_1',
  });
  seedTestQuote(app, {
    status: 'pending_payment', version: 2,
    acceptance: { hash: 'hash_1' }, acceptanceEmails: { sentAt: 'already-sent' },
  });
  const request = new Request('https://example.test');
  const first = app.reconcile(app.env, request, 'pay_123', 'sandbox');
  await fetchStarted;
  const second = await app.reconcile(app.env, request, 'pay_123', 'sandbox');
  assert.equal(second.reason, 'reconciliation_in_progress');
  releaseFetch();
  assert.equal((await first).approved, true);
  assert.equal(app.read('private_quote_events:quote_1').length, 1);
});

test('paid gallery recovers after its selection was saved but payment update failed', async () => {
  const app = setup({
    id: 'pay_123', status: 'CONFIRMED', value: 100, externalReference: 'local_1',
  });
  app.seed('asaas_payment:sandbox:pay_123', { kind: 'gallery', id: 'local_1' });
  app.dbRows.set('private_client:client_1', JSON.stringify({ id: 'client_1', isTest: true }));
  app.dbRows.set('private_gallery_payment:local_1', JSON.stringify({
    id: 'local_1', galleryId: 'gallery_1', provider: 'asaas',
    environment: 'sandbox', providerPaymentId: 'pay_123', amountCents: 10000, status: 'pending',
    approvedNotificationSentAt: 'already-sent',
  }));
  app.dbRows.set('private_gallery:gallery_1', JSON.stringify({
    id: 'gallery_1', clientId: 'client_1', status: 'editing', selectionPaymentId: 'local_1',
    selectionCompletedAt: '2026-09-23T00:00:00.000Z', selectionRevision: 1,
  }));
  app.dbRows.set('private_gallery_events:gallery_1', JSON.stringify([
    { action: 'pagamento_aprovado', details: { paymentId: 'local_1' } },
  ]));
  const result = await app.reconcile(app.env, new Request('https://example.test'), 'pay_123', 'sandbox');
  assert.equal(result.approved, true);
  assert.equal(JSON.parse(app.dbRows.get('private_gallery_payment:local_1')).status, 'approved');
  assert.equal(JSON.parse(app.dbRows.get('private_gallery:gallery_1')).selectionRevision, 1);
  assert.equal(JSON.parse(app.dbRows.get('private_gallery_events:gallery_1')).length, 1);
});
