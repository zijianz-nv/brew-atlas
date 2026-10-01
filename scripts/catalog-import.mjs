#!/usr/bin/env node
// Official GET-only staging importer. This module never writes public/ or dist/.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://api.catalog.beer';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LICENSE = 'https://creativecommons.org/licenses/by/4.0/';
const HELP = `Catalog.beer 原始目录暂存导入器（Node 20.3+，仅官方 GET，零收费模式）
用法：node scripts/catalog-import.mjs [--plan] [--target 10000] [--max-requests 50]
      node scripts/catalog-import.mjs --help

唯一凭据入口：环境变量 CATALOG_BEER_API_KEY。缺少时 skipped，不联网、不生成样例。
默认每次最多 50 个计入额度的请求；仅使用 min(request_limit, 1000) 内免费额度。
先读免费 /usage/my-usage 和 /billing；允许付费且消费上限大于零时停止。
不会注册、开通付费、修改账户、自动重试，或把原始数据导入演示页面。
--plan 完全离线；--target 是暂存详情目标，不保证这些记录均为精酿。
数据写入项目 .runtime/catalog-import，后续运行自动续跑。`;

class Stop extends Error {
  constructor(reason) { super(reason); this.reason = reason; }
}

function integer(value, min, max, name) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Stop(`invalid_${name}`);
  return value;
}

function cursorValue(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || !value.length || value.length > 4096 || /[\x00-\x1f\x7f]/.test(value)) throw new Stop('invalid_cursor');
  return value;
}

function beerId(value) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Stop('invalid_beer_id');
  return value.toLowerCase();
}

export function importPlan(target = 10000, maxRequests = 50) {
  integer(target, 1, 1000000, 'target');
  integer(maxRequests, 1, 1000, 'max_requests');
  const listRequests = Math.ceil(target / 500);
  return {
    status: 'plan', networkRequests: 0, targetDetails: target, pageSize: 500,
    listRequests, detailRequests: target, minimumCountedRequests: target + listRequests,
    maxCountedRequestsPerRun: maxRequests,
    note: '按默认每页 500 条、不重试估算；名单页只有 id/name/last_modified。1 万条完整详情至少 10020 个计入额度请求，不含酒厂、地点、清洗补充。此工具不会使用付费额度。',
  };
}

