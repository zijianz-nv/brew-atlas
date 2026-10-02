// Optional asset regeneration; normal build/test needs no browser dependency.
// Renders our procedural Three.js geometry, never transforms product photos.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let playwright;
try { playwright = createRequire(import.meta.url)('playwright'); }
catch { playwright = createRequire(`${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json`)('playwright'); }
const preview = `<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js"}}</script><script type="module">
import * as THREE from 'three';
import { createIngredientField as createIngredientGarden, disposeIngredientGardenCache } from '/src/ingredient-gardens.mjs';
import { INGREDIENT_TYPES } from '/src/ingredient-regions.mjs';
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(320, 320); renderer.setClearColor(0, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
document.body.append(renderer.domElement);
window.thumbnails = [];
for (const { id } of INGREDIENT_TYPES) {
  const scene = new THREE.Scene(), garden = createIngredientGarden(id);
  scene.add(garden, new THREE.HemisphereLight('#fff2d8', '#294b39', 2));
  const sun = new THREE.DirectionalLight('#ffe6bf', 2.8); sun.position.set(-3, 6, 4); scene.add(sun);
  const rim = new THREE.DirectionalLight('#bbddc6', 1.5); rim.position.set(4, 3, -3); scene.add(rim);
  const bounds = new THREE.Box3().setFromObject(garden), center = bounds.getCenter(new THREE.Vector3());
  const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .1, 30);
  camera.position.copy(center).add(new THREE.Vector3(4, 3.4, 5)); camera.lookAt(center); camera.updateMatrixWorld();
  let extent = 0;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const p = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    extent = Math.max(extent, Math.abs(p.x), Math.abs(p.y));
  }
  extent *= 1.07;
  camera.left = -extent; camera.right = extent; camera.top = extent; camera.bottom = -extent; camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  window.thumbnails.push({ id, image: renderer.domElement.toDataURL('image/png') });
}
disposeIngredientGardenCache(); renderer.dispose(); window.ready = true;
</script>`;

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end(preview); return; }
    const path = resolve(root, `.${pathname}`);
    if (!path.startsWith(`${root}/`)) { response.writeHead(403).end(); return; }
    response.setHeader('Content-Type', ['.js', '.mjs'].includes(extname(path)) ? 'text/javascript' : 'application/octet-stream');
    response.end(await readFile(path));
  } catch { response.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.ready, { timeout: 30_000 });
  if (errors.length) throw new Error(errors.join('\n'));
  const images = await page.evaluate(() => window.thumbnails);
  const directory = resolve(root, 'public/images/ingredients');
  await mkdir(directory, { recursive: true });
  for (const { id, image } of images) {
    const bytes = Buffer.from(image.split(',')[1], 'base64');
    await writeFile(resolve(directory, `${id}.png`), bytes);
    console.log(`${id}.png: ${bytes.length} bytes`);
  }
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
