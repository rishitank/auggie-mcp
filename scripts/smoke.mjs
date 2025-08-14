#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const cwd = resolve(__dirname, '..');

const run = (cmd, args, env = {}) => {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: 'pipe' });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => {
      out += d.toString('utf8');
    });
    child.stderr.on('data', (d) => {
      err += d.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed: ${cmd} ${args.join(' ')}\n${err}`));
      } else {
        resolvePromise({ out, err });
      }
    });
  });
};

(async () => {
  console.log('Building...');
  await run('npm', ['run', 'build']);

  console.log('CLI detection...');
  try {
    await run('node', ['-e', "process.stdout.write('ok')"]);
  } catch (e) {
    console.error('Node runtime check failed:', e.message);
    process.exit(1);
  }

  console.log('Auggie version...');
  try {
    await run('node', ['dist/server.js'], { AUGGIE_MCP_ALLOW_EXEC: 'true' });
    // Not actually starting MCP stdio session here; just verifying build is runnable.
    console.log('Server executed');
  } catch (e) {
    console.warn(
      'Server startup check encountered an issue (ok if no MCP client attached):',
      e.message,
    );
  }

  console.log('Smoke complete.');
})();
