import { execFile } from 'child_process';
import { logger } from '../logger';

const MIN_NODE_VERSION = '16.0.0';
const MIN_PLAYWRIGHT_VERSION = '1.40.0';

export { MIN_NODE_VERSION, MIN_PLAYWRIGHT_VERSION };

export interface EnvironmentCheckResult {
  nodeVersion: string;
  nodeOk: boolean;
  playwrightAvailable: boolean;
  playwrightVersion: string | null;
  playwrightOk: boolean;
  errors: string[];
}

/**
 * 简单的语义化版本比较，不依赖 semver 包。
 * 返回 true 表示 actual >= minimum。
 */
function gte(actual: string, minimum: string): boolean {
  const parse = (v: string) => v.split('.').map((n) => parseInt(n, 10));
  const a = parse(actual);
  const m = parse(minimum);
  for (let i = 0; i < 3; i++) {
    const av = a[i] || 0;
    const mv = m[i] || 0;
    if (av > mv) {
      return true;
    }
    if (av < mv) {
      return false;
    }
  }
  return true;
}

function getPlaywrightVersion(): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Playwright version check timed out'));
    }, 10000);

    execFile('npx', ['playwright', '--version'], { shell: true }, (error, stdout) => {
      clearTimeout(timeout);
      if (error) {
        reject(error);
        return;
      }
      const match = stdout.trim().match(/(\d+\.\d+\.\d+)/);
      if (match) {
        resolve(match[1]);
      } else {
        reject(new Error(`Cannot parse Playwright version from: ${stdout}`));
      }
    });
  });
}

let cachedResult: EnvironmentCheckResult | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 分钟缓存

export async function checkEnvironment(): Promise<EnvironmentCheckResult> {
  const now = Date.now();
  if (cachedResult && now - cacheTimestamp < CACHE_TTL) {
    return cachedResult;
  }

  const log = logger.child('EnvironmentCheck');
  const errors: string[] = [];

  // 检查 Node.js 版本
  const nodeVersion = process.version.replace(/^v/, '');
  const nodeOk = gte(nodeVersion, MIN_NODE_VERSION);
  if (!nodeOk) {
    errors.push(`Node.js version ${nodeVersion} is below minimum required ${MIN_NODE_VERSION}`);
  }

  // 检查 Playwright 可用性
  let playwrightAvailable = false;
  let playwrightVersion: string | null = null;
  let playwrightOk = false;

  try {
    const version = await getPlaywrightVersion();
    playwrightAvailable = true;
    playwrightVersion = version;
    playwrightOk = gte(version, MIN_PLAYWRIGHT_VERSION);
    if (!playwrightOk) {
      errors.push(
        `Playwright version ${version} is below minimum required ${MIN_PLAYWRIGHT_VERSION}`
      );
    }
  } catch (e) {
    log.debug?.(`Playwright version check failed: ${e instanceof Error ? e.message : String(e)}`);
    errors.push('Playwright CLI is not available. Please install @playwright/test');
  }

  const result: EnvironmentCheckResult = {
    nodeVersion,
    nodeOk,
    playwrightAvailable,
    playwrightVersion,
    playwrightOk,
    errors,
  };

  cachedResult = result;
  cacheTimestamp = now;

  return result;
}
