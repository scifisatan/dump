import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';

// The doc rules in AGENTS.md "Keeping docs true" that a machine can check.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const docs = [
  'AGENTS.md',
  'CODING_STANDARDS.md',
  'README.md',
  ...readdirSync(join(root, 'docs')).map((name) => `docs/${name}`),
];

const skipped = new Set(['node_modules', 'build', 'dist', 'ios', 'android', '.build', '.expo']);
function files(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = `${dir}/${name}`;
    if (skipped.has(name) || name.startsWith('.')) return [];
    return statSync(join(root, path)).isDirectory() ? files(path) : [path];
  });
}
const testFiles = [...files('tests'), ...files('mac/Tests')];

function prose(markdown: string) {
  return markdown.replace(/^```[\s\S]*?^```/gm, '');
}

function slug(heading: string) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}
const anchors = (path: string) =>
  new Set(
    [...prose(read(path)).matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => slug(match[1] ?? '')),
  );

// A doc names a test as → `file` "name", "name" or → e2e `file` "name"; a Swift test is
// `EngineTests.swift` `name`.
function references(markdown: string) {
  const found: { file: string; name: string | null }[] = [];
  for (const match of markdown.matchAll(/→ (?=e2e |`)/g)) {
    let rest = markdown.slice((match.index ?? 0) + 2);
    let file: string | null = null;
    for (;;) {
      rest = rest.replace(/^(?:,\s*|\s+|e2e\s+|and\s+)+/, '');
      const token = /^`([^`]+)`|^"([^"]+)"/.exec(rest);
      if (!token) break;
      rest = rest.slice(token[0].length);
      const [, code, quoted] = token;
      if (code && (code.includes('.') || code.includes('/'))) {
        file = code;
        found.push({ file, name: null });
      } else if (file) found.push({ file, name: (code ?? quoted ?? '').replace(/^…|…$/g, '') });
    }
  }
  return found;
}

function testFile(reference: string) {
  if (existsSync(join(root, reference))) return reference;
  return testFiles.find((path) => path.endsWith(`/${reference}`)) ?? null;
}

describe('docs', () => {
  it('names only tests that exist', () => {
    const missing = docs.flatMap((doc) =>
      references(read(doc)).flatMap(({ file, name }) => {
        const path = testFile(file);
        if (!path) return name === null ? [`${doc}: ${file}`] : [];
        if (name === null || read(path).includes(name)) return [];
        return [`${doc}: ${file} "${name}"`];
      }),
    );
    expect(missing).toEqual([]);
  });

  it('links only to files and headings that exist', () => {
    const broken = docs.flatMap((doc) =>
      [...prose(read(doc)).matchAll(/\]\(([^)\s]+)\)/g)].flatMap(([, target = '']) => {
        if (/^[a-z]+:/.test(target)) return [];
        const [path = '', anchor] = target.split('#');
        const file = path ? relative(root, join(root, dirname(doc), path)) : doc;
        if (!existsSync(join(root, file))) return [`${doc}: ${target}`];
        if (anchor && !anchors(file).has(anchor)) return [`${doc}: ${target}`];
        return [];
      }),
    );
    expect(broken).toEqual([]);
  });

  // An area doc may name paths from its own folder: docs/mac.md says `Sources/DumpKit/`.
  it('names only code paths that exist', () => {
    const generated = ['mac/build/', 'mac/.env.local', 'mobile/android/', 'mobile/node_modules'];
    const areas: Record<string, string> = { 'docs/mac.md': 'mac', 'docs/mobile.md': 'mobile' };
    const missing = docs.flatMap((doc) =>
      [...prose(read(doc)).matchAll(/`((?:src|mac|mobile|tests|public|docs)\/[^`\s*]*)`/g)]
        .map(([, path = '']) => path)
        .filter((path) => !generated.some((prefix) => path.startsWith(prefix)))
        .filter((path) => {
          const area = Object.hasOwn(areas, doc) ? areas[doc] : undefined;
          return !existsSync(join(root, path)) && !(area && existsSync(join(root, area, path)));
        })
        .map((path) => `${doc}: ${path}`),
    );
    expect(missing).toEqual([]);
  });

  // The code map names every source file, or a folder it describes as a whole.
  it('maps every source file in architecture.md', () => {
    const map = /## Code map\n+```\n([\s\S]*?)```/.exec(read('docs/architecture.md'))?.[1] ?? '';
    const entries = new Map<string, boolean>();
    const stack: string[] = [];
    for (const line of map.split('\n')) {
      const branch = /[├└]── /.exec(line);
      const depth = branch ? branch.index / 4 + 1 : 0;
      const name = (branch ? line.slice(branch.index + 4) : line).split(/\s+/)[0];
      if (!name) continue;
      stack.length = depth;
      const parent = stack.at(-1);
      if (parent !== undefined) entries.set(parent, true);
      const path = (parent ?? '') + name;
      stack.push(path);
      entries.set(path, false);
    }
    const mapped = (file: string) => {
      if (entries.has(file)) return true;
      for (let dir = dirname(file); dir !== '.'; dir = dirname(dir)) {
        const described = entries.get(`${dir}/`);
        if (described !== undefined) return !described;
      }
      return false;
    };
    const source = /\.(ts|tsx|mjs|js|swift|sh)$/;
    const unmapped = ['src', 'mac', 'mobile', 'cli', 'scripts']
      .flatMap(files)
      .filter((file) => source.test(file) && !mapped(file));
    expect(unmapped).toEqual([]);
  });
});
