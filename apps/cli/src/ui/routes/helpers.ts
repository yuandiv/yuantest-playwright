import * as path from 'path';
import * as fs from 'fs';
import type { RunResult, SuiteResult } from '@yuantest/contracts';

export function isPathSafe(inputPath: string): boolean {
  if (inputPath.includes('..')) {
    return false;
  }
  const resolved = path.resolve(inputPath);
  const normalized = path.normalize(inputPath);
  return (
    resolved.startsWith(process.cwd()) ||
    inputPath === normalized ||
    inputPath.startsWith('./') ||
    inputPath.startsWith('/')
  );
}

export function processAttachmentPath(attachmentPath: string, outputDir: string): string {
  if (!attachmentPath) {
    return attachmentPath;
  }

  if (attachmentPath.startsWith('/') || attachmentPath.startsWith('http')) {
    return attachmentPath;
  }

  const normalizedPath = attachmentPath.replace(/\\/g, '/');

  if (normalizedPath.includes(outputDir.replace(/\\/g, '/'))) {
    const normalizedOutputDir = outputDir.replace(/\\/g, '/');
    const relativePath = normalizedPath.replace(normalizedOutputDir, '');
    if (relativePath.startsWith('/html-reports')) {
      return relativePath;
    } else if (relativePath.startsWith('/test-results')) {
      return relativePath;
    } else {
      return `/api/v1/attachments/file?path=${encodeURIComponent(attachmentPath)}`;
    }
  }

  if (path.isAbsolute(attachmentPath)) {
    return `/api/v1/attachments/file?path=${encodeURIComponent(attachmentPath)}`;
  }

  return attachmentPath;
}

export function processRunAttachmentPaths(run: RunResult, outputDir: string): void {
  if (!run.suites || !Array.isArray(run.suites)) {
    return;
  }

  const processSuite = (suite: SuiteResult): SuiteResult => {
    if (suite.tests && Array.isArray(suite.tests)) {
      suite.tests = suite.tests.map((test) => {
        if (test.screenshots && Array.isArray(test.screenshots)) {
          test.screenshots = test.screenshots.map((p: string) =>
            processAttachmentPath(p, outputDir)
          );
        }
        if (test.videos && Array.isArray(test.videos)) {
          test.videos = test.videos.map((p: string) => processAttachmentPath(p, outputDir));
        }
        if (test.traces && Array.isArray(test.traces)) {
          test.traces = test.traces.map((p: string) => processAttachmentPath(p, outputDir));
        }
        return test;
      });
    }

    return suite;
  };

  run.suites = run.suites.map(processSuite);
}

export function discoverFilesInDir(dir: string, extensions: string[]): string[] {
  const files: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...discoverFilesInDir(fullPath, extensions));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  } catch {
    // Ignore errors when reading directory
  }
  return files;
}
