import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
import { REPO_ROOT, safeReadFile, findMarkdownFiles, searchInMdFiles, searchInText } from './lib/project.js';
import { execFile, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { composePlanInstruction, composeReviewInstruction } from './compose.js';
import http from 'http';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function runExecFile(cmd: string, args: string[], timeoutMs = 5000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { cwd: REPO_ROOT, timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) return reject({ err, stdout, stderr });
      resolve({ stdout, stderr });
    });
    child.on('error', (err) => reject({ err, stdout: '', stderr: '' }));
  });
}

function sanitizeMaybePath(p?: string): string | undefined {
  if (!p) return p;
  // Treat as a file path only if it looks like one
  if (p.startsWith('.') || p.startsWith('/')) {
    const abs = path.resolve(REPO_ROOT, p);
    if (!abs.startsWith(REPO_ROOT)) throw new Error('Path escapes repository');
    return abs;
  }
  return p; // leave as-is (could be URL or JSON string)
}

async function runAuggie(args: string[], stdinText?: string, timeoutMs = 120000): Promise<string> {
  if (process.env.AUGGIE_MCP_ALLOW_EXEC !== 'true') {
    return 'Execution disabled. Set AUGGIE_MCP_ALLOW_EXEC=true to allow Auggie calls.';
  }
  return await new Promise((resolve, reject) => {
    const child = spawn('auggie', args, { cwd: REPO_ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Auggie timed out'));
    }, timeoutMs);

    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d.toString('utf8'); });
    child.stderr.on('data', (d) => { err += d.toString('utf8'); });

    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', () => { clearTimeout(timer); resolve((out + (err ? `\n${err}` : '')).trim() || '(no output)'); });

    if (stdinText) {
      child.stdin.write(stdinText);
    }
    child.stdin.end();
  });
}


