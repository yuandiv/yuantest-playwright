#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import { Orchestrator } from '../orchestrator';
import { Executor } from '../executor';
import { Reporter } from '../reporter';
import { FlakyTestManager } from '../flaky';
import { DashboardServer } from '../ui/server';
import { TraceManager } from '../trace';
import { AnnotationManager } from '../annotations';
import { TagManager } from '../tags';
import { ArtifactManager } from '../artifacts';
import { VisualTestingManager } from '../visual';
import { loadConfigFile, mergeConfig, getDashboardConfig } from '../config/loader';
import { TestConfig, TestResult, BrowserType, Artifact, RootCauseAnalysis } from '../types';
import { logger } from '../logger';
import dayjs from 'dayjs';
import { getStorage } from '../storage';
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
        outputDir: options.output || './test-reports',
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
    const flakyManager = new FlakyTestManager('./test-data', {}, getStorage());
    try {
      const prefsPath = path.join('./test-data', 'user-preferences.json');
      if (fs.existsSync(prefsPath)) {
        const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf-8'));
        if (prefs?.autoQuarantine !== undefined && typeof prefs.autoQuarantine === 'boolean') {
          flakyManager.setConfig({ autoQuarantine: prefs.autoQuarantine });
        }
        if (prefs?.flakyCriteria && typeof prefs.flakyCriteria === 'object') {
          flakyManager.setConfig({ flakyCriteria: prefs.flakyCriteria });
        }
        if (prefs?.quarantineCriteria && typeof prefs.quarantineCriteria === 'object') {
          flakyManager.setConfig({ quarantineCriteria: prefs.quarantineCriteria });
        }
      }
    } catch {
      // ignore
    }

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
  .option('--json', 'Output in JSON format')
  .option('--ai', 'Enable AI diagnosis for each failure')
  .option('--cluster', 'Perform cluster analysis on failures')
  .option(
    '--filter <category>',
    'Filter by category (timeout/selector/network/assertion/frame/auth/unknown)'
  )
  .action(async (options) => {
    try {
      if (!options.id) {
        console.error(chalk.red('Please specify a run ID with --id'));
        process.exit(1);
      }

      const reporter = new Reporter();
      const run = await reporter.getReport(options.id);
      if (!run) {
        console.error(chalk.red(`Run ${options.id} not found`));
        process.exit(1);
      }

      let analysis = await reporter.analyzeFailures(run);

      if (options.filter) {
        const validCategories = [
          'timeout',
          'selector',
          'network',
          'assertion',
          'frame',
          'auth',
          'unknown',
        ];
        if (!validCategories.includes(options.filter)) {
          console.error(
            chalk.red(
              `Invalid filter category: ${options.filter}. Valid: ${validCategories.join(', ')}`
            )
          );
          process.exit(1);
        }
        analysis = analysis.filter((a) => a.category === options.filter);
      }

      if (options.ai) {
        try {
          const { DiagnosisService } = await import('../diagnosis');
          const diagnosisService = new DiagnosisService('./test-data');
          const flakyManager = new FlakyTestManager('./test-data', {}, getStorage());
          const config = diagnosisService.getMaskedConfig();
          if (config.enabled) {
            console.log(chalk.cyan('\n🤖 Running AI diagnosis...'));
            for (const item of analysis) {
              try {
                let rootCauseData: RootCauseAnalysis | undefined;
                try {
                  const flakyTests = flakyManager.getFlakyTests();
                  const flakyTest = flakyTests.find((ft) => ft.testId === item.testId);
                  if (flakyTest?.rootCause) {
                    rootCauseData = flakyTest.rootCause;
                  }
                } catch {
                  // Ignore errors when accessing flaky test data
                }

                const testFromRun = run.suites
                  .flatMap((s) => s.tests)
                  .find((t) => t.id === item.testId);

                const diagnosis = await diagnosisService.diagnose(
                  {
                    title: item.title,
                    error: item.failureReason,
                    stackTrace: testFromRun?.stackTrace || item.stackTrace,
                    filePath: item.filePath,
                    lineNumber: item.lineNumber,
                    screenshots: testFromRun?.screenshots,
                    logs: testFromRun?.logs,
                    browser: testFromRun?.browser,
                  },
                  'zh',
                  String(run.id),
                  item.testId,
                  rootCauseData
                );
                if (diagnosis && diagnosis.analysisMode !== 'fallback') {
                  item.aiDiagnosis = diagnosis;
                }
              } catch (e) {
                console.log(
                  chalk.yellow(
                    `  AI diagnosis failed for "${item.title}": ${e instanceof Error ? e.message : String(e)}`
                  )
                );
              }
            }
          } else {
            console.log(
              chalk.yellow('\n⚠️  AI diagnosis is not enabled. Showing basic analysis only.')
            );
            console.log(chalk.gray('   Configure LLM via: yuantest ui → Settings → AI Diagnosis'));
          }
        } catch (e) {
          console.log(
            chalk.yellow(
              `\n⚠️  AI diagnosis unavailable: ${e instanceof Error ? e.message : String(e)}`
            )
          );
        }
      }

      let clusterResult = null;
      if (options.cluster) {
        if (analysis.length < 2) {
          console.log(
            chalk.yellow('\n⚠️  Not enough failed tests for cluster analysis (minimum 2 required)')
          );
        } else {
          try {
            const { clusterFailures } = await import('../diagnosis/cluster');
            const failedTests = analysis.map((a) => ({
              id: a.testId,
              title: a.title,
              status: 'failed' as const,
              error: a.failureReason,
              duration: 0,
              retries: 0,
              timestamp: Date.now(),
              browser: 'chromium' as const,
            }));
            clusterResult = clusterFailures(failedTests);
            if (clusterResult.length === 0) {
              console.log(chalk.gray('\n📊 No significant clusters found among failures'));
            }
          } catch (e) {
            console.log(
              chalk.yellow(
                `\n⚠️  Cluster analysis failed: ${e instanceof Error ? e.message : String(e)}`
              )
            );
          }
        }
      }

      if (options.json) {
        const output: Record<string, unknown> = { failures: analysis };
        if (clusterResult) {
          output.clusters = clusterResult;
        }
        console.log(JSON.stringify(output, null, 2));
      } else {
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
          if (item.aiDiagnosis) {
            console.log(chalk.cyan('   AI Diagnosis:'));
            console.log(chalk.cyan(`     Summary: ${item.aiDiagnosis.summary}`));
            console.log(chalk.cyan(`     Root Cause: ${item.aiDiagnosis.rootCause}`));
            console.log(
              chalk.cyan(
                `     Confidence: ${(item.aiDiagnosis.calibratedConfidence * 100).toFixed(0)}%`
              )
            );
            if (item.aiDiagnosis.suggestions.length > 0) {
              console.log(chalk.cyan('     AI Suggestions:'));
              item.aiDiagnosis.suggestions.forEach((s) => {
                console.log(chalk.gray(`       - ${s}`));
              });
            }
          }
          console.log('');
        });

        if (clusterResult && clusterResult.length > 0) {
          console.log(chalk.bold('\n📊 Cluster Analysis:'));
          clusterResult.forEach((cluster, index) => {
            console.log(chalk.bold(`  Cluster ${index + 1}:`));
            console.log(`    Category: ${chalk.yellow(cluster.category)}`);
            console.log(`    Similarity: ${(cluster.similarity * 100).toFixed(0)}%`);
            console.log(`    Tests (${cluster.testIds.length}):`);
            cluster.testIds.forEach((id) => {
              console.log(chalk.gray(`      - ${id}`));
            });
            console.log('');
          });
        }
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
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

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { spawn } = require('child_process');
    console.log(chalk.blue(`Opening report: ${reportPath}`));
    spawn('npx', ['playwright', 'show-report', options.path], {
      stdio: 'inherit',
      shell: true,
    });
  });

