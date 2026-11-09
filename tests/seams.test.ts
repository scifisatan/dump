import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';

// Swift and the Mac engine name each other's functions in strings, so neither compiler sees a
// rename. These read both sides and compare the names. docs/architecture.md § Code layers and
// seams lists the seams.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const swift = read('mac/Sources/DumpKit/Engine.swift');
const engineTs = readdirSync(join(root, 'mac/engine'))
  .filter((name) => name.endsWith('.ts'))
  .map((name) => read(`mac/engine/${name}`))
  .join('\n');

const names = (text: string, pattern: RegExp) =>
  [...new Set([...text.matchAll(pattern)].map((match) => match[1] ?? ''))].sort();
function block(text: string, start: string) {
  const from = text.indexOf(start);
  if (from === -1) throw new Error(`Missing ${start}`);
  return text.slice(from, text.indexOf('\n};', from));
}

describe('the Mac engine bridge', () => {
  it('calls only the engine methods mac/engine/index.ts defines, and every one of them', () => {
    const called = names(swift, /(?:call|callAsync|notify)\("(\w+)"/g);
    const defined = names(
      block(read('mac/engine/index.ts'), 'const engine = {'),
      /^ {2}(?:async )?(\w+)\(/gm,
    );
    expect(called).toEqual(defined);
  });

  it('defines every native function the engine declares in native.ts, and no others', () => {
    const defined = names(swift, /define\("(\w+)"/g);
    const declared = names(
      block(read('mac/engine/native.ts'), 'type Native = {'),
      /^ {2}(\w+)\(/gm,
    );
    expect(defined).toEqual(declared);
  });

  it('answers only through host callbacks the engine installs', () => {
    const answered = names(swift, /callHost\("(\w+)"/g);
    const installed = names(engineTs, /^host\.(\w+) =/gm);
    expect(answered).toEqual(installed);
  });
});
