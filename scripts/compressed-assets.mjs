import {readFile, readdir, writeFile} from 'node:fs/promises';
import {extname, join} from 'node:path';
import {gzipSync} from 'node:zlib';

/** Keep the originals for fallback; static gzip URLs also work without server negotiation. */
export async function writeStaticGzipSidecars(directory, extensions) {
  const wanted = new Set(extensions), results = [];
  const visit = async folder => {
    const entries = (await readdir(folder, {withFileTypes:true})).sort((a,b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && wanted.has(extname(entry.name))) {
        const source = await readFile(path), gzip = gzipSync(source, {level:9});
        await writeFile(`${path}.gz`, gzip);
        results.push({path, bytes:source.length, gzipBytes:gzip.length});
      }
    }
  };
  await visit(directory);
  return results;
}
