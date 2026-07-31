import * as path from 'path';
import * as fs from 'fs';

export function findProjectRoot(explicitRoot?: string): string {
  if (explicitRoot) {
    return path.resolve(explicitRoot);
  }
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    const configFiles = ['playwright.config.ts', 'playwright.config.js', 'playwright.config.mts'];
    for (const cf of configFiles) {
      if (fs.existsSync(path.join(dir, cf))) {
        return dir;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return process.cwd();
}

export interface CliContext {
  findProjectRoot: typeof findProjectRoot;
}

export function createCliContext(): CliContext {
  return {
    findProjectRoot,
  };
}
