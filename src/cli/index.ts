#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import { Orchestrator } from '../orchestrator';
import { Executor, ParallelExecutor } from '../executor';
import { Reporter } from '../reporter';
import { FlakyTestManager } from '../flaky';
import { RealtimeReporter } from '../realtime';
import { DashboardServer } from '../ui/server';
import { TraceManager } from '../trace';
import { AnnotationManager } from '../annotations';
import { TagManager } from '../tags';
import { ArtifactManager } from '../artifacts';
import { VisualTestingManager } from '../visual';
import { PlaywrightConfigBuilder } from '../config';
import { loadConfigFile, mergeConfig, getDashboardConfig } from '../config/loader';
import { TestConfig, BrowserType, Artifact } from '../types';
import { logger } from '../logger';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

const program = new Command();

program
  .name('yuantest')
  .description('Playwright test orchestrator, executor and reporter')
  .version('1.0.0');

program
  .command('run [testFiles...]')
  .description('Run Playwright tests with orchestration')
  .option('-c, --config <path>', 'Config file path')
  .option('-p, --project <name>', 'Project name')
  .option('-t, --test-dir <path>', 'Test directory')
  .option('-o, --output <path>', 'Output directory')
  .option('-s, --shards <number>', 'Number of shards', '1')
  .option('-w, --workers <number>', 'Number of workers', '1')
  .option('-b, --browsers <list>', 'Browsers to test (comma separated)', 'chromium')
  .option('--base-url <url>', 'Base URL for tests')
  .option('--timeout <ms>', 'Test timeout in ms', '30000')
  .option('--retries <n>', 'Number of retries', '0')
  .option(
    '--trace <mode>',
    'Trace mode: off, on, retain-on-failure, on-first-retry',
    'on-first-retry'
  )
  .option('--screenshot <mode>', 'Screenshot mode: off, on, only-on-failure', 'only-on-failure')
  .option(
    '--video <mode>',
    'Video mode: off, on, retain-on-failure, on-first-retry',
    'retain-on-failure'
  )
  .option('--tags <list>', 'Run only tests with these tags (comma separated)')
  .option('--grep <pattern>', 'Grep pattern to filter tests')
  .option('--project-filter <name>', 'Run only specific browser project')
  .option('--update-snapshots', 'Update visual testing snapshots', false)
  .option('--visual-threshold <ratio>', 'Visual diff threshold (0-1)', '0.2')
  .option('--annotations', 'Enable annotation scanning', false)
  .option('--html-report', 'Generate Playwright HTML report', true)
  .action(async (testFiles, options) => {
    const spinner = ora('Initializing test run...').start();

    try {
      await logger.init(options.output || './test-output');
      const fileConfig = await loadConfigFile();
      const cliOverrides: Partial<TestConfig> = {
        version: options.project || undefined,
        testDir: options.testDir || undefined,
        outputDir: options.output || undefined,
        baseURL: options.baseUrl || undefined,
        retries: parseInt(options.retries) || undefined,
        timeout: parseInt(options.timeout) || undefined,
        workers: parseInt(options.workers) || undefined,
        shards: parseInt(options.shards) || undefined,
        browsers: options.browsers ? (options.browsers.split(',') as BrowserType[]) : undefined,
        htmlReport: options.htmlReport !== false,
      };
      const config: TestConfig = mergeConfig(fileConfig, cliOverrides);

      if (options.trace !== undefined) {
        config.traces = {
          enabled: options.trace !== 'off',
          mode: options.trace || 'on-first-retry',
          screenshots: true,
          snapshots: true,
          sources: true,
          attachments: true,
        };
      }
      if (options.screenshot) {
        config.artifacts = config.artifacts || {
          enabled: true,
          screenshots: 'only-on-failure',
          videos: 'retain-on-failure',
        };
        config.artifacts.screenshots = options.screenshot;
      }
      if (options.video) {
        config.artifacts = config.artifacts || {
          enabled: true,
          screenshots: 'only-on-failure',
          videos: 'retain-on-failure',
        };
        config.artifacts.videos = options.video;
      }
      if (options.visualThreshold) {
        config.visualTesting = config.visualTesting || {
          enabled: true,
          threshold: 0.2,
          maxDiffPixelRatio: 0.01,
          maxDiffPixels: 10,
          updateSnapshots: false,
        };
        config.visualTesting.threshold = parseFloat(options.visualThreshold);
      }
      if (options.updateSnapshots) {
        config.visualTesting = config.visualTesting || {
          enabled: true,
          threshold: 0.2,
          maxDiffPixelRatio: 0.01,
          maxDiffPixels: 10,
          updateSnapshots: false,
        };
        config.visualTesting.updateSnapshots = true;
      }
      if (options.annotations) {
        config.annotations = {
          enabled: true,
          respectSkip: true,
          respectOnly: true,
          respectFail: true,
          respectSlow: false,
          respectFixme: true,
          customAnnotations: {},
        };
      }
      if (options.tags) {
        config.tags = {
          enabled: true,
          include: options.tags.split(','),
        };
      }

      spinner.text = 'Discovering tests...';
      const orchestrator = new Orchestrator(config);
      await orchestrator.initialize();

      const orchestrationConfig = await orchestrator.orchestrate();
      spinner.text = `Found ${orchestrationConfig.testAssignment.length} tests across ${orchestrationConfig.totalShards} shards`;

      const executor = new Executor(config);
      const reporter = new Reporter(config.outputDir);

      executor.on('run_started', (data) => {
        console.log(chalk.blue(`\n🚀 Run started: ${data.runId}`));
      });

      executor.on('output', (data) => {
        process.stdout.write(data.data);
      });

      executor.on('annotations_scanned', (data) => {
        console.log(chalk.cyan(`\n📝 Annotations: ${data.summary.total} found`));
      });

      executor.on('tags_scanned', (data) => {
        console.log(
          chalk.magenta(
            `\n🏷️  Tags: ${data.summary.totalTags} tags, ${data.summary.totalTaggedTests} tagged tests`
          )
        );
      });

      executor.on('run_completed', async (result) => {
        console.log(chalk.green(`\n✅ Run completed: ${result.id}`));
        console.log(chalk.bold(`\nResults:`));
        console.log(`  Passed: ${chalk.green(result.passed)}`);
        console.log(`  Failed: ${chalk.red(result.failed)}`);
        console.log(`  Skipped: ${chalk.yellow(result.skipped)}`);

        if (result.metadata?.traces) {
          console.log(chalk.magenta(`  Traces: ${result.metadata.traces.total} file(s)`));
        }
        if (result.metadata?.artifacts) {
          console.log(chalk.blue(`  Artifacts: ${result.metadata.artifacts.total} file(s)`));
        }
        if (result.metadata?.visualTesting) {
          const vt = result.metadata.visualTesting;
          console.log(
            chalk.cyan(
              `  Visual: ${vt.passRate > 0 ? (vt.passRate * 100).toFixed(0) + '% pass' : 'N/A'}`
            )
          );
        }

        const reportPath = await reporter.generateReport(result);
        console.log(chalk.blue(`\n📊 Report: ${reportPath}`));

        if (config.htmlReport) {
          const htmlReportDir = path.join(
            config.outputDir,
            config.htmlReportDir || 'html-report',
            'index.html'
          );
          if (fs.existsSync(htmlReportDir)) {
            console.log(chalk.blue(`📄 Playwright HTML Report: ${htmlReportDir}`));
          }
        }
      });

      const result = await executor.execute({
        tagFilter: options.tags ? options.tags.split(',') : undefined,
        grepPattern: options.grep,
        projectFilter: options.projectFilter,
        updateSnapshots: options.updateSnapshots,
        testLocations: testFiles && testFiles.length > 0 ? testFiles : undefined,
      });
      spinner.succeed(`Run completed: ${result.passed}/${result.totalTests} passed`);
    } catch (error: unknown) {
      spinner.fail(`Run failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program
  .command('orchestrate')
  .description('Plan test orchestration without running')
  .option('-t, --test-dir <path>', 'Test directory', './')
  .option('-s, --shards <number>', 'Number of shards', '1')
  .action(async (options) => {
    const spinner = ora('Discovering tests...').start();

    try {
      const orchestrator = new Orchestrator({
        version: 'temp',
        testDir: options.testDir,
        outputDir: './temp',
        shards: parseInt(options.shards) || 1,
      });

      await orchestrator.initialize();
      const config = await orchestrator.orchestrate();

      spinner.succeed(`Discovered ${config.testAssignment.length} tests`);

      console.log(chalk.bold('\n📋 Test Distribution:'));
      console.log(`  Strategy: ${config.strategy}`);
      console.log(`  Total Shards: ${config.totalShards}`);

      for (let i = 0; i < config.totalShards; i++) {
        const tests = config.testAssignment.filter((t) => t.shardId === i);
        console.log(chalk.blue(`\n  Shard ${i + 1}/${config.totalShards}:`));
        tests.slice(0, 5).forEach((t) => {
          console.log(`    - ${path.basename(t.testId)}`);
        });
        if (tests.length > 5) {
          console.log(`    ... and ${tests.length - 5} more`);
        }
      }
    } catch (error: unknown) {
      spinner.fail(`Failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program
  .command('report')
  .description('Show test reports')
  .option('-l, --limit <number>', 'Number of reports to show', '10')
  .option('-i, --id <id>', 'Specific report ID')
  .option('-o, --open', 'Open report in browser')
  .action(async (options) => {
    const reporter = new Reporter('./test-reports');

    if (options.id) {
      const report = await reporter.getReport(options.id);
      if (!report) {
        console.log(chalk.red(`Report ${options.id} not found`));
        return;
      }
      console.log(chalk.bold(`\n📊 Report: ${report.id}`));
      console.log(`  Version: ${report.version}`);
      console.log(`  Status: ${report.status}`);
      console.log(`  Passed: ${chalk.green(report.passed)}`);
      console.log(`  Failed: ${chalk.red(report.failed)}`);
      console.log(`  Duration: ${((report.duration || 0) / 1000).toFixed(2)}s`);

      if (report.metadata?.annotations) {
        console.log(`  Annotations: ${report.metadata.annotations.length}`);
      }
      if (report.metadata?.tags) {
        console.log(`  Tags: ${report.metadata.tags.length}`);
      }
      if (report.metadata?.traces) {
        console.log(`  Traces: ${report.metadata.traces.total}`);
      }
      if (report.metadata?.artifacts) {
        console.log(`  Artifacts: ${report.metadata.artifacts.total}`);
      }
    } else {
      const reports = await reporter.getAllReports();
      const recent = reports.slice(-parseInt(options.limit));

      console.log(chalk.bold('\n📋 Recent Reports:'));
      if (recent.length === 0) {
        console.log(chalk.yellow('  No reports found'));
        return;
      }

      recent.reverse().forEach((report) => {
        const time = dayjs(report.startTime).format('YYYY-MM-DD HH:mm');
        console.log(
          `  ${time} | ${report.status.toUpperCase().padEnd(10)} | ${report.passed}/${report.totalTests} passed`
        );
      });
    }
  });

program
  .command('flaky')
  .description('Manage flaky tests')
  .option('-l, --list', 'List all flaky tests')
  .option('-q, --quarantined', 'List quarantined tests')
  .option('--quarantine <id>', 'Quarantine a test')
  .option('--release <id>', 'Release a test from quarantine')
  .option('--threshold <rate>', 'Flaky threshold (0-1)', '0.3')
  .action(async (options) => {
    const flakyManager = new FlakyTestManager('./test-data');

    if (options.list) {
      const flaky = flakyManager.getFlakyTests(parseFloat(options.threshold));
      console.log(chalk.bold(`\n🐌 Flaky Tests (threshold: ${options.threshold}):`));
      if (flaky.length === 0) {
        console.log(chalk.green('  No flaky tests found'));
        return;
      }
      flaky.forEach((test) => {
        const rate = (test.failureRate * 100).toFixed(0);
        console.log(`  ${chalk.red(rate + '%')} | ${test.title}`);
        console.log(
          `            Runs: ${test.totalRuns}, Last: ${test.lastFailure ? dayjs(test.lastFailure).fromNow() : 'N/A'}`
        );
      });
    } else if (options.quarantined) {
      const quarantined = flakyManager.getQuarantinedTests();
      console.log(chalk.bold('\n🔒 Quarantined Tests:'));
      if (quarantined.length === 0) {
        console.log(chalk.green('  No quarantined tests'));
        return;
      }
      quarantined.forEach((test) => {
        console.log(`  ${chalk.red((test.failureRate * 100).toFixed(0) + '%')} | ${test.title}`);
      });
    } else if (options.quarantine) {
      const success = await flakyManager.quarantineTest(options.quarantine);
      if (success) {
        console.log(chalk.green(`  Test ${options.quarantine} quarantined`));
      } else {
        console.log(chalk.red(`  Failed to quarantine test`));
      }
    } else if (options.release) {
      const success = await flakyManager.releaseTest(options.release);
      if (success) {
        console.log(chalk.green(`  Test ${options.release} released`));
      } else {
        console.log(chalk.red(`  Failed to release test`));
      }
    } else {
      const stats = flakyManager.getQuarantineStats();
      console.log(chalk.bold('\n📊 Flaky Test Stats:'));
      console.log(`  Total tracked: ${stats.totalTests}`);
      console.log(`  Flaky rate: ${stats.flakyRate.toFixed(1)}%`);
      console.log(`  Quarantined: ${chalk.red(stats.quarantined)}`);
      console.log(`  Top flaky:`);
      stats.topFlaky.slice(0, 5).forEach((test) => {
        console.log(`    ${chalk.red((test.failureRate * 100).toFixed(0) + '%')} | ${test.title}`);
      });
    }
  });

program
  .command('ui')
  .description('Start the web dashboard')
  .option('-p, --port <number>', 'Port to listen on', '5274')
  .option('-o, --output <path>', 'Reports directory')
  .option('-d, --data <path>', 'Data directory')
  .action(async (options) => {
    console.log(chalk.blue(`\n🚀 Starting YuanTest Dashboard...`));
    console.log(chalk.gray(`   http://localhost:${options.port}`));

    const fileConfig = await loadConfigFile();
    const dashboardConfig = getDashboardConfig(fileConfig);

    const server = new DashboardServer(
      parseInt(options.port) || dashboardConfig.port,
      options.output || dashboardConfig.outputDir,
      options.data || dashboardConfig.dataDir
    );

    await server.start();

    console.log(chalk.green('\n✅ Dashboard is running'));
    console.log(chalk.gray('Press Ctrl+C to stop\n'));

    process.on('SIGINT', async () => {
      console.log(chalk.yellow('\n\nStopping dashboard...'));
      await server.stop();
      process.exit(0);
    });
  });

program
  .command('analyze')
  .description('Analyze test failures')
  .option('-i, --id <id>', 'Run ID to analyze')
  .action(async (options) => {
    if (!options.id) {
      console.log(chalk.red('Please specify a run ID with --id'));
      return;
    }

    const reporter = new Reporter('./test-reports');
    const run = await reporter.getReport(options.id);

    if (!run) {
      console.log(chalk.red(`Run ${options.id} not found`));
      return;
    }

    const analysis = await reporter.analyzeFailures(run);

    console.log(chalk.bold(`\n🔍 Failure Analysis for ${options.id}:`));
    console.log(`  Total failures: ${chalk.red(analysis.length)}\n`);

    analysis.forEach((item, index) => {
      console.log(chalk.bold(`${index + 1}. ${item.title}`));
      console.log(`   Category: ${chalk.yellow(item.category)}`);
      console.log(`   Reason: ${chalk.red(item.failureReason)}`);
      console.log(`   Occurrences: ${item.occurrences}`);

      if (item.suggestions.length > 0) {
        console.log(chalk.green('   Suggestions:'));
        item.suggestions.forEach((s) => {
          console.log(chalk.gray(`     - ${s}`));
        });
      }
      console.log();
    });
  });

program
  .command('trace')
  .description('Manage and view Playwright traces')
  .option('-l, --list', 'List all traces')
  .option('--dir <path>', 'Traces directory', './traces')
  .option('--view <path>', 'Open a trace file in the viewer')
  .option('--port <number>', 'Trace viewer port', '9323')
  .option('--clean', 'Clean traces older than 7 days', false)
  .option('--stats', 'Show trace statistics', false)
  .action(async (options) => {
    const traceManager = new TraceManager(
      {
        enabled: true,
        mode: 'on',
        screenshots: true,
        snapshots: true,
        sources: true,
        attachments: true,
      },
      options.dir
    );

    if (options.view) {
      const spinner = ora('Starting trace viewer...').start();
      try {
        const url = await traceManager.openTraceViewer(options.view, parseInt(options.port));
        spinner.succeed(`Trace viewer running at ${chalk.blue(url)}`);
      } catch (error: unknown) {
        spinner.fail(
          `Failed to start trace viewer: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      return;
    }

    if (options.clean) {
      const spinner = ora('Cleaning old traces...').start();
      const deleted = await traceManager.cleanTraces();
      spinner.succeed(`Cleaned ${deleted} old trace(s)`);
      return;
    }

    if (options.stats) {
      const stats = await traceManager.getTraceStats();
      console.log(chalk.bold('\n📊 Trace Statistics:'));
      console.log(`  Total traces: ${stats.totalTraces}`);
      console.log(`  Total size: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  By browser:`);
      for (const [browser, count] of Object.entries(stats.byBrowser)) {
        console.log(`    ${browser}: ${count}`);
      }
      return;
    }

    const traces = await traceManager.discoverTraces();
    console.log(chalk.bold(`\n🔍 Traces (${traces.length} total):`));

    if (traces.length === 0) {
      console.log(chalk.yellow('  No traces found'));
      return;
    }

    traces.slice(0, 20).forEach((trace) => {
      const size = (trace.size / 1024).toFixed(1);
      const time = dayjs(trace.timestamp).format('YYYY-MM-DD HH:mm');
      console.log(`  ${time} | ${trace.testName} | ${size} KB`);
    });

    if (traces.length > 20) {
      console.log(chalk.gray(`  ... and ${traces.length - 20} more`));
    }
  });

program
  .command('annotations')
  .description('Scan and manage test annotations')
  .option('-t, --test-dir <path>', 'Test directory', './')
  .option('-o, --output <path>', 'Output report path', './annotation-report.json')
  .action(async (options) => {
    const spinner = ora('Scanning annotations...').start();
    const annotationManager = new AnnotationManager();

    const annotations = await annotationManager.scanDirectory(options.testDir);
    spinner.succeed(`Found ${annotations.length} annotation(s)`);

    const summary = annotationManager.getSummary();
    console.log(chalk.bold('\n📝 Annotations Summary:'));
    console.log(`  Total: ${summary.total}`);

    if (Object.keys(summary.byType).length > 0) {
      console.log('  By type:');
      for (const [type, count] of Object.entries(summary.byType)) {
        const color =
          type === 'skip' || type === 'fixme'
            ? 'yellow'
            : type === 'fail'
              ? 'red'
              : type === 'slow'
                ? 'blue'
                : 'gray';
        console.log(`    @${type}: ${chalk[color](count)}`);
      }
    }

    if (Object.keys(summary.byFile).length > 0) {
      console.log('  By file:');
      for (const [file, count] of Object.entries(summary.byFile)) {
        console.log(`    ${path.basename(file)}: ${count}`);
      }
    }

    await annotationManager.generateAnnotationReport(options.output);
    console.log(chalk.blue(`\n📄 Report saved to: ${options.output}`));
  });

program
  .command('tags')
  .description('Scan and manage test tags')
  .option('-t, --test-dir <path>', 'Test directory', './')
  .option('-o, --output <path>', 'Output report path', './tag-report.json')
  .option('--run <tags>', 'Run tests with specific tags (comma separated)')
  .action(async (options) => {
    const tagManager = new TagManager();
    const spinner = ora('Scanning tags...').start();

    const tags = await tagManager.scanDirectory(options.testDir);
    spinner.succeed(`Found ${tags.length} tag(s)`);

    const summary = tagManager.getSummary();
    console.log(chalk.bold('\n🏷️  Tags Summary:'));
    console.log(`  Total tags: ${summary.totalTags}`);
    console.log(`  Tagged tests: ${summary.totalTaggedTests}`);

    if (summary.tags.length > 0) {
      console.log('  Tags:');
      summary.tags.forEach((tag) => {
        console.log(`    @${chalk.magenta(tag.name)}: ${tag.count} test(s)`);
      });
    }

    await tagManager.generateTagReport(options.output);
    console.log(chalk.blue(`\n📄 Report saved to: ${options.output}`));
  });

program
  .command('artifacts')
  .description('Manage test artifacts (screenshots, videos, etc.)')
  .option('-l, --list', 'List all artifacts')
  .option('--dir <path>', 'Artifacts directory', './artifacts')
  .option('--stats', 'Show artifact statistics', false)
  .option('--clean', 'Clean artifacts older than 7 days', false)
  .option('--run-id <id>', 'Filter by run ID')
  .action(async (options) => {
    const artifactManager = new ArtifactManager(
      { enabled: true, screenshots: 'on', videos: 'on' },
      options.dir
    );

    if (options.clean) {
      const spinner = ora('Cleaning old artifacts...').start();
      const deleted = await artifactManager.cleanArtifacts();
      spinner.succeed(`Cleaned ${deleted} old artifact(s)`);
      return;
    }

    if (options.stats) {
      const stats = await artifactManager.getArtifactStats();
      console.log(chalk.bold('\n📊 Artifact Statistics:'));
      console.log(`  Total artifacts: ${stats.totalArtifacts}`);
      console.log(`  Total size: ${artifactManager.formatSize(stats.totalSize)}`);
      console.log('  By type:');
      for (const [type, count] of Object.entries(stats.byType)) {
        const size = artifactManager.formatSize(
          stats.byTypeSize[type as keyof typeof stats.byType] || 0
        );
        console.log(`    ${type}: ${count} (${size})`);
      }
      return;
    }

    const artifacts = await artifactManager.discoverArtifacts(options.runId);
    console.log(chalk.bold(`\n📁 Artifacts (${artifacts.length} total):`));

    if (artifacts.length === 0) {
      console.log(chalk.yellow('  No artifacts found'));
      return;
    }

    const byType: Record<string, typeof artifacts> = {};
    for (const a of artifacts) {
      if (!byType[a.type]) {
        byType[a.type] = [];
      }
      byType[a.type].push(a);
    }

    for (const [type, items] of Object.entries(byType)) {
      console.log(chalk.bold(`\n  ${type} (${items.length}):`));
      items.slice(0, 10).forEach((a: Artifact) => {
        const size = artifactManager.formatSize(a.size);
        console.log(`    ${a.fileName} | ${size} | ${a.testName}`);
      });
      if (items.length > 10) {
        console.log(chalk.gray(`    ... and ${items.length - 10} more`));
      }
    }
  });

program
  .command('visual')
  .description('Visual testing - compare screenshots and manage baselines')
  .option('--dir <path>', 'Visual testing directory', './visual-testing')
  .option('--threshold <ratio>', 'Diff threshold (0-1)', '0.2')
  .option('--update', 'Update all baselines with current screenshots', false)
  .option('--report <path>', 'Generate visual testing report', './visual-report.json')
  .option('--stats', 'Show visual testing statistics', false)
  .action(async (options) => {
    const visualManager = new VisualTestingManager(
      {
        enabled: true,
        threshold: parseFloat(options.threshold) || 0.2,
        maxDiffPixelRatio: 0.01,
        maxDiffPixels: 10,
        updateSnapshots: false,
      },
      options.dir
    );

    if (options.update) {
      const spinner = ora('Updating baselines...').start();
      const updated = await visualManager.updateAllBaselines();
      spinner.succeed(`Updated ${updated} baseline(s)`);
      return;
    }

    if (options.stats) {
      const summary = visualManager.getSummary();
      console.log(chalk.bold('\n🎨 Visual Testing Statistics:'));
      console.log(`  Total tests: ${summary.total}`);
      console.log(`  Identical: ${chalk.green(summary.identical)}`);
      console.log(`  Different: ${chalk.yellow(summary.different)}`);
      console.log(`  Regression: ${chalk.red(summary.regression)}`);
      console.log(`  New: ${chalk.blue(summary.new)}`);
      console.log(`  Missing: ${chalk.gray(summary.missing)}`);
      console.log(
        `  Pass rate: ${summary.passRate > 0 ? (summary.passRate * 100).toFixed(1) + '%' : 'N/A'}`
      );
      return;
    }

    await visualManager.initialize();
    const summary = visualManager.getSummary();
    console.log(chalk.bold('\n🎨 Visual Testing:'));
    console.log(
      `  Pass rate: ${summary.passRate > 0 ? (summary.passRate * 100).toFixed(1) + '%' : 'N/A'}`
    );

    if (options.report) {
      await visualManager.generateVisualReport(options.report);
      console.log(chalk.blue(`\n📄 Report saved to: ${options.report}`));
    }
  });

program
  .command('show-report')
  .description('Open Playwright HTML report in browser')
  .option('-p, --path <path>', 'Path to HTML report', './test-output/html-report')
  .action(async (options) => {
    const reportPath = path.join(options.path, 'index.html');
    if (!fs.existsSync(reportPath)) {
      console.log(chalk.red(`HTML report not found at ${reportPath}`));
      console.log(chalk.gray('Run tests with --html-report to generate one'));
      return;
    }

    const { spawn } = require('child_process');
    console.log(chalk.blue(`Opening report: ${reportPath}`));
    spawn('npx', ['playwright', 'show-report', options.path], {
      stdio: 'inherit',
      shell: true,
    });
  });

if (!process.argv.slice(2).length) {
  program.outputHelp();
}

program.parse(process.argv);
