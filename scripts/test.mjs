#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const cwd = resolve(__dirname, '..');

function run(cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: 'pipe' });
    let out = '';
    let err = '';
    child.stdout.on('data', d => { out += d.toString('utf8'); });
    child.stderr.on('data', d => { err += d.toString('utf8'); });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(`Command failed: ${cmd} ${args.join(' ')}\n${err}`));
      } else {
        resolve({ out, err });
      }
    });
  });
}

(async () => {
  await run('npm', ['run', 'build']);
  const { composePlanInstruction, composeReviewInstruction } = await import(resolve(cwd, 'dist/compose.js'));

  // composePlanInstruction
  const plan = composePlanInstruction('Improve DX', 'No breaking changes', ['src/server.ts', 'README.md']);
  assert(plan.includes('Improve DX'));
  assert(plan.includes('No breaking changes'));
  assert(plan.includes('Paths in focus'));

  // composeReviewInstruction
  const revWithTitle = composeReviewInstruction('PR Review', ['src/server.ts'], false);
  assert(revWithTitle.includes('PR Review'));
  assert(revWithTitle.includes('Files referenced'));

  const revWithDiff = composeReviewInstruction(undefined, undefined, true);
  assert(revWithDiff.includes('unified diff'));

  console.log('All tests passed.');
})();