function startHttpStreamingServer() {
  const portStr = process.env.AUGGIE_MCP_HTTP_PORT;
  if (!portStr) return;
  const port = parseInt(portStr, 10) || 0;
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/stream') {
      if (process.env.AUGGIE_MCP_ALLOW_EXEC !== 'true') {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Forbidden', code: 'EXEC_DISABLED', hint: 'Set AUGGIE_MCP_ALLOW_EXEC=true' }));
        return;
      }
      let body = '';
      req.on('data', (chunk) => { body += chunk.toString('utf8'); });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          // Minimal schema validation
          const errors: Array<{ field: string; expected: string; actual?: any }> = [];
          const args: unknown = (parsed as any).args;
          const stdinTextRaw: unknown = (parsed as any).stdinText;
          let argsVal: string[] | undefined;
          let stdinText: string | undefined;
          if (!Array.isArray(args) || !args.every((s) => typeof s === 'string')) {
            errors.push({ field: 'args', expected: 'string[]', actual: args });
          } else {
            argsVal = args as string[];
          }
          if (stdinTextRaw !== undefined && typeof stdinTextRaw !== 'string') {
            errors.push({ field: 'stdinText', expected: 'string', actual: typeof stdinTextRaw });
          } else {
            stdinText = stdinTextRaw as string | undefined;
          }
          if (errors.length) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'ValidationError', details: errors }));
            return;
          }

          const send = (event: string, data: any) => {
            try {
              res.write(`event: ${event}\n`);
              res.write(`data: ${JSON.stringify(data)}\n\n`);
            } catch {
              // ignore write errors
            }
          };

          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });
          res.write(':ok\n\n');

          if (process.env.AUGGIE_MCP_MOCK_STREAM === 'true') {
            // Emit a few mock events then end
            setTimeout(() => send('stdout', { chunk: 'mock: hello\n' }), 10);
            setTimeout(() => send('stderr', { chunk: 'mock: warn\n' }), 20);
            setTimeout(() => { send('end', { code: 0 }); res.end(); }, 40);
            return;
          }

          const child = spawn('auggie', argsVal!, { cwd: REPO_ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
          child.stdout.on('data', (d) => send('stdout', { chunk: d.toString('utf8') }));
          child.stderr.on('data', (d) => send('stderr', { chunk: d.toString('utf8') }));
          child.on('error', (e) => send('error', { message: (e as Error).message }));
          child.on('close', (code) => {
            send('end', { code });
            res.end();
          });
          if (stdinText) {
            child.stdin.write(stdinText);
          }
          child.stdin.end();
          // periodic heartbeat
          const hbMs = Number(process.env.AUGGIE_MCP_HEARTBEAT_MS || '0');
          let hbTimer: NodeJS.Timeout | undefined;
          if (hbMs > 0) {
            hbTimer = setInterval(() => {
              try { res.write(':keepalive\n\n'); } catch { /* ignore */ }
            }, Math.max(1000, hbMs));
          }

        } catch (e: any) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'BadRequest', message: e?.message || 'Invalid JSON' }));

  // Heartbeats (keepalive) every N ms if configured
  const hbMs = Number(process.env.AUGGIE_MCP_HEARTBEAT_MS || '0');
  if (hbMs > 0) {
    setInterval(() => {
      try {
        // SSE comment as heartbeat
        // @ts-ignore
        this?.res?.write?.(':keepalive\n\n');
      } catch {
        // ignore
      }
    }, Math.max(1000, hbMs));
  }

        }
      });
    } else if (req.method === 'GET' && req.url === '/health') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    } else {
      res.statusCode = 404;
      res.end('Not found');
    }
  });
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[auggie-mcp] HTTP streaming listening on :${port}`);
  });
}


async function main() {
  const server = new McpServer({ name: 'auggie-mcp', version: '0.1.0' });

  // Tool: echo
  server.tool('echo', { text: z.string() }, async ({ text }) => {
    return { content: [{ type: 'text', text }] };
  });

  // Tool: auggie_version (detect CLI)
  server.tool('auggie_version', async () => {
    try {
      const { stdout } = await runExecFile('auggie', ['--version']);
      return { content: [{ type: 'text', text: stdout.trim() }] };
    } catch (e: any) {
      const msg = 'Auggie CLI not found or failed to execute. Ensure it is installed and on PATH.';
      return { content: [{ type: 'text', text: msg }] };
    }
  });

  // Tool: auggie_help
  server.tool('auggie_help', async () => {
    try {
      const { stdout } = await runExecFile('auggie', ['--help']);
      return { content: [{ type: 'text', text: stdout }] };
    } catch {
      // Fallback to web docs
      const docs = 'https://docs.augmentcode.com/cli/reference';
      return { content: [{ type: 'text', text: `Auggie CLI not available. See docs: ${docs}` }] };
    }
  });

  // Tool: auggie_call (guarded arbitrary call)
  server.tool('auggie_call', { args: z.array(z.string()).describe('Arguments after the `auggie` command') }, { destructiveHint: false, idempotentHint: true }, async ({ args }) => {
    if (process.env.AUGGIE_MCP_ALLOW_EXEC !== 'true') {
      return { content: [{ type: 'text', text: 'Execution disabled. Set AUGGIE_MCP_ALLOW_EXEC=true to allow auggie_call.' }] };
    }
    try {
      const { stdout, stderr } = await runExecFile('auggie', args);
      const text = [stdout, stderr].filter(Boolean).join('\n').trim() || '(no output)';
      return { content: [{ type: 'text', text }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Execution failed: ${e.stderr || e.err?.message || e}` }] };
    }
  });

  // Tool: project_list_md
  server.tool('project_list_md', async () => {
    const files = await findMarkdownFiles();
    return { content: [{ type: 'text', text: files.join('\n') || '(none)' }] };
  });

  // Tool: project_search_md
  server.tool('project_search_md', { query: z.string(), maxResults: z.number().int().positive().max(500).optional() }, async ({ query, maxResults }) => {
    const hits = await searchInMdFiles(query, maxResults ?? 50);
    const text = hits.map(h => `${h.path}:${h.line}: ${h.preview}`).join('\n') || '(no matches)';
    return { content: [{ type: 'text', text }] };
  });

  // Tool: project_search_text
  server.tool('project_search_text', { query: z.string(), globs: z.array(z.string()).optional(), maxResults: z.number().int().positive().max(1000).optional() }, async ({ query, globs, maxResults }) => {
    const hits = await searchInText(query, globs, maxResults ?? 200);
    const text = hits.map(h => `${h.path}:${h.line}: ${h.preview}`).join('\n') || '(no matches)';
    return { content: [{ type: 'text', text }] };
  });

  // Tool: project_read_file

	  // Tool: auggie_print (one-shot instruction)
	  server.tool(
	    'auggie_print',
	    { instruction: z.string(), quiet: z.boolean().optional(), compact: z.boolean().optional(), rulesFile: z.string().optional(), mcpConfig: z.string().optional() },
	    async ({ instruction, quiet, compact, rulesFile, mcpConfig }) => {
	      const args = ['--print', instruction];
	      if (quiet) args.push('--quiet');
	      if (compact) args.push('--compact');
	      if (rulesFile) args.push('--rules', rulesFile);
	      if (mcpConfig) args.push('--mcp-config', mcpConfig);
		      // sanitize optional file-like inputs
		      const rulesAbs = sanitizeMaybePath(rulesFile);
		      const mcpAbs = sanitizeMaybePath(mcpConfig);
		      if (rulesAbs) { args.splice(args.indexOf('--rules'), 2); args.push('--rules', rulesAbs); }
		      if (mcpAbs) { args.splice(args.indexOf('--mcp-config'), 2); args.push('--mcp-config', mcpAbs); }

	      const text = await runAuggie(args);
	      return { content: [{ type: 'text', text }] };
	    }
	  );

	  // Tool: auggie_continue (resume previous session)
	  server.tool('auggie_continue', { quiet: z.boolean().optional(), compact: z.boolean().optional() }, async ({ quiet, compact }) => {
	    const args = ['--continue'];
	    if (quiet) args.push('--quiet');
	    if (compact) args.push('--compact');
	    const text = await runAuggie(args);
	    return { content: [{ type: 'text', text }] };
	  });

	  // Tool: auggie_run_file (execute instruction from a file)
	  server.tool('auggie_run_file', { path: z.string(), quiet: z.boolean().optional(), compact: z.boolean().optional() }, async ({ path: rel, quiet, compact }) => {
	    const abs = path.resolve(REPO_ROOT, rel);
	    if (!abs.startsWith(REPO_ROOT)) throw new Error('Path escapes repository');
	    const args = ['--instruction-file', abs];
	    if (quiet) args.push('--quiet');
	    if (compact) args.push('--compact');
	    const text = await runAuggie(args);
	    return { content: [{ type: 'text', text }] };
	  });

	  // Tool: auggie_auth (login/logout/token)
	  server.tool('auggie_auth', { action: z.enum(['login', 'logout', 'print-token']) }, async ({ action }) => {
	    const map: Record<string, string[]> = {
	      login: ['--login'],
	      logout: ['--logout'],
	      'print-token': ['--print-augment-token']
	    };
	    const text = await runAuggie(map[action]);
	    return { content: [{ type: 'text', text }] };
	  });


	  // Tool: auggie_plan (compose a planning instruction, optional context via stdin)
	  server.tool(
	    'auggie_plan',
	    {
	      goal: z.string(),
	      paths: z.array(z.string()).optional(),
	      constraints: z.string().optional(),
	      includeContents: z.boolean().optional(),
	      inputCapBytes: z.number().int().positive().max(1000000).optional(),
	      quiet: z.boolean().optional(),
	      compact: z.boolean().optional(),
	      rulesFile: z.string().optional(),
	      mcpConfig: z.string().optional(),
	    },
	    async ({ goal, paths, constraints, includeContents, inputCapBytes, quiet, compact, rulesFile, mcpConfig }) => {
	      const args = ['--print'];
	      if (quiet) args.push('--quiet');
	      if (compact) args.push('--compact');
	      if (rulesFile) args.push('--rules', rulesFile);
	      if (mcpConfig) args.push('--mcp-config', mcpConfig);

      const instruction = composePlanInstruction(goal, constraints, paths);

	      let stdinText: string | undefined;
	      if (includeContents && paths && paths.length) {
	        const cap = inputCapBytes ?? 200_000; // 200KB default
	        let used = 0;
	        const chunks: string[] = [];
	        for (const rel of paths) {
	          try {
	            const abs = path.resolve(REPO_ROOT, rel);
	            if (!abs.startsWith(REPO_ROOT)) continue;
	            let content = await fs.readFile(abs, 'utf8');
	            if (used + content.length > cap) {
	              content = content.slice(0, Math.max(0, cap - used));
	            }
	            used += content.length;
	            chunks.push(`===== ${rel} =====\n${content}`);
	            if (used >= cap) break;
	          } catch {
	            // ignore per-file errors
	          }
	        }
	        if (chunks.length) {
	          stdinText = chunks.join('\n\n');
	        }
	      }

	      const text = await runAuggie([...args, instruction], stdinText);
	      return { content: [{ type: 'text', text }] };
	    }
	  );

	  // Tool: auggie_review (code/diff review)
	  server.tool(
	    'auggie_review',
	    {
	      title: z.string().optional(),
	      paths: z.array(z.string()).optional(),
	      diff: z.string().optional(),
	      quiet: z.boolean().optional(),
	      compact: z.boolean().optional(),
	    },
	    async ({ title, paths, diff, quiet, compact }) => {
	      const args = ['--print'];
	      if (quiet) args.push('--quiet');
	      if (compact) args.push('--compact');

      const instruction = composeReviewInstruction(title, paths, !!diff);

	      let stdinText: string | undefined;
	      if (diff) {
	        stdinText = diff;
	      } else if (paths && paths.length) {
	        const chunks: string[] = [];
	        for (const rel of paths) {
	          try {
	            const abs = path.resolve(REPO_ROOT, rel);
	            if (!abs.startsWith(REPO_ROOT)) continue;
	            const content = await fs.readFile(abs, 'utf8');
	            chunks.push(`===== ${rel} =====\n${content}`);
	          } catch {
	            // ignore per-file errors
	          }
	        }
	        // Attempt to append diff for provided paths
	        try {
	          if (paths.length) {
	            const { stdout } = await runExecFile('git', ['diff', '--', ...paths]);
	            if (stdout && stdout.trim()) {
	              chunks.push(`===== git diff (${paths.join(', ')}) =====\n${stdout}`);
	            }
	          }
	        } catch {
	          // git may not be available or inside a repo; ignore
	        }
	        if (chunks.length) stdinText = chunks.join('\n\n');
	      }

	      const text = await runAuggie([...args, instruction], stdinText);
	      return { content: [{ type: 'text', text }] };
	    }
	  );

  server.tool('project_read_file', { path: z.string(), start: z.number().int().positive().optional(), end: z.number().int().positive().optional() }, async ({ path: rel, start, end }) => {
    const text = await safeReadFile(rel, start, end);
    return { content: [{ type: 'text', text }] };
  });

  // Tool: git_status
  server.tool('git_status', async () => {
    try {
      const { stdout } = await runExecFile('git', ['status', '--porcelain=v1', '--branch']);
      return { content: [{ type: 'text', text: stdout }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `git_status failed: ${e.stderr || e.err?.message || e}` }] };
    }
  });

  // Tool: git_diff
  server.tool('git_diff', { refA: z.string().optional(), refB: z.string().optional(), path: z.string().optional() }, async ({ refA, refB, path: p }) => {
    try {
      const args = ['diff'];
      if (refA || refB) args.push(`${refA ?? ''}${refB ? `...${refB}` : ''}`);
      if (p) args.push('--', p);
      const { stdout } = await runExecFile('git', args);
      return { content: [{ type: 'text', text: stdout || '(no diff)' }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `git_diff failed: ${e.stderr || e.err?.message || e}` }] };
    }
  });

  // Prompt: hello
  server.prompt('hello', 'Returns a friendly greeting', async (_extra) => {
    return {
      messages: [
        { role: 'assistant', content: { type: 'text', text: 'You are connected to Auggie MCP.' } }
      ]
    };
  });

  // Prompt: strategy_of_attack
  server.prompt('strategy_of_attack', 'Drafts a high-level plan to integrate Auggie CLI capabilities via MCP', async () => {
    return {
      messages: [
        {
          role: 'assistant',
          content: { type: 'text', text: [
            'Plan:\n',
            '1) Detect Auggie CLI (version/help).\n',
            '2) Expose read-only project tools (list/search/read).\n',
            '3) Add guarded exec wrappers for Auggie subcommands (opt-in).\n',
            '4) Provide resources documenting capabilities.\n'
          ].join('') }
        }
      ]
    };
  });

  // Prompt: commit_message
  server.prompt('commit_message', 'Generates a conventional commit message from summary + context', { summary: z.string(), details: z.string().optional(), scope: z.string().optional() }, async ({ summary, details, scope }) => {
    const scopeStr = scope ? `(${scope})` : '';
    const body = details ? `\n\n${details}` : '';
    return {
      messages: [
        { role: 'assistant', content: { type: 'text', text: `feat${scopeStr}: ${summary}${body}` } }
      ]
    };
  });

  // Prompt: pr_description
  server.prompt('pr_description', 'Drafts a PR description from title + changes', { title: z.string(), changes: z.string() }, async ({ title, changes }) => {
    const text = `# ${title}\n\n## Summary\n${changes}\n\n## Checklist\n- [ ] Tests pass\n- [ ] Lint passes\n- [ ] Docs updated`;
    return { messages: [{ role: 'assistant', content: { type: 'text', text } }] };
  });

  // Resource: version info
  server.resource('version', 'app://version', async () => {
    return {
      contents: [
        { uri: 'app://version', mimeType: 'text/plain', text: 'auggie-mcp 0.1.0' }
      ]
    };
  });

  // Resource: capabilities
  server.resource('capabilities', 'app://capabilities', async () => {
    const md = [
      '# Auggie MCP Capabilities',
      '',
      'Tools:',
      '- echo(text)',
      '- auggie_version',
      '- auggie_help',
      '- auggie_call(args[]) (guarded by AUGGIE_MCP_ALLOW_EXEC)',
      '- project_list_md',
      '- project_search_md(query, maxResults?)',
      '- project_search_text(query, globs?, maxResults?)',
      '- project_read_file(path, start?, end?)',
      '- git_status',
      '- git_diff(refA?, refB?, path?)',
      '- auggie_print(instruction, quiet?, compact?, rulesFile?, mcpConfig?)',
      '- auggie_continue(quiet?, compact?)',
      '- auggie_run_file(path, quiet?, compact?)',
      '- auggie_auth(action)',
      '- auggie_plan(goal, paths?, constraints?, includeContents?, inputCapBytes?, quiet?, compact?, rulesFile?, mcpConfig?)',
      '- auggie_review(title?, paths?, diff?, quiet?, compact?)',
      '',
      'Prompts:',
      '- hello',
      '- strategy_of_attack',
      '- commit_message(summary, details?, scope?)',
      '- pr_description(title, changes)',
      '',
      'Resources:',
      '- app://version',
      '- app://capabilities',
      '',
      'HTTP streaming (optional):',
      '- Set AUGGIE_MCP_HTTP_PORT to enable SSE server',
      '- POST /stream with { args: string[], stdinText?: string }',
      '- Events: stdout, stderr, error, end',
      '- GET /health returns { ok: true }'
    ].join('\n');
    return { contents: [{ uri: 'app://capabilities', mimeType: 'text/markdown', text: md }] };
  });

  startHttpStreamingServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return;

}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
