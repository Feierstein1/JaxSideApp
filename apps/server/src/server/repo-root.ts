import { existsSync } from 'node:fs';
import path from 'node:path';

/** Walks up from `start` to the monorepo root (the folder holding docker-compose.yml). */
export function findRepoRoot(start: string = process.cwd()): string {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, 'docker-compose.yml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`Repo root not found above ${start}`);
    dir = parent;
  }
}
