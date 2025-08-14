#!/usr/bin/env node
import http from 'node:http';
import { spawn } from 'node:child_process';

const port = process.env.AUGGIE_MCP_HTTP_PORT || '5052';

const serverEnv = {
  ...process.env,
  // AUGGIE_MCP_ALLOW_EXEC intentionally unset
  AUGGIE_MCP_HTTP_PORT: port,
  AUGGIE_MCP_MOCK_STREAM: 'true',
};

const child = spawn('node', ['dist/server.js'], {
  env: serverEnv,
  stdio: ['ignore', 'pipe', 'pipe'],
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const waitHealth = async () => {
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    const ok = await new Promise((resolve) => {
      const req = http.request(
        { hostname: '127.0.0.1', port, path: '/health', method: 'GET' },
        (res) => {
          resolve(res.statusCode === 200);
        },
      );
      req.on('error', () => resolve(false));
      req.end();
    });
    if (ok) return true;
    await wait(100);
  }
  return false;
};

(async () => {
  const healthy = await waitHealth();
  if (!healthy) {
    console.error('Server did not become healthy');
    process.exit(1);
  }

  const payload = JSON.stringify({ args: ['--print', 'mock'] });

  await new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/stream',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode === 403 && body.includes('EXEC_DISABLED')) resolve();
          else reject(new Error(`Expected 403 EXEC_DISABLED, got ${res.statusCode} body=${body}`));
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });

  child.kill('SIGTERM');
  console.log('Negative exec test passed.');
})();
