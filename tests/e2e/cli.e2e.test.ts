import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const DIST_PATH = path.join(__dirname, '../../dist');
const CLI_PATH = path.join(__dirname, '../../bin/cli.js');
const SRC_CLI_PATH = path.join(__dirname, '../../src/cli/index.ts');
const TIMEOUT = 30000;

const distExists = fs.existsSync(DIST_PATH);

interface CLIResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

function runCLI(args: string[], options: { cwd?: string; timeout?: number } = {}): Promise<CLIResult> {
  return new Promise((resolve, reject) => {
    const useDist = distExists;
    const command = useDist ? 'node' : 'npx';
    const cliPath = useDist ? CLI_PATH : SRC_CLI_PATH;
    const commandArgs = useDist ? [cliPath, ...args] : ['tsx', cliPath, ...args];
    
    const proc = spawn(command, commandArgs, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, NODE_ENV: 'test' },
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error(`CLI timeout after ${options.timeout || TIMEOUT}ms`));
    }, options.timeout || TIMEOUT);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, exitCode: code });
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

describe('CLI E2E Tests', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-e2e-test-'));
  });

  afterEach(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe('Help and Version', () => {
    it('should show help when no arguments provided', async () => {
      const result = await runCLI([]);

      expect(result.stdout).toContain('yuantest');
      expect(result.stdout).toContain('Commands:');
    });

    it('should show version with --version flag', async () => {
      const result = await runCLI(['--version']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });

    it('should show help for specific command', async () => {
      const result = await runCLI(['run', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Run Playwright tests');
      expect(result.stdout).toContain('--config');
      expect(result.stdout).toContain('--test-dir');
    });
  });

  describe('Orchestrate Command', () => {
    it('should orchestrate tests in a directory', async () => {
      const testDir = path.join(tmpDir, 'tests');
      fs.mkdirSync(testDir, { recursive: true });

      fs.writeFileSync(path.join(testDir, 'example.spec.ts'), `
        import { test, expect } from '@playwright/test';
        test('example test', async () => {
          expect(1).toBe(1);
        });
      `);

      const result = await runCLI(['orchestrate', '-t', testDir, '-s', '2'], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Test Distribution');
      expect(result.stdout).toContain('Shard');
    });

    it('should handle empty test directory', async () => {
      const testDir = path.join(tmpDir, 'empty-tests');
      fs.mkdirSync(testDir, { recursive: true });

      const result = await runCLI(['orchestrate', '-t', testDir], { cwd: tmpDir });

      expect(result.stdout).toContain('Test Distribution');
    });
  });

  describe('Report Command', () => {
    it('should show no reports message when empty', async () => {
      const result = await runCLI(['report'], { cwd: tmpDir });

      expect(result.stdout).toContain('No reports found');
    });

    it('should show specific report with --id option', async () => {
      const result = await runCLI(['report', '-i', 'non-existent-id'], { cwd: tmpDir });

      expect(result.stdout).toContain('not found');
    });
  });

  describe('Flaky Command', () => {
    it('should show flaky test stats', async () => {
      const result = await runCLI(['flaky'], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Flaky Test Stats');
    });

    it('should list flaky tests with --list option', async () => {
      const result = await runCLI(['flaky', '--list'], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Flaky Tests');
    });

    it('should list quarantined tests with --quarantined option', async () => {
      const result = await runCLI(['flaky', '--quarantined'], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Quarantined Tests');
    });
  });

  describe('Annotations Command', () => {
    it('should scan annotations in test directory', async () => {
      const testDir = path.join(tmpDir, 'tests');
      fs.mkdirSync(testDir, { recursive: true });

      fs.writeFileSync(path.join(testDir, 'annotated.spec.ts'), `
        import { test, expect } from '@playwright/test';
        test.skip('skipped test', async () => {
          expect(1).toBe(1);
        });
        test.fixme('fixme test', async () => {
          expect(1).toBe(1);
        });
      `);

      const result = await runCLI(['annotations', '-t', testDir], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Annotations');
    });
  });

  describe('Tags Command', () => {
    it('should scan tags in test directory', async () => {
      const testDir = path.join(tmpDir, 'tests');
      fs.mkdirSync(testDir, { recursive: true });

      fs.writeFileSync(path.join(testDir, 'tagged.spec.ts'), `
        import { test, expect } from '@playwright/test';
        test('tagged test @smoke @critical', async () => {
          expect(1).toBe(1);
        });
      `);

      const result = await runCLI(['tags', '-t', testDir], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Tags');
    });
  });

  describe('Trace Command', () => {
    it('should show trace statistics', async () => {
      const result = await runCLI(['trace', '--stats'], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Trace Statistics');
    });

    it('should list traces', async () => {
      const result = await runCLI(['trace', '-l'], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Traces');
    });
  });

  describe('Artifacts Command', () => {
    it('should show artifact statistics', async () => {
      const result = await runCLI(['artifacts', '--stats'], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Artifact Statistics');
    });

    it('should list artifacts', async () => {
      const result = await runCLI(['artifacts', '-l'], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Artifacts');
    });
  });

  describe('Visual Command', () => {
    it('should show visual testing statistics', async () => {
      const result = await runCLI(['visual', '--stats'], { cwd: tmpDir });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Visual Testing');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid command gracefully', async () => {
      const result = await runCLI(['invalid-command']);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('error');
    });

    it('should handle missing required options', async () => {
      const result = await runCLI(['analyze']);

      expect(result.stdout).toContain('Please specify a run ID with --id');
    });
  });
});
