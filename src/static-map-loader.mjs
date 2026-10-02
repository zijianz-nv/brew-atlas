// GitHub Pages does not configure Content-Encoding for our static gzip sidecar.
// Request and decode it explicitly, retaining the ordinary GeoJSON for older
// browsers and previews whose packaging has not generated sidecars yet.
export async function loadStaticMap(url, {
  signal,
  fetchImpl = globalThis.fetch,
  DecompressionStreamImpl = globalThis.DecompressionStream,
} = {}) {
  const validate = data => {
    if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error('Invalid map geometry');
    return data;
  };
  const plain = async () => {
    const response = await fetchImpl(url, { signal });
    if (!response.ok) throw new Error(`Map unavailable (${response.status})`);
    return validate(await response.json());
  };
  if (typeof DecompressionStreamImpl !== 'function') return plain();
  const response = await fetchImpl(url.replace(/([?#]|$)/, '.gz$1'), { signal });
  if (response.status === 404) return plain();
  if (!response.ok) throw new Error(`Map unavailable (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (signal?.aborted) throw new DOMException('Map loading aborted', 'AbortError');
  // Some hosts already apply Content-Encoding, which Fetch transparently
  // decodes. Do not try to decompress an already-decoded JSON response twice.
  const json = bytes[0] === 0x1f && bytes[1] === 0x8b
    ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStreamImpl('gzip'))).json()
    : JSON.parse(new TextDecoder().decode(bytes));
  if (signal?.aborted) throw new DOMException('Map loading aborted', 'AbortError');
  return validate(json);
}
