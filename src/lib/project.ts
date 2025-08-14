import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// dist/lib -> project root
export const REPO_ROOT = path.resolve(__dirname, '../..');

export async function safeReadFile(relPath: string, start?: number, end?: number): Promise<string> {
  const abs = path.resolve(REPO_ROOT, relPath);
  if (!abs.startsWith(REPO_ROOT)) throw new Error('Path escapes repository');
  const content = await fs.readFile(abs, 'utf8');
  if (start === undefined && end === undefined) return content;
  const lines = content.split(/\r?\n/);
  const s = Math.max(1, start ?? 1) - 1;
  const e = Math.min(lines.length, end ?? lines.length);
  return lines.slice(s, e).join('\n');
}

export async function findFilesByExt(root: string, exts: string[]): Promise<string[]> {
  const results: string[] = [];
  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.git')) continue;
        await walk(full);
      } else if (e.isFile()) {
        const lower = e.name.toLowerCase();
        if (exts.some((ext) => lower.endsWith(ext))) {
          results.push(path.relative(root, full));
        }
      }
    }
  }
  await walk(root);
  return results.sort();
}

export async function findMarkdownFiles(): Promise<string[]> {
  return findFilesByExt(REPO_ROOT, ['.md']);
}

export async function searchInMdFiles(query: string, maxResults = 50): Promise<Array<{ path: string; line: number; preview: string }>> {
  const mdFiles = await findMarkdownFiles();
  const out: Array<{ path: string; line: number; preview: string }> = [];
  for (const rel of mdFiles) {
    const content = await fs.readFile(path.join(REPO_ROOT, rel), 'utf8');
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(query.toLowerCase())) {
        out.push({ path: rel, line: i + 1, preview: lines[i].slice(0, 240) });
        if (out.length >= maxResults) return out;
      }
    }
  }
  return out;
}

export async function searchInText(query: string, globs: string[] | undefined, maxResults = 200): Promise<Array<{ path: string; line: number; preview: string }>> {
  const files = await findFilesByExt(REPO_ROOT, ['.md', '.ts', '.tsx', '.js', '.jsx', '.json', '.yaml', '.yml']);
  const filtered = globs && globs.length ? files.filter((f) => globs.some((g) => f.includes(g))) : files;
  const out: Array<{ path: string; line: number; preview: string }>= [];
  for (const rel of filtered) {
    const content = await fs.readFile(path.join(REPO_ROOT, rel), 'utf8');
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(query.toLowerCase())) {
        out.push({ path: rel, line: i + 1, preview: lines[i].slice(0, 240) });
        if (out.length >= maxResults) return out;
      }
    }
  }
  return out;
}

