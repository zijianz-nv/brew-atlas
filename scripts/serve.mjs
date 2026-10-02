#!/usr/bin/env node
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(project, 'dist');
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT 必须是 1–65535 的整数。');
  process.exit(1);
}
try {
  if (!(await stat(resolve(dist, 'index.html'))).isFile()) throw new Error('missing HTML');
} catch {
  console.error('尚未找到 dist/index.html，请先在项目目录执行 npm ci 和 npm run build。');
  process.exit(1);
}
const canonicalDist = await realpath(dist);
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8', '.geojson': 'application/geo+json',
};
const contained = path => path === canonicalDist || path.startsWith(canonicalDist + sep);
const plain = (res, status, message) => {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(message);
};

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return plain(res, 405, 'Method not allowed');
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { return plain(res, 400, 'Invalid path'); }
  if (pathname === '/__brew_atlas_health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ app: 'brew-atlas', project, port, pid: process.pid }));
  }
  if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').includes('..')) {
    return plain(res, 403, 'Forbidden');
  }
  try {
    let candidate = resolve(canonicalDist, '.' + pathname);
    if (!contained(candidate)) return plain(res, 403, 'Forbidden');
    let resolvedFile = await realpath(candidate);
    if (!contained(resolvedFile)) return plain(res, 403, 'Forbidden');
    let info = await stat(resolvedFile);
    if (info.isDirectory()) {
      resolvedFile = await realpath(resolve(resolvedFile, 'index.html'));
      if (!contained(resolvedFile)) return plain(res, 403, 'Forbidden');
      info = await stat(resolvedFile);
    }
    if (!info.isFile()) return plain(res, 404, 'Not found');
    const extension = extname(resolvedFile).toLowerCase();
    let encoding;
    const compressible=['.json','.geojson','.js','.mjs','.css','.svg'].includes(extension);
    if (compressible && /(?:^|[,\s])gzip(?:[,\s;]|$)/.test(req.headers['accept-encoding'] || '')) {
      try {
        const compressed = await realpath(resolvedFile + '.gz');
        const compressedInfo = await stat(compressed);
        if (contained(compressed) && compressedInfo.isFile()) {
          resolvedFile = compressed; info = compressedInfo; encoding = 'gzip';
        }
      } catch {}
    }
    res.writeHead(200, {
      'Content-Type': mime[extension] || 'application/octet-stream',
      'Content-Length': info.size,
      ...(compressible ? { 'Vary': 'Accept-Encoding' } : {}),
      ...(encoding ? { 'Content-Encoding': encoding } : {}),
      'Cache-Control': ['.html', '.json', '.geojson'].includes(extension) ? 'no-cache' : 'public, max-age=3600',
    });
    if (req.method === 'HEAD') return res.end();
    const stream = createReadStream(resolvedFile);
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  } catch (error) {
    if (!res.headersSent) plain(res, error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500, 'Not found');
    else res.destroy();
  }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被其他程序占用；请停止该程序或指定 PORT。` : error.message);
  process.exitCode = 1;
});
server.listen(port, '0.0.0.0', () => console.log(`精酿地球已启动：http://127.0.0.1:${port}/ · 局域网访问已开启（端口 ${port}） · PID ${process.pid}`));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    server.closeIdleConnections?.();
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
