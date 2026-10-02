import {readdir} from 'node:fs/promises';
import {join,posix} from 'node:path';
import {beerImageSource} from '../src/beer-image-source.mjs';

export function displayImagePaths(catalog) {
  const paths = new Set();
  for (const beer of catalog.beers) {
    // YearFilter also shows thumbnails for the "unknown year" selection.
    for (const path of [beerImageSource(beer), beerImageSource(beer,'original'),
      beerImageSource(beer,'thumbnail'), beer.imageThumbnail]) {
      if (!path) continue;
      if (!path.startsWith('/images/') || path.split('/').includes('..'))
        throw new Error(`Unexpected display image: ${path}`);
      paths.add(path);
    }
  }
  return paths;
}

export async function publicFiles(root, directory) {
  const files = [];
  const visit = async folder => {
    for (const entry of await readdir(join(root,'public',folder),{withFileTypes:true})) {
      const path = `${folder}/${entry.name}`;
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(`/${path}`);
      else throw new Error(`Unsupported public asset: ${path}`);
    }
  };
  await visit(directory);
  return files;
}

/** Source files remain in the repository; only the published copy gets archive URLs. */
export function createArchiveRewriter({archivedPaths, retainedPaths, revision}) {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('An immutable Git commit is required for the asset archive');
  const archived = new Set(archivedPaths), retained = new Set(retainedPaths);
  const rawRoot = `https://raw.githubusercontent.com/zijianz-nv/brew-atlas/${revision}/public`;
  const treeRoot = `https://github.com/zijianz-nv/brew-atlas/tree/${revision}/public`;
  const normalize = input => {
    if (/^https?:|^\/\//i.test(input)) return null;
    const path = input.replace(/^\/?public\//,'/').replace(/^(images|data-sources)\//,'/$1/');
    return /^\/(images|data-sources)\//.test(path) ? path : null;
  };
  const reference = input => {
    const match = input.match(/^([^?#]+)([?#].*)?$/);
    if (!match) return input;
    const path = normalize(match[1]), suffix = match[2] || '';
    if (!path || retained.has(path)) return input;
    if (archived.has(path)) return rawRoot + path.split('/').map(encodeURIComponent).join('/') + suffix;
    // Directory references in notices are browseable archive links.
    if (path.endsWith('/') && [...archived].some(asset => asset.startsWith(path)))
      return treeRoot + path.split('/').map(encodeURIComponent).join('/') + suffix;
    return input;
  };
  const text = (input,documentPath='/') => input.replace(/(?<![\w:/.-])(?:\/?public\/|\/)?(?:images|data-sources)\/[^\s"'`<>()[\]{}]+/g,
    token => {
      const output = reference(token);
      if (output !== token) return output;
      const trimmed = token.replace(/[.,;:]+$/,'');
      return reference(trimmed) + token.slice(trimmed.length);
    }).replace(/\]\(([^\s)]+)\)/g,(link,target)=>{
      if (/^(?:[a-z]+:|\/\/|#)/i.test(target)) return link;
      const path=posix.resolve(posix.dirname(documentPath),target),mapped=reference(path);
      return mapped===path?link:`](${mapped})`;
    });
  const json = value => {
    if (typeof value === 'string') return reference(value);
    if (Array.isArray(value)) return value.map(json);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key,item]) => [reference(key),json(item)]));
  };
  return {reference,text,json,rawRoot,treeRoot};
}
