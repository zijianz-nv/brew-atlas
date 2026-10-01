export const APP_BASE_URL = import.meta.env?.BASE_URL || '/';

export function normalizeBasePath(value = '/') {
  if (typeof value !== 'string') throw new TypeError('Base path must be a string');
  const path = value || '/';
  if (/[:?#\\\s]/.test(path) || path.startsWith('//')) throw new TypeError('Invalid application base path');
  const parts = path.split('/').filter(Boolean);
  for (const part of parts) {
    let decoded;
    try { decoded = decodeURIComponent(part); } catch { throw new TypeError('Invalid application base path'); }
    if (['.', '..'].includes(decoded) || /[/\\]/.test(decoded)) throw new TypeError('Invalid application base path');
  }
  return `/${parts.length ? `${parts.join('/')}/` : ''}`;
}

/** Prefix local resource links only; external URLs and provenance remain intact. */
export function withBasePath(value, baseUrl = APP_BASE_URL) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return value;
  const base = normalizeBasePath(baseUrl);
  if (base === '/' || value === base.slice(0, -1) || value.startsWith(base)) return value;
  return base + value.slice(1);
}

/** Used only to look up reviewed local photo identities across deployment roots. */
export function withoutBasePath(value, baseUrl = APP_BASE_URL) {
  const base = normalizeBasePath(baseUrl);
  return typeof value === 'string' && base !== '/' && value.startsWith(base)
    ? '/' + value.slice(base.length) : value;
}
