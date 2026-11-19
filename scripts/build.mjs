// Builds dist/satelit-widgets.js from src/: one IIFE, comments and indentation stripped. No dependencies.
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = ['src/core.js', 'src/widgets.js'].map((f) => readFileSync(root + f, 'utf8')).join('\n');

// Safe on this code base: no "/*" or "//" line starts inside strings, block comments never hold "*/" early.
const body = src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('//'))
  .join('\n');

const pkg = JSON.parse(readFileSync(root + 'package.json', 'utf8'));
const out = `/*! satelit-widgets ${pkg.version} | MIT | https://satelit.md */\n(function(){'use strict';\n${body}\n})();\n`;

export function build() { return out; }

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(root + 'dist/satelit-widgets.js', out);
  console.log(`dist/satelit-widgets.js ${out.length} bytes, ${gzipSync(out).length} bytes gzipped`);
}
