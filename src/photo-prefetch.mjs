/** Use precisely the map's small image choice; never request imageOriginal. */
export function mapPhotoSource(beer) {
  if (!beer || typeof beer !== 'object') return null;
  const source = beer.imageThumbnail || beer.image;
  return typeof source === 'string' && source.trim() ? source : null;
}

/**
 * A small, replaceable warm-up queue for the next visible hemisphere.
 * Candidates are supplied in priority order by the camera owner. It starts
 * disabled so creating/updating it cannot compete with the first map photos.
 * An update replaces queued work, while active requests finish without camera
 * changes continually aborting them. No DOM nodes or catalog requests are used.
 */
export function createPhotoPrefetcher({concurrency = 4, maxQueued = 48, enabled = false,
  createImage = () => new Image(), onSettled} = {}) {
  const limit = Math.max(1, Math.min(8, Math.floor(Number(concurrency) || 4)));
  const queueLimit = Math.max(1, Math.min(256, Math.floor(Number(maxQueued) || 48)));
  const active = new Map(), completed = new Map(), failed = new Set();
  let queue = [], disposed = false, running = Boolean(enabled), pumping = false;

  const release = (job, abort = false) => {
    job.image.onload = null;
    job.image.onerror = null;
    if (abort) {
      // Removing the attribute cancels an unattached HTMLImageElement without
      // assigning an empty URL (which can request the document in some clients).
      try { job.image.removeAttribute?.('src'); } catch { /* already released */ }
    }
  };
  const finish = (job, ok) => {
    if (disposed || active.get(job.source) !== job) return;
    active.delete(job.source);
    release(job);
    if (ok) completed.set(job.source, job.image);
    else failed.add(job.source);
    // Keep decoded thumbnails warm with a bounded retained-image count. Source
    // keys stay remembered after eviction so rotation does not redownload them.
    let retained = 0;
    for (const [source, image] of [...completed].reverse()) {
      if (image && ++retained > 96) completed.set(source, null);
    }
    try { onSettled?.({source: job.source, ready: ok}); } finally { pump(); }
  };
  const loaded = job => {
    if (job.decoding || active.get(job.source) !== job) return;
    job.decoding = true;
    if (typeof job.image.decode !== 'function') { finish(job, true); return; }
    // decode() rejection does not invalidate a successful load; browsers can
    // reject if a cached resource is replaced while a decode promise is pending.
    try { Promise.resolve(job.image.decode()).then(() => finish(job, true), () => finish(job, true)); }
    catch { finish(job, true); }
  };
  function pump() {
    if (disposed || !running || pumping) return;
    pumping = true;
    try {
      while (running && !disposed && active.size < limit && queue.length) {
        const source = queue.shift();
        if (completed.has(source) || failed.has(source) || active.has(source)) continue;
        let image;
        try { image = createImage(); } catch { failed.add(source); continue; }
        if (!image) { failed.add(source); continue; }
        const job = {source, image, decoding: false};
        active.set(source, job);
        image.decoding = 'async';
        image.fetchPriority = 'low';
        image.referrerPolicy = 'no-referrer';
        image.onload = () => loaded(job);
        image.onerror = () => finish(job, false);
        try {
          image.src = source;
          if (image.complete && image.naturalWidth > 0) loaded(job);
        } catch { finish(job, false); }
      }
    } finally { pumping = false; }
  }
  const clearPending = () => {
    queue = [];
    const jobs = [...active.values()];
    active.clear();
    for (const job of jobs) release(job, true);
  };
  return Object.freeze({
    update(beers = []) {
      if (disposed) return;
      const seen = new Set();
      queue = [];
      for (const beer of beers) {
        const source = mapPhotoSource(beer);
        if (!source || seen.has(source) || completed.has(source) || failed.has(source) || active.has(source)) continue;
        seen.add(source); queue.push(source);
        if (queue.length >= queueLimit) break;
      }
      pump();
    },
    markLoaded(beersOrSources = []) {
      if (disposed) return;
      for (const value of beersOrSources) {
        const source = typeof value === 'string' ? value : mapPhotoSource(value);
        if (!source) continue;
        if (!completed.has(source)) completed.set(source, null);
        failed.delete(source);
        const job = active.get(source);
        if (job) { active.delete(source); release(job, true); }
      }
      queue = queue.filter(source => !completed.has(source));
      pump();
    },
    setEnabled(value) {
      if (disposed) return;
      running = Boolean(value);
      if (running) pump();
      else clearPending();
    },
    cancel: clearPending,
    dispose() { disposed = true; running = false; clearPending(); completed.clear(); failed.clear(); },
    snapshot() { return {enabled: running, disposed, active: active.size, queued: queue.length,
      loaded: completed.size, failed: failed.size, activeSources: [...active.keys()], queuedSources: [...queue]}; },
  });
}
