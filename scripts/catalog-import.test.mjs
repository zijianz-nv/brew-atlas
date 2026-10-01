import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runCatalogImport, importPlan } from './catalog-import.mjs';

const key = '11111111-aaaa-bbbb-cccc-222222222222';
const ids = ['aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002'];
const usage = { object: 'usage', year: 2026, month: 9, count: 0, request_limit: 1000, request_buffer: 50 };
const billing = { object: 'billing', billing_enabled: false, monthly_spend_cap_cents: 5000, card: { last4: '4242' } };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const rows = ids.map(id => ({ id, name: `Fixture ${id.slice(-1)}`, last_modified: 1 }));

async function fixture(t, overrides = {}) {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'catalog-import-test-'));
  t.after(() => fs.rm(projectDir, { recursive: true, force: true }));
  const calls = [];
  const fetchImpl = async (href, opts) => {
    const u = new URL(href); calls.push(u);
    assert.equal(u.origin, 'https://api.catalog.beer');
    assert.equal(opts.method, 'GET'); assert.equal(opts.redirect, 'error');
    assert.equal(opts.headers.Authorization, `Basic ${Buffer.from(`${key}:`).toString('base64')}`);
    if (u.pathname === '/usage/my-usage') return json(overrides.usage ?? usage);
    if (u.pathname === '/billing') return json(overrides.billing ?? billing);
    if (u.pathname === '/beer') return json(overrides.page ?? { object: 'list', url: '/beer', has_more: false, data: rows });
    if (overrides.failure) return json({ error: true }, overrides.failure);
    return json({ object: 'beer', id: u.pathname.split('/').at(-1), name: 'Fixture beer', brewer: { id: 'bbbbbbbb-0000-0000-0000-000000000001', name: 'Fixture brewery' }, description: null });
  };
  const run = (opts = {}) => runCatalogImport({ projectDir, env: { CATALOG_BEER_API_KEY: key }, fetchImpl, target: 2, ...opts });
  return { projectDir, calls, run };
}

test('missing key and offline plan do not touch network or create data', async t => {
  const f = await fixture(t);
  const result = await f.run({ env: {} });
  assert.equal(result.status, 'skipped'); assert.equal(f.calls.length, 0);
  assert.deepEqual(await fs.readdir(f.projectDir), []);
  assert.equal(importPlan().minimumCountedRequests, 10020);
});

test('budget stops with pending details; subsequent run resumes without refetching list', async t => {
  const f = await fixture(t);
  const first = await f.run({ maxRequests: 2 });
  assert.equal(first.reason, 'run_request_budget_exhausted'); assert.equal(first.importedDetails, 1); assert.equal(first.countedRequests, 2);
  const second = await f.run({ maxRequests: 2 });
  assert.equal(second.status, 'target_reached'); assert.equal(second.importedDetails, 1); assert.equal(second.totalStagedDetails, 2);
  assert.equal(f.calls.filter(u => u.pathname === '/beer').length, 1);
  const root = path.join(f.projectDir, '.runtime/catalog-import');
  const raw = await fs.readFile(path.join(root, 'beers', `${ids[0]}.json`), 'utf8');
  assert.equal(JSON.parse(raw).data.description, null); assert(!raw.includes(key)); assert(!raw.includes('4242'));
  assert.deepEqual(await fs.readdir(f.projectDir), ['.runtime']);
});

test('never consume grace buffer, even if server offers it', async t => {
  const f = await fixture(t, { usage: { ...usage, count: 1000, request_limit: 1500, request_buffer: 500 } });
  const result = await f.run();
  assert.equal(result.reason, 'free_allowance_exhausted'); assert.equal(result.countedRequests, 0);
  assert(f.calls.every(u => u.pathname !== '/beer'));
});

test('enabled paid usage blocks before any counted call; billing card is not persisted', async t => {
  const f = await fixture(t, { billing: { ...billing, billing_enabled: true } });
  const result = await f.run();
  assert.equal(result.reason, 'paid_usage_enabled_zero_cost_mode_only'); assert.equal(result.countedRequests, 0);
  const state = await fs.readFile(path.join(f.projectDir, '.runtime/catalog-import/checkpoint.json'), 'utf8');
  assert(!state.includes('4242')); assert(!state.includes(key));
});

test('local accounting protects against a stale usage counter', async t => {
  const f = await fixture(t, { usage: { ...usage, count: 999 } });
  const result = await f.run();
  assert.equal(result.reason, 'free_allowance_exhausted'); assert.equal(result.countedRequests, 1); assert.equal(result.importedDetails, 0);
});

for (const status of [401, 402, 429]) test(`HTTP ${status} stops, preserves pending item and never retries`, async t => {
  const f = await fixture(t, { failure: status });
  const result = await f.run();
  assert.equal(result.reason, `http_${status}`); assert.equal(result.pendingDetails, 2); assert.equal(result.countedRequests, 2);
  assert.equal(f.calls.filter(u => u.pathname.startsWith('/beer/')).length, 1);
});

test('invalid beer id cannot become a filename', async t => {
  const f = await fixture(t, { page: { object: 'list', url: '/beer', has_more: false, data: [{ ...rows[0], id: '../../outside' }] } });
  const result = await f.run();
  assert.equal(result.reason, 'invalid_beer_id'); assert.equal(result.importedDetails, 0);
});

test('null list item is rejected as schema error', async t => {
  const f = await fixture(t, { page: { object: 'list', url: '/beer', has_more: false, data: [null] } });
  const result = await f.run();
  assert.equal(result.reason, 'invalid_list_item'); assert.equal(result.importedDetails, 0);
});

test('untrusted cursor stays encoded in a fixed-origin query and repeated cursor stops', async t => {
  const cursor = 'https://evil.invalid/?x=../';
  const f = await fixture(t, { page: { object: 'list', url: '/beer', has_more: true, next_cursor: cursor, data: [rows[0]] } });
  const result = await f.run({ target: 2 });
  assert.equal(result.reason, 'repeated_or_empty_page');
  const next = f.calls.filter(u => u.pathname === '/beer').at(-1);
  assert.equal(next.searchParams.get('cursor'), cursor); assert.equal(next.origin, 'https://api.catalog.beer');
});

test('runtime symlink is rejected before network', async t => {
  const f = await fixture(t);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'catalog-outside-'));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.symlink(outside, path.join(f.projectDir, '.runtime'));
  const result = await f.run();
  assert.equal(result.reason, 'unsafe_runtime_directory'); assert.equal(f.calls.length, 0);
});
