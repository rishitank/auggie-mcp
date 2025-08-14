#!/usr/bin/env node
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const cwd = resolve(__dirname, '..');

(async () => {
  const pkg = JSON.parse(readFileSync(resolve(cwd, 'package.json'), 'utf8'));
  if (!pkg) throw new Error('pkg missing');

  const project = await import(resolve(cwd, 'dist/lib/project.js'));

  // searchInText should find README.md headings
  const hits = await project.searchInText('Auggie MCP', undefined, 5);
  assert(hits.some(h => h.path.toLowerCase() === 'readme.md'));

  // safeReadFile ranges
  const text = await project.safeReadFile('README.md', 1, 2);
  const lines = text.split(/\r?\n/);
  assert(lines.length <= 2);

  // path traversal should throw
  let threw = false;
  try {
    await project.safeReadFile('../README.md');
  } catch {
    threw = true;
  }
  assert(threw, 'expected safeReadFile to throw on traversal');

  console.log('Search/read tests passed.');
})();

