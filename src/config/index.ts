import {
  TestConfig,
  BrowserType,
  TraceConfig,
  ArtifactConfig,
  VisualTestingConfig,
  AnnotationConfig,
  TagConfig,
} from '../types';
import * as path from 'path';
import { StorageProvider, getStorage } from '../storage';

export interface PlaywrightConfigOptions {
  config: TestConfig;
  shardIndex?: number;
  shardTotal?: number;
  grepPattern?: string;
  grepInvert?: string;
  tagFilter?: string[];
  updateSnapshots?: boolean;
  projectFilter?: string;
}

export class PlaywrightConfigBuilder {
  private config: TestConfig;
  private options: Partial<PlaywrightConfigOptions>;
  private storage: StorageProvider;

  constructor(
    config: TestConfig,
    options?: Partial<PlaywrightConfigOptions>,
    storage?: StorageProvider
  ) {
    this.config = config;
    this.options = options || {};
    this.storage = storage || getStorage();
  }

  build(): string {
    const projects = this.buildProjects();
    const useBlock = this.buildUseBlock();
    const reporterBlock = this.buildReporterBlock();
    const annotationsBlock = this.buildAnnotationsBlock();
    const testIgnoreBlock = this.buildTestIgnoreBlock();

    const absoluteTestDir = path.isAbsolute(this.config.testDir)
      ? this.config.testDir
      : path.resolve(process.cwd(), this.config.testDir);

    return `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: ${this.safeStr(absoluteTestDir)},
  fullyParallel: true,
  forbidOnly: ${this.config.annotations?.respectOnly === false ? 'false' : '!!process.env.CI'},
  retries: ${this.config.retries || 0},
  workers: ${this.config.workers || 1},
  reporter: ${reporterBlock},
  timeout: ${this.config.timeout || 30000},
  expect: {
    timeout: ${this.config.timeout || 30000},
    toHaveScreenshot: {
      maxDiffPixels: ${this.config.visualTesting?.maxDiffPixels || 0},
      threshold: ${this.config.visualTesting?.threshold || 0.2},
    },
  },
  outputDir: ${this.safeStr(path.join(this.config.outputDir, 'test-results'))},
  snapshotDir: ${this.safeStr(this.config.visualTesting?.outputDir || path.join(this.config.outputDir, 'snapshots'))},
  ${testIgnoreBlock}
  ${this.options.grepPattern ? `grep: /${this.escapeRegex(this.options.grepPattern)}/,` : ''}
  ${this.options.grepInvert ? `grepInvert: /${this.escapeRegex(this.options.grepInvert)}/,` : ''}
  ${annotationsBlock}
  use: ${useBlock},
  projects: [${projects}],
});
`;
  }

  private buildUseBlock(): string {
    const useOptions: string[] = [];

    if (this.config.baseURL) {
      useOptions.push(`    baseURL: ${this.safeStr(this.config.baseURL)},`);
    }

    if (this.config.traces?.enabled) {
      const traceMode = this.config.traces.mode || 'on-first-retry';
      useOptions.push(`    trace: '${traceMode}',`);
    }

    if (this.config.artifacts?.enabled) {
      const screenshotMode = this.config.artifacts.screenshots || 'only-on-failure';
      const videoMode = this.config.artifacts.videos || 'retain-on-failure';
      useOptions.push(`    screenshot: '${screenshotMode}',`);
      useOptions.push(`    video: '${videoMode}',`);
    }

    if (this.config.artifacts?.outputDir) {
      useOptions.push(`    screenshot: 'on',`);
    }

    useOptions.push(`    actionTimeout: ${this.config.timeout || 10000},`);
    useOptions.push(`    navigationTimeout: ${this.config.timeout || 30000},`);

    if (this.config.headers) {
      const headersStr = JSON.stringify(this.config.headers, null, 6).replace(/\n/g, '\n    ');
      useOptions.push(`    extraHTTPHeaders: ${headersStr},`);
    }

    return `{
${useOptions.join('\n')}
  }`;
  }

  private buildProjects(): string {
    const browsers = this.config.browsers || ['chromium'];
    const projects: string[] = [];

    const deviceMap: Record<string, string> = {
      chromium: "devices['Desktop Chrome']",
      firefox: "devices['Desktop Firefox']",
      webkit: "devices['Desktop Safari']",
    };

    for (const browser of browsers) {
      const device = deviceMap[browser] || `devices['Desktop Chrome']`;
      projects.push(`    {
      name: '${browser}',
      use: { ...${device} },
    }`);
    }

    if (this.options.shardTotal && this.options.shardTotal > 1) {
      projects.push(`    {
      name: 'shard',
      use: { ...devices['Desktop Chrome'] },
    }`);
    }

    return projects.join(',\n');
  }

