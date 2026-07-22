import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const assets = join(process.cwd(), 'dist', 'assets');
const mainChunks = readdirSync(assets).filter((name) => /^index-.*\.js$/.test(name));
if (mainChunks.length !== 1) {
  throw new Error(`Expected one main index chunk, found: ${mainChunks.join(', ') || 'none'}`);
}

const mainChunk = mainChunks[0];
const bytes = statSync(join(assets, mainChunk)).size;
const budget = 100 * 1024;
if (bytes > budget) {
  throw new Error(`Main bundle ${mainChunk} is ${(bytes / 1024).toFixed(1)} KiB; budget is 100 KiB.`);
}

console.log(`Bundle budget passed: ${mainChunk} ${(bytes / 1024).toFixed(1)} KiB / 100 KiB.`);