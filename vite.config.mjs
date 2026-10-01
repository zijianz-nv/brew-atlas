import {defineConfig} from 'vite';
import {normalizeBasePath} from './src/base-path.mjs';

// Package the merged local catalogue and referenced cached images explicitly;
// do not ship unrelated raw research files through Vite's public-directory copy.
export default defineConfig({base:normalizeBasePath(process.env.VITE_BASE_PATH || '/'),build:{copyPublicDir:false}});
