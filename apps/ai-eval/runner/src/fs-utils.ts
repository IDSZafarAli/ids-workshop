import {mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {dirname} from 'node:path';

export function ensureDir(path: string): void {
  mkdirSync(path, {recursive: true});
}

export function writeTextFile(path: string, content: string): void {
  ensureDir(dirname(path));
  writeFileSync(path, content, 'utf8');
}

export function resetDir(path: string): void {
  rmSync(path, {recursive: true, force: true});
  ensureDir(path);
}
