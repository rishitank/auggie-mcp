#!/usr/bin/env node
import http from 'node:http';

const port = process.env.AUGGIE_MCP_HTTP_PORT || '5050';
const data = JSON.stringify({ args: ['--print', 'hello from stream', '--compact'] });

const req = http.request({
  hostname: '127.0.0.1',
  port,
  path: '/stream',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  },
}, (res) => {
  res.setEncoding('utf8');
  res.on('data', (chunk) => process.stdout.write(chunk));
  res.on('end', () => process.stdout.write('\n[stream ended]\n'));
});

req.on('error', (e) => {
  console.error('Request error:', e.message);
});

req.write(data);
req.end();