program
  .command('test-history <testId>')
  .description('View test run history')
  .option('--page <number>', 'Page number', '1')
  .option('--page-size <number>', 'Page size', '10')
  .option('--json', 'Output in JSON format')
  .action(async (testId, options) => {
    try {
      const reporter = new Reporter('./test-reports');
      const allReports = await reporter.getAllReports();
      const sortedReports = allReports
        .filter((r) => r.status !== 'running')
        .sort((a, b) => (b.startTime || 0) - (a.startTime || 0));

      const allHistoryEntries: Array<{
        runId: string;
        version: string;
        status: string;
        duration: number;
        error?: string;
        timestamp: number;
        retries: number;
        manualReruns?: number;
      }> = [];

      for (const report of sortedReports) {
        for (const suite of report.suites) {
          const test = suite.tests.find((t) => t.id === testId);
          if (test) {
            allHistoryEntries.push({
              runId: report.id,
              version: report.version,
              status: test.status,
              duration: test.duration,
              error: test.error,
              timestamp: test.timestamp || report.startTime,
              retries: test.retries || 0,
              manualReruns: test.manualReruns,
            });
            break;
          }
        }
      }

      const total = allHistoryEntries.length;
      const passedCount = allHistoryEntries.filter((e) => e.status === 'passed').length;
      const failedCount = allHistoryEntries.filter((e) => e.status === 'failed').length;
      const stability = total > 0 ? ((passedCount / total) * 100).toFixed(2) : '0.00';

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              testId,
              summary: {
                stability: parseFloat(stability),
                totalRuns: total,
                passed: passedCount,
                failed: failedCount,
              },
              history: allHistoryEntries,
            },
            null,
            2
          )
        );
        return;
      }

      console.log(chalk.bold(`\n📜 Test History: ${testId}`));
      console.log(
        `  Stability: ${parseFloat(stability) >= 80 ? chalk.green(stability + '%') : chalk.red(stability + '%')}`
      );
      console.log(`  Total runs: ${total}`);
      console.log(`  Passed: ${chalk.green(passedCount)} | Failed: ${chalk.red(failedCount)}`);

      const page = parseInt(options.page);
      const pageSize = parseInt(options.pageSize);
      const start = (page - 1) * pageSize;
      const entries = allHistoryEntries.slice(start, start + pageSize);

      console.log(chalk.bold(`\n  Recent runs (page ${page}):`));
      entries.forEach((entry) => {
        const time = dayjs(entry.timestamp).format('YYYY-MM-DD HH:mm');
        const statusIcon = entry.status === 'passed' ? '✅' : '❌';
        console.log(
          `  ${statusIcon} ${time} | ${entry.status} | ${entry.duration}ms | Run: ${entry.runId}`
        );
        if (entry.error) {
          console.log(chalk.gray(`     Error: ${entry.error.substring(0, 100)}`));
        }
      });
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program
  .command('error-patterns')
  .description('Manage error patterns')
  .option('-l, --list', 'List all error patterns')
  .option('--custom', 'List custom error patterns only')
  .option('--add <json>', 'Add a custom error pattern (JSON string)')
  .option('--delete <id>', 'Delete a custom error pattern')
  .action(async (options) => {
    try {
      const { getAllPatterns, getCustomPatterns, registerPattern, unregisterPattern } =
        await import('../diagnosis/knowledge-base');

      if (options.add) {
        const pattern = JSON.parse(options.add);
        if (
          !pattern.id ||
          !pattern.category ||
          !pattern.name ||
          !pattern.regex ||
          !pattern.rootCauseTemplate ||
          !pattern.suggestionsTemplate
        ) {
          console.error(
            chalk.red(
              'Missing required fields: id, category, name, regex, rootCauseTemplate, suggestionsTemplate'
            )
          );
          process.exit(1);
        }
        registerPattern({
          ...pattern,
          regex: pattern.regex.map((r: string) => new RegExp(r, 'i')),
          description: pattern.description || '',
          docLinks: pattern.docLinks || [],
        });
        console.log(chalk.green(`✅ Error pattern "${pattern.id}" added`));
        return;
      }

      if (options.delete) {
        const removed = unregisterPattern(options.delete);
        if (removed) {
          console.log(chalk.green(`✅ Error pattern "${options.delete}" deleted`));
        } else {
          console.log(chalk.red(`Pattern "${options.delete}" not found`));
        }
        return;
      }

      const patterns = options.custom ? getCustomPatterns() : getAllPatterns();
      const label = options.custom ? 'Custom Error Patterns' : 'All Error Patterns';
      console.log(chalk.bold(`\n🔍 ${label} (${patterns.length}):`));

      if (patterns.length === 0) {
        console.log(chalk.yellow('  No patterns found'));
        return;
      }

      patterns.forEach((p) => {
        const isCustom = !p.id.match(/^(timeout|selector|assertion|network|frame|auth)-/);
        const tag = isCustom ? chalk.magenta(' [custom]') : '';
        console.log(`  ${chalk.bold(p.name)}${tag}`);
        console.log(`    ID: ${p.id} | Category: ${chalk.yellow(p.category)}`);
        console.log(`    Regex: ${p.regex.map((r: RegExp) => r.source).join(', ')}`);
      });
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program
  .command('llm-config')
  .description('Manage LLM diagnosis configuration')
  .option('--show', 'Show current LLM configuration')
  .option('--set <json>', 'Update LLM configuration (JSON string)')
  .option('--test', 'Test LLM connection')
  .option('--status', 'Check LLM status')
  .action(async (options) => {
    try {
      const { DiagnosisService } = await import('../diagnosis');
      const diagnosisService = new DiagnosisService('./test-data');

      if (options.set) {
        const config = JSON.parse(options.set);
        await diagnosisService.saveConfig(config);
        console.log(chalk.green('✅ LLM configuration updated'));
        const masked = diagnosisService.getMaskedConfig();
        console.log(JSON.stringify(masked, null, 2));
        return;
      }

      if (options.test) {
        const spinner = ora('Testing LLM connection...').start();
        const config = diagnosisService.getMaskedConfig();
        const result = await diagnosisService.testConnection(config);
        if (result.success) {
          spinner.succeed('LLM connection successful');
        } else {
          spinner.fail(`LLM connection failed: ${result.error || 'Unknown error'}`);
        }
        return;
      }

      if (options.status) {
        const status = await diagnosisService.getStatus();
        console.log(chalk.bold('\n🤖 LLM Status:'));
        console.log(`  Configured: ${status.configured ? chalk.green('Yes') : chalk.red('No')}`);
        console.log(`  Connected: ${status.connected ? chalk.green('Yes') : chalk.red('No')}`);
        console.log(
          `  Status: ${status.status === 'green' ? chalk.green('🟢 Green') : status.status === 'yellow' ? chalk.yellow('🟡 Yellow') : chalk.red('🔴 Red')}`
        );
        return;
      }

      const config = diagnosisService.getMaskedConfig();
      console.log(chalk.bold('\n🤖 LLM Configuration:'));
      console.log(`  Enabled: ${config.enabled ? chalk.green('Yes') : chalk.red('No')}`);
      console.log(`  Base URL: ${config.baseUrl || 'Not set'}`);
      console.log(`  Model: ${config.model || 'Not set'}`);
      console.log(`  API Key: ${config.apiKey ? 'sk-****' : 'Not set'}`);
      console.log(`  Max Tokens: ${config.maxTokens}`);
      console.log(`  Temperature: ${config.temperature}`);
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program
  .command('health')
  .description('View test health metrics')
  .option('--json', 'Output in JSON format')
  .option('-l, --limit <number>', 'Number of recent runs to analyze', '10')
  .action(async (options) => {
    try {
      const reporter = new Reporter('./test-reports');
      const allReports = await reporter.getAllReports();
      const recent = allReports.slice(-parseInt(options.limit)).reverse();

      if (recent.length === 0) {
        console.log(chalk.yellow('No test runs found'));
        return;
      }

      const metrics = recent.map((run) => ({
        date: dayjs(run.startTime).format('YYYY-MM-DD HH:mm'),
        totalTests: run.totalTests,
        passed: run.passed,
        failed: run.failed,
        passRate: run.totalTests > 0 ? ((run.passed / run.totalTests) * 100).toFixed(1) : '0.0',
        duration: ((run.duration || 0) / 1000).toFixed(2),
      }));

      if (options.json) {
        console.log(JSON.stringify(metrics, null, 2));
        return;
      }

      const avgPassRate =
        metrics.reduce((sum, m) => sum + parseFloat(m.passRate), 0) / metrics.length;
      const avgDuration =
        metrics.reduce((sum, m) => sum + parseFloat(m.duration), 0) / metrics.length;

      console.log(chalk.bold('\n💊 Test Health Metrics:'));
      console.log(`  Recent runs: ${metrics.length}`);
      console.log(
        `  Average pass rate: ${avgPassRate >= 80 ? chalk.green(avgPassRate.toFixed(1) + '%') : chalk.red(avgPassRate.toFixed(1) + '%')}`
      );
      console.log(`  Average duration: ${avgDuration.toFixed(2)}s`);

      const flakyManager = new FlakyTestManager('./test-data', {}, getStorage());
      const flakyStats = flakyManager.getQuarantineStats();
      console.log(`  Flaky tests: ${chalk.yellow(flakyStats.totalTests)}`);
      console.log(`  Quarantined: ${chalk.red(flakyStats.quarantined)}`);

      console.log(chalk.bold('\n  Recent runs:'));
      metrics.forEach((m) => {
        const rate = parseFloat(m.passRate);
        const rateStr = rate >= 80 ? chalk.green(m.passRate + '%') : chalk.red(m.passRate + '%');
        console.log(`  ${m.date} | ${rateStr} | ${m.passed}/${m.totalTests} | ${m.duration}s`);
      });
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program
  .command('prediction')
  .description('View test failure predictions')
  .option('--high-risk', 'List high-risk tests')
  .option('--test <testId>', 'View prediction for a specific test')
  .option('--duration-anomalies', 'View duration anomalies')
  .option('--json', 'Output in JSON format')
  .action(async (options) => {
    try {
      const flakyManager = new FlakyTestManager('./test-data', {}, getStorage());

      if (options.test) {
        const prediction = await flakyManager.predictTestFailure(options.test);
        if (!prediction) {
          console.log(chalk.yellow(`No prediction data for test: ${options.test}`));
          return;
        }
        if (options.json) {
          console.log(JSON.stringify(prediction, null, 2));
          return;
        }
        console.log(chalk.bold(`\n🔮 Prediction for ${options.test}:`));
        console.log(`  Will fail: ${prediction.willFail ? chalk.red('Yes') : chalk.green('No')}`);
        console.log(`  Probability: ${(prediction.probability * 100).toFixed(0)}%`);
        console.log(`  Confidence: ${(prediction.confidence * 100).toFixed(0)}%`);
        console.log(`  Recommended action: ${prediction.recommendedAction}`);
        if (prediction.signals.length > 0) {
          console.log('  Signals:');
          prediction.signals.forEach((s) => {
            console.log(
              `    ${chalk.yellow(s.type)}: ${s.description} (strength: ${s.strength.toFixed(2)})`
            );
          });
        }
        return;
      }

      if (options.durationAnomalies) {
        const anomalies = await flakyManager.getDurationAnomalies();
        if (options.json) {
          console.log(JSON.stringify(anomalies, null, 2));
          return;
        }
        console.log(chalk.bold('\n⏱️  Duration Anomalies:'));
        if (anomalies.length === 0) {
          console.log(chalk.green('  No anomalies detected'));
          return;
        }
        anomalies.forEach((a) => {
          console.log(
            `  ${chalk.red(a.testId)}: z-score=${a.zScore.toFixed(2)}, baseline=${a.baseline}ms, current=${a.current}ms`
          );
        });
        return;
      }

      const highRisk = await flakyManager.getHighRiskTests();
      if (options.json) {
        console.log(JSON.stringify(highRisk, null, 2));
        return;
      }
      console.log(chalk.bold('\n⚠️  High-Risk Tests:'));
      if (highRisk.length === 0) {
        console.log(chalk.green('  No high-risk tests detected'));
        return;
      }
      highRisk.forEach((p) => {
        console.log(
          `  ${chalk.red(p.testId)}: willFail=${p.willFail ? 'Yes' : 'No'}, probability=${(p.probability * 100).toFixed(0)}%, confidence=${(p.confidence * 100).toFixed(0)}%`
        );
      });
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program
  .command('correlations')
  .description('View test correlation analysis')
  .option('--causal-graph', 'Show causal graph summary')
  .option('--json', 'Output in JSON format')
  .action(async (options) => {
    try {
      const flakyManager = new FlakyTestManager('./test-data', {}, getStorage());

      if (options.causalGraph) {
        const graph = await flakyManager.buildCausalGraph();
        if (options.json) {
          console.log(
            JSON.stringify(
              {
                nodes: graph.nodes,
                edges: graph.edges,
                rootCauses: graph.rootCauses,
              },
              null,
              2
            )
          );
          return;
        }
        console.log(chalk.bold('\n🕸️  Causal Graph:'));
        console.log(`  Nodes: ${graph.nodes.length}`);
        console.log(`  Edges: ${graph.edges.length}`);
        console.log(`  Root causes: ${graph.rootCauses.length}`);
        if (graph.rootCauses.length > 0) {
          console.log(chalk.bold('  Root cause nodes:'));
          graph.rootCauses.forEach((node) => {
            console.log(`    ${chalk.red(node.label)} (${node.type})`);
          });
        }
        return;
      }

      const groups = flakyManager.analyzeCorrelations();
      if (options.json) {
        console.log(JSON.stringify(groups, null, 2));
        return;
      }
      console.log(chalk.bold('\n🔗 Test Correlations:'));
      if (groups.length === 0) {
        console.log(chalk.yellow('  No correlations found'));
        return;
      }
      groups.forEach((group) => {
        console.log(
          `  ${chalk.bold(group.groupId)}: ${group.correlationType} (confidence: ${(group.confidence * 100).toFixed(0)}%)`
        );
        console.log(`    Tests: ${group.testIds.join(', ')}`);
        console.log(`    Evidence: ${group.evidence}`);
      });
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program
  .command('rerun <runId> <testId>')
  .description('Rerun a specific test from a previous run')
  .option('--json', 'Output result in JSON format')
  .action(async (runId, testId, options) => {
    const spinner = ora('Loading report...').start();

    try {
      const reporter = new Reporter('./test-reports');
      const run = await reporter.getReport(runId);
      if (!run) {
        spinner.fail(`Run ${runId} not found`);
        process.exit(1);
      }

      let testInfo: { file?: string; line?: number; title?: string } | null = null;
      let currentManualReruns = 0;
      for (const suite of run.suites) {
        const test = suite.tests.find((t) => t.id === testId);
        if (test) {
          testInfo = { file: test.file, line: test.line, title: test.title };
          currentManualReruns = test.manualReruns || 0;
          break;
        }
      }

      if (!testInfo || !testInfo.file || !testInfo.line) {
        spinner.fail(`Test ${testId} not found in run ${runId} or missing file/line info`);
        process.exit(1);
      }

      spinner.text = `Rerunning test: ${testInfo.title}`;

      const fileConfig = await loadConfigFile();
      const config: TestConfig = mergeConfig(fileConfig, {
        version: run.version,
        testDir: path.dirname(testInfo.file),
        outputDir: './test-reports',
        retries: 0,
        timeout: fileConfig?.timeout ?? 30000,
        workers: 1,
        browsers: ['chromium'],
        htmlReport: false,
        parentRunId: runId,
        retryIndex: currentManualReruns + 1,
      });

      const executor = new Executor(
        config,
        getStorage(),
        new FlakyTestManager('./test-data', {}, getStorage())
      );
      let testResult: TestResult | null = null;

      executor.on('test_result', (result) => {
        if (
          result.id === testId ||
          (testInfo && result.file === testInfo.file && result.line === testInfo.line)
        ) {
          testResult = result;
        }
      });

      await executor.execute({
        testLocations: [`${testInfo.file}:${testInfo.line}`],
        parentRunId: runId,
      });

      const remappedResult = executor.currentRun?.suites
        .flatMap((s) => s.tests)
        .find(
          (t) =>
            t.id === testId || (testInfo && t.file === testInfo.file && t.line === testInfo.line)
        );

      const finalResult = remappedResult || testResult;

      if (finalResult) {
        const updated = await reporter.updateTestResult(runId, testId, finalResult);
        if (updated) {
          spinner.succeed(`Test rerun completed: ${finalResult.status}`);
        } else {
          spinner.warn('Test rerun completed but failed to update report');
        }

        if (options.json) {
          console.log(JSON.stringify(finalResult, null, 2));
        } else {
          console.log(chalk.bold(`\n🔄 Rerun Result:`));
          console.log(`  Test: ${testInfo.title}`);
          console.log(
            `  Status: ${finalResult.status === 'passed' ? chalk.green('PASSED') : chalk.red('FAILED')}`
          );
          console.log(`  Duration: ${finalResult.duration}ms`);
          if (finalResult.error) {
            console.log(`  Error: ${chalk.red(finalResult.error)}`);
          }
          console.log(`  Manual reruns: ${currentManualReruns + 1}`);
        }
      } else {
        spinner.warn('Test result not found after rerun');
      }
    } catch (error) {
      spinner.fail(`Rerun failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program
  .command('docs')
  .description('Open documentation in browser')
  .action(() => {
    const url = 'https://yuantest-playwright.readthedocs.io/';
    console.log(chalk.cyan(`Opening documentation: ${url}`));
    import('child_process').then(({ exec }) => {
      const command =
        process.platform === 'win32'
          ? `start ${url}`
          : process.platform === 'darwin'
            ? `open ${url}`
            : `xdg-open ${url}`;
      exec(command, (err) => {
        if (err) {
          console.log(chalk.yellow(`Could not open browser automatically. Please visit: ${url}`));
        }
      });
    });
  });

program
  .command('agents')
  .description('Playwright Test Agents - AI-powered test creation and healing')
  .action(() => {
    console.log(chalk.bold('\n🎭 Playwright Test Agents'));
    console.log(chalk.gray('  AI-powered test planning, generation, and healing'));
    console.log('');
    console.log('  Commands:');
    console.log(`    ${chalk.cyan('agents init')}      Initialize agent definitions`);
    console.log(`    ${chalk.cyan('agents plan')}      Generate a test plan`);
    console.log(`    ${chalk.cyan('agents generate')}  Generate test code from a plan`);
    console.log(`    ${chalk.cyan('agents heal')}      Heal a failing test`);
    console.log(`    ${chalk.cyan('agents list')}      List generated test plans`);
    console.log('');
  });

program
  .command('agents-init')
  .description('Initialize Playwright Test Agent definitions for your AI tool')
  .option('--loop <tool>', 'AI tool: vscode, claude, opencode', 'vscode')
  .action(async (options) => {
    const spinner = ora('Initializing agent definitions...').start();
    try {
      const { AgentService } = await import('../agents');
      const agentService = new AgentService('./test-data');
      const result = await agentService.initAgents(options.loop);

      if (result.success && result.data) {
        spinner.succeed(`Agent definitions initialized for ${options.loop}`);
        console.log(chalk.bold('\n📁 Files created:'));
        result.data.filesCreated.forEach((f) => {
          console.log(chalk.green(`  ✓ ${f}`));
        });
        if (result.data.instructionsPath) {
          console.log(chalk.blue(`\n📄 Instructions: ${result.data.instructionsPath}`));
        }
      } else {
        spinner.fail(`Failed to initialize: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      spinner.fail(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program
  .command('agents-plan <description>')
  .description('Generate a test plan using Planner agent')
  .option('--seed <path>', 'Seed test file path')
  .option('--prd <path>', 'Product Requirement Document path')
  .option('--output <path>', 'Output directory for plans', 'specs/')
  .action(async (description, options) => {
    const spinner = ora('Generating test plan...').start();
    try {
      const { DiagnosisService } = await import('../diagnosis');
      const { AgentService } = await import('../agents');
      const diagnosisService = new DiagnosisService('./test-data');
      const llmConfig = diagnosisService.getMaskedConfig();

      if (!llmConfig.enabled) {
        spinner.fail('AI diagnosis is not enabled. Configure LLM first via: yuantest llm-config --set');
        process.exit(1);
      }

      const agentService = new AgentService('./test-data', {}, llmConfig);
      const result = await agentService.plan(description, {
        seedTest: options.seed,
        prdPath: options.prd,
        outputDir: options.output,
      });

      if (result.success && result.data) {
        spinner.succeed(`Test plan generated in ${result.duration}ms`);
        const plan = result.data;
        console.log(chalk.bold(`\n📋 Test Plan: ${plan.title}`));
        console.log(`  ${plan.description}`);
        console.log(`  Scenarios: ${chalk.cyan(plan.scenarios.length)}`);
        plan.scenarios.forEach((scenario, i) => {
          console.log(chalk.bold(`\n  ${i + 1}. ${scenario.name}`));
          console.log(`    Steps: ${scenario.steps.length}`);
          scenario.steps.forEach((step, j) => {
            console.log(chalk.gray(`      ${j + 1}. ${step.action}${step.target ? ` on ${step.target}` : ''}`));
          });
          if (scenario.expectedResults.length > 0) {
            console.log(`    Expected:`);
            scenario.expectedResults.forEach((r) => {
              console.log(chalk.green(`      ✓ ${r}`));
            });
          }
        });
        if (plan.filePath) {
          console.log(chalk.blue(`\n📄 Plan saved to: ${plan.filePath}`));
        }
      } else {
        spinner.fail(`Failed to generate plan: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      spinner.fail(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program
  .command('agents-generate <planPath>')
  .description('Generate Playwright test code from a test plan')
  .option('--output <path>', 'Output directory for tests', 'tests/')
  .option('--seed <path>', 'Seed test file path')
  .action(async (planPath, options) => {
    const spinner = ora('Generating test code...').start();
    try {
      const { DiagnosisService } = await import('../diagnosis');
      const { AgentService } = await import('../agents');
      const diagnosisService = new DiagnosisService('./test-data');
      const llmConfig = diagnosisService.getMaskedConfig();

      if (!llmConfig.enabled) {
        spinner.fail('AI diagnosis is not enabled. Configure LLM first via: yuantest llm-config --set');
        process.exit(1);
      }

      const agentService = new AgentService('./test-data', {}, llmConfig);
      const result = await agentService.generate(planPath, {
        outputDir: options.output,
        seedTest: options.seed,
      });

      if (result.success && result.data) {
        spinner.succeed(`Generated ${result.data.length} test file(s) in ${result.duration}ms`);
        console.log(chalk.bold('\n📝 Generated Files:'));
        result.data.forEach((f) => {
          console.log(chalk.green(`  ✓ ${f}`));
        });
      } else {
        spinner.fail(`Failed to generate tests: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      spinner.fail(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program
  .command('agents-heal <testFilePath>')
  .description('Heal a failing test using Healer agent')
  .option('--error <message>', 'Error message from the failing test')
  .option('--stack-trace <trace>', 'Stack trace from the failing test')
  .option('--run-id <id>', 'Run ID for context')
  .option('--test-id <id>', 'Test ID for context')
  .option('--apply', 'Auto-apply patches', false)
  .action(async (testFilePath, options) => {
    const spinner = ora('Healing test...').start();
    try {
      const { DiagnosisService } = await import('../diagnosis');
      const { AgentService } = await import('../agents');
      const diagnosisService = new DiagnosisService('./test-data');
      const llmConfig = diagnosisService.getMaskedConfig();

      if (!llmConfig.enabled) {
        spinner.fail('AI diagnosis is not enabled. Configure LLM first via: yuantest llm-config --set');
        process.exit(1);
      }

      const agentConfig: Partial<import('../types').AgentConfig> = {
        autoHeal: options.apply,
      };
      const agentService = new AgentService('./test-data', agentConfig, llmConfig);
      const result = await agentService.heal(testFilePath, {
        runId: options.runId,
        testId: options.testId,
        error: options.error,
        stackTrace: options.stackTrace,
      });

      if (result.success && result.data) {
        const healResult = result.data;
        if (healResult.healed) {
          spinner.succeed(`Test healed in ${result.duration}ms (${healResult.roundsUsed} round(s))`);
        } else {
          spinner.warn(`Healing attempted but not fully resolved (${healResult.roundsUsed} round(s))`);
        }

        console.log(chalk.bold(`\n🔧 Test: ${healResult.testTitle}`));
        console.log(`  Healed: ${healResult.healed ? chalk.green('Yes') : chalk.red('No')}`);
        console.log(`  Patches: ${healResult.patches.length}`);
        console.log(`  Rounds: ${healResult.roundsUsed}`);

        if (healResult.patches.length > 0) {
          console.log(chalk.bold('\n  Patches:'));
          healResult.patches.forEach((patch, i) => {
            console.log(chalk.cyan(`\n  Patch ${i + 1}:`));
            console.log(`    File: ${patch.filePath}`);
            console.log(`    Confidence: ${(patch.confidence * 100).toFixed(0)}%`);
            console.log(`    Reason: ${patch.reason}`);
            if (patch.appliedAt) {
              console.log(`    Applied: ${chalk.green('Yes')} by ${patch.appliedBy}`);
            }
          });

          if (!options.apply && !healResult.patches.some((p) => p.appliedAt)) {
            console.log(chalk.yellow('\n  💡 Use --apply flag to auto-apply patches'));
          }
        }
      } else {
        spinner.fail(`Failed to heal test: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      spinner.fail(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program
  .command('agents-list')
  .description('List generated test plans')
  .option('--specs-dir <path>', 'Specs directory', 'specs/')
  .action(async (options) => {
    try {
      const { AgentService } = await import('../agents');
      const agentService = new AgentService('./test-data', { specsDir: options.specsDir });
      const plans = await agentService.listPlans();

      console.log(chalk.bold('\n📋 Test Plans:'));
      if (plans.length === 0) {
        console.log(chalk.yellow('  No test plans found'));
        console.log(chalk.gray('  Use "yuantest agents-plan <description>" to create one'));
        return;
      }

      plans.forEach((plan, i) => {
        console.log(chalk.bold(`\n  ${i + 1}. ${plan.title}`));
        console.log(`    Scenarios: ${plan.scenarios.length}`);
        console.log(`    Created: ${dayjs(plan.createdAt).format('YYYY-MM-DD HH:mm')}`);
        if (plan.filePath) {
          console.log(chalk.blue(`    File: ${plan.filePath}`));
        }
      });
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

if (!process.argv.slice(2).length) {
  program.outputHelp();
  process.exit(0);
}

program.parse(process.argv);
