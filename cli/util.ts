import fs from 'node:fs';
import path from 'node:path';

export function safeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 80);
}

export function fileExists(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

export function readJsonSafe<T = any>(p: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'coverage',
  '.turbo', '.yarn', '.pnpm-store', '.venv', '__pycache__', 'target',
  '.cache', '.parcel-cache', '.svelte-kit', '.vercel', '.netlify',
]);

export function* walk(root: string, depth = 0, maxDepth = 8): Generator<string> {
  if (depth > maxDepth) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name) || e.name.startsWith('.git')) continue;
    const full = path.join(root, e.name);
    if (e.isDirectory()) {
      yield* walk(full, depth + 1, maxDepth);
    } else if (e.isFile()) {
      yield full;
    }
  }
}