  private buildReporterBlock(): string {
    const reporters: string[] = [];

    if (this.config.htmlReport !== false) {
      reporters.push(
        `['html', { open: 'never', outputFolder: ${this.safeStr(path.join(this.config.outputDir, this.config.htmlReportDir || 'html-report'))} }]`
      );
    }

    reporters.push(
      `['json', { outputFile: ${this.safeStr(path.join(this.config.outputDir, 'results.json'))} }]`
    );
    reporters.push(`['list']`);

    if (this.config.traces?.enabled) {
      reporters.push(
        `['html', { open: 'never', outputFolder: ${this.safeStr(path.join(this.config.outputDir, this.config.htmlReportDir || 'html-report'))} }]`
      );
    }

    return `[${reporters.join(', ')}]`;
  }

  private buildAnnotationsBlock(): string {
    if (!this.config.annotations?.enabled) {
      return '';
    }

    const lines: string[] = [];
    lines.push('annotations: {');

    if (this.config.annotations.respectSkip !== false) {
      lines.push(`    skip: process.env.CI ? true : undefined,`);
    }

    if (this.config.annotations.respectFixme !== false) {
      lines.push(`    fixme: process.env.CI ? true : undefined,`);
    }

    if (this.config.annotations.respectSlow) {
      lines.push(`    slow: true,`);
    }

    lines.push('  },');

    return lines.join('\n');
  }

  private buildTestIgnoreBlock(): string {
    const defaultIgnore = [
      '**/*.test.ts',
      '**/*.e2e.test.ts',
      '**/e2e/**',
      '**/integration/**',
      '**/unit/**',
      '**/__mocks__/**',
    ];

    const ignorePatterns = this.config.testIgnore || defaultIgnore;
    const ignoreStr = ignorePatterns.map((p) => `'${p}'`).join(', ');

    return `testIgnore: [${ignoreStr}],`;
  }

  async writeConfig(outputPath?: string): Promise<string> {
    throw new Error(
      'writeConfig is deprecated. Playwright config should be managed in the project root directory. ' +
        'Please use the existing playwright.config.ts in your project root instead.'
    );
  }

  buildCLIArgs(): string[] {
    const args: string[] = ['npx', 'playwright', 'test'];

    const projectConfigPath = path.resolve('playwright.config.ts');
    args.push(`--config=${projectConfigPath}`);

    if (
      this.options.shardTotal &&
      this.options.shardTotal > 1 &&
      this.options.shardIndex !== undefined
    ) {
      args.push(`--shard=${this.options.shardIndex + 1}/${this.options.shardTotal}`);
    }

    if (this.options.grepPattern) {
      args.push(`--grep=${this.options.grepPattern}`);
    }

    if (this.options.projectFilter) {
      args.push(`--project=${this.options.projectFilter}`);
    }

    if (this.options.updateSnapshots) {
      args.push('--update-snapshots');
    }

    if (this.config.workers) {
      args.push(`--workers=${this.config.workers}`);
    }

    return args;
  }

  static buildTraceConfig(
    enabled: boolean = true,
    mode: TraceConfig['mode'] = 'on-first-retry'
  ): TraceConfig {
    return {
      enabled,
      mode,
      screenshots: true,
      snapshots: true,
      sources: true,
      attachments: true,
    };
  }

  static buildArtifactConfig(
    screenshots: ArtifactConfig['screenshots'] = 'only-on-failure',
    videos: ArtifactConfig['videos'] = 'retain-on-failure'
  ): ArtifactConfig {
    return {
      enabled: true,
      screenshots,
      videos,
      downloads: false,
    };
  }

  static buildVisualTestingConfig(
    threshold: number = 0.2,
    maxDiffPixels: number = 10,
    updateSnapshots: boolean = false
  ): VisualTestingConfig {
    return {
      enabled: true,
      threshold,
      maxDiffPixelRatio: 0.01,
      maxDiffPixels,
      updateSnapshots,
    };
  }

  static buildAnnotationConfig(options?: Partial<AnnotationConfig>): AnnotationConfig {
    return {
      enabled: true,
      respectSkip: true,
      respectOnly: true,
      respectFail: true,
      respectSlow: false,
      respectFixme: true,
      customAnnotations: {},
      ...options,
    };
  }

  static buildTagConfig(include?: string[], exclude?: string[]): TagConfig {
    return {
      enabled: true,
      include,
      exclude,
    };
  }

  private safeStr(value: string): string {
    const escaped = value.replace(/\\/g, '/').replace(/'/g, "\\'");
    return `'${escaped}'`;
  }

  private escapeRegex(pattern: string): string {
    return pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