async function regularFile(file) {
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Stop('unsafe_runtime_file');
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function directory(parent, name) {
  const dir = path.join(parent, name);
  try { await fs.mkdir(dir, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const stat = await fs.lstat(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Stop('unsafe_runtime_directory');
  return dir;
}

async function atomicJson(file, data) {
  await regularFile(file);
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await fs.rename(temp, file);
  } finally { await fs.rm(temp, { force: true }).catch(() => {}); }
}

function validateState(state) {
  if (state.version !== 1 || state.provider !== 'catalog.beer' || typeof state.listingComplete !== 'boolean') throw new Stop('invalid_checkpoint');
  state.cursor = cursorValue(state.cursor);
  for (const key of ['pending', 'completed']) {
    if (!Array.isArray(state[key]) || state[key].length > 1000000) throw new Stop('invalid_checkpoint');
    state[key] = [...new Set(state[key].map(beerId))];
  }
  if (!Array.isArray(state.seenCursors) || state.seenCursors.length > 100000) throw new Stop('invalid_checkpoint');
  state.seenCursors.forEach(cursorValue);
  integer(state.pages, 0, 1000000, 'checkpoint_pages');
  integer(state.countedAttempts, 0, Number.MAX_SAFE_INTEGER, 'checkpoint_attempts');
  return state;
}

export async function runCatalogImport({
  env = process.env, fetchImpl = globalThis.fetch, projectDir = PROJECT,
  target = 10000, maxRequests = 50, signal,
} = {}) {
  integer(target, 1, 1000000, 'target');
  integer(maxRequests, 1, 1000, 'max_requests');
  // Deliberately check before filesystem setup or any network call.
  const key = env.CATALOG_BEER_API_KEY;
  if (!key) return { status: 'skipped', reason: 'missing_CATALOG_BEER_API_KEY', networkRequests: 0, countedRequests: 0, importedDetails: 0 };
  if (typeof key !== 'string' || /[\s:\x00-\x1f]/.test(key) || key.length > 4096) return { status: 'stopped', reason: 'invalid_key_format', networkRequests: 0, countedRequests: 0 };
  if (typeof fetchImpl !== 'function' || typeof AbortSignal.any !== 'function') return { status: 'stopped', reason: 'requires_node_20_3' };

  let state, checkpoint, lock, lockPath, requests = 0, counted = 0, added = 0;
  let floorCount = 0, floorPeriod = null;
  const authorization = `Basic ${Buffer.from(`${key}:`).toString('base64')}`;

  async function request(endpoint) {
    if (signal?.aborted) throw new Stop('interrupted');
    // All endpoint paths are built internally; response URLs are never followed.
    const url = new URL(endpoint, ORIGIN);
    if (url.origin !== ORIGIN || !(['/usage/my-usage', '/billing', '/beer'].includes(url.pathname) || /^\/beer\/[0-9a-f-]{36}$/.test(url.pathname))) throw new Stop('unsafe_endpoint');
    requests++;
    let response;
    try {
      response = await fetchImpl(url.href, {
        method: 'GET', redirect: 'error',
        headers: { Accept: 'application/json', Authorization: authorization, 'User-Agent': 'BrewAtlasCatalogImport/1.0' },
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(25000)]) : AbortSignal.timeout(25000),
      });
    } catch { throw new Stop(signal?.aborted ? 'interrupted' : 'network_error'); }
    if (!response.ok) throw new Stop(`http_${response.status}`);
    let text;
    try { text = await response.text(); } catch { throw new Stop('response_read_error'); }
    if (text.length > 8 * 1024 * 1024) throw new Stop('response_too_large');
    // Never retain a provider response that unexpectedly echoes a credential.
    if (text.includes(key) || text.includes(authorization.slice(6))) throw new Stop('unexpected_credential_echo');
    try {
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || data.error === true) throw new Stop('api_error');
      return data;
    } catch (error) { if (error instanceof Stop) throw error; throw new Stop('invalid_json'); }
  }

  async function preflight() {
    // Both endpoints are documented as exempt. No card data is stored or logged.
    const usage = await request('/usage/my-usage');
    if (usage.object !== 'usage') throw new Stop('invalid_usage_schema');
    integer(usage.count, 0, Number.MAX_SAFE_INTEGER, 'usage_count');
    integer(usage.request_limit, 0, Number.MAX_SAFE_INTEGER, 'usage_limit');
    integer(usage.year, 2000, 9999, 'usage_year');
    integer(usage.month, 1, 12, 'usage_month');
    const billing = await request('/billing');
    if (billing.object !== 'billing' || typeof billing.billing_enabled !== 'boolean') throw new Stop('invalid_billing_schema');
    integer(billing.monthly_spend_cap_cents, 0, Number.MAX_SAFE_INTEGER, 'billing_cap');
    if (billing.billing_enabled && billing.monthly_spend_cap_cents > 0) throw new Stop('paid_usage_enabled_zero_cost_mode_only');
    const period = `${usage.year}-${usage.month}`;
    floorCount = period === floorPeriod ? Math.max(floorCount, usage.count) : usage.count;
    floorPeriod = period;
    // Grace request_buffer is intentionally not used, nor any allowance > 1,000.
    const remaining = Math.min(1000, usage.request_limit) - floorCount;
    if (remaining <= 0) throw new Stop('free_allowance_exhausted');
    state.freeUsage = { year: usage.year, month: usage.month, observedCount: usage.count, freeLimit: Math.min(1000, usage.request_limit), checkedAt: new Date().toISOString() };
  }

  async function countedRequest(endpoint) {
    if (counted >= maxRequests) throw new Stop('run_request_budget_exhausted');
    await preflight();
    counted++;
    floorCount++;
    state.countedAttempts++;
    // Count an attempted request before sending; uncertain failures never retry automatically.
    await atomicJson(checkpoint, state);
    return request(endpoint);
  }

  try {
    const project = await fs.realpath(projectDir);
    const runtime = await directory(project, '.runtime');
    const root = await directory(runtime, 'catalog-import');
    const pages = await directory(root, 'pages');
    const beers = await directory(root, 'beers');
    lockPath = path.join(root, 'import.lock');
    try { lock = await fs.open(lockPath, 'wx', 0o600); } catch (error) { if (error.code === 'EEXIST') throw new Stop('another_import_or_stale_lock'); throw error; }
    await lock.writeFile(`${process.pid}\n`);
    checkpoint = path.join(root, 'checkpoint.json');
    if (await regularFile(checkpoint)) {
      let parsed;
      try { parsed = JSON.parse(await fs.readFile(checkpoint, 'utf8')); } catch { throw new Stop('invalid_checkpoint_json'); }
      state = validateState(parsed);
    } else {
      state = { version: 1, provider: 'catalog.beer', cursor: null, listingComplete: false, pending: [], completed: [], seenCursors: [], pages: 0, countedAttempts: 0 };
    }
    const done = new Set(state.completed);
    // Checkpoint must not claim files that no longer exist.
    for (const id of done) if (!await regularFile(path.join(beers, `${id}.json`))) throw new Stop('checkpoint_detail_missing');
    state.pending = state.pending.filter(id => !done.has(id));
    while (done.size < target) {
      if (signal?.aborted) throw new Stop('interrupted');
      if (state.pending.length) {
        const id = state.pending[0];
        const detail = await countedRequest(`/beer/${id}`);
        if (detail.object !== 'beer' || beerId(detail.id) !== id || typeof detail.name !== 'string' || !detail.brewer || typeof detail.brewer !== 'object') throw new Stop('invalid_beer_detail');
        const fetchedAt = new Date().toISOString();
        await atomicJson(path.join(beers, `${id}.json`), {
          source: { provider: 'catalog.beer', apiUrl: `${ORIGIN}/beer/${id}`, pageUrl: `https://catalog.beer/beer/${id}`, license: LICENSE, fetchedAt },
          data: detail,
        });
        done.add(id); state.completed.push(id); state.pending.shift(); added++;
        await atomicJson(checkpoint, state);
        continue;
      }
      if (state.listingComplete) break;
      const query = new URL('/beer', ORIGIN);
      query.searchParams.set('count', '500');
      if (state.cursor !== null) query.searchParams.set('cursor', cursorValue(state.cursor));
      const page = await countedRequest(`${query.pathname}${query.search}`);
      if (page.object !== 'list' || page.url !== '/beer' || typeof page.has_more !== 'boolean' || !Array.isArray(page.data) || page.data.length > 500) throw new Stop('invalid_list_schema');
      const ids = page.data.map(row => {
        if (!row || typeof row !== 'object' || typeof row.name !== 'string' || !Number.isSafeInteger(row.last_modified)) throw new Stop('invalid_list_item');
        return beerId(row.id);
      });
      const next = page.has_more ? cursorValue(page.next_cursor) : null;
      if (page.has_more && (!ids.length || next === state.cursor || state.seenCursors.includes(next))) throw new Stop('repeated_or_empty_page');
      await atomicJson(path.join(pages, `page-${String(state.pages + 1).padStart(6, '0')}.json`), {
        source: { provider: 'catalog.beer', apiUrl: query.href, license: LICENSE, fetchedAt: new Date().toISOString() }, data: page,
      });
      if (state.cursor !== null) state.seenCursors.push(state.cursor);
      state.cursor = next; state.listingComplete = !page.has_more; state.pages++;
      state.pending = [...new Set(ids)].filter(id => !done.has(id));
      await atomicJson(checkpoint, state);
    }
    state.status = done.size >= target ? 'target_reached' : 'listing_complete';
    state.updatedAt = new Date().toISOString();
    await atomicJson(checkpoint, state);
    return { status: state.status, networkRequests: requests, countedRequests: counted, importedDetails: added, totalStagedDetails: done.size, pendingDetails: state.pending.length, connected: requests > 0, note: '仅暂存原始详情；未验收为精酿，未导入演示页面。' };
  } catch (error) {
    const reason = error instanceof Stop ? error.reason : 'local_io_error';
    if (state && checkpoint) {
      state.status = 'stopped'; state.stopReason = reason; state.updatedAt = new Date().toISOString();
      await atomicJson(checkpoint, state).catch(() => {});
    }
    return { status: 'stopped', reason, networkRequests: requests, countedRequests: counted, importedDetails: added, totalStagedDetails: state?.completed.length ?? 0, pendingDetails: state?.pending.length ?? 0 };
  } finally {
    if (lock) { await lock.close().catch(() => {}); await fs.rm(lockPath, { force: true }).catch(() => {}); }
  }
}

async function main() {
  let target = 10000, maxRequests = 50, plan = false;
  const args = process.argv.slice(2);
  if (args.includes('--help')) { console.log(HELP); return; }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--plan') plan = true;
    else if (args[i] === '--target') target = Number(args[++i]);
    else if (args[i] === '--max-requests') maxRequests = Number(args[++i]);
    else throw new Stop('unknown_argument');
  }
  importPlan(target, maxRequests); // Validate options before any operation.
  if (plan) { console.log(JSON.stringify(importPlan(target, maxRequests), null, 2)); return; }
  const abort = new AbortController();
  const interrupt = () => abort.abort();
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  try {
    const result = await runCatalogImport({ target, maxRequests, signal: abort.signal });
    console.log(JSON.stringify(result, null, 2));
    if (result.status === 'stopped' && !['run_request_budget_exhausted', 'free_allowance_exhausted', 'interrupted'].includes(result.reason)) process.exitCode = 1;
  } finally { process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(JSON.stringify({ status: 'stopped', reason: error instanceof Stop ? error.reason : 'unexpected_error' })); process.exitCode = 1; });
}
