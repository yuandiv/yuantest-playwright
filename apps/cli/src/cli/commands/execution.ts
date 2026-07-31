import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import { Orchestrator } from '@yuantest/executor';
import { Executor, ParallelExecutor } from '@yuantest/executor';
import { Reporter } from '../../reporter';
import { FlakyTestManager } from '../../flaky';
import { loadConfigFile, mergeConfig } from '@yuantest/core';
import { TestConfig, BrowserType } from '@yuantest/contracts';
import { logger } from '@yuantest/core';
import { getStorage } from '@yuantest/core';
import { CliContext } from '../context';

export function registerExecutionCommands(program: Command, _ctx: CliContext): void {
  program
    .command('run [testFiles...]')
    .description('Run Playwright tests with orchestration')
    .option('-c, --config <path>', 'Config file path')
    .option('-p, --project <name>', 'Project name')
    .option('-t, --test-dir <path>', 'Test directory')
    .option('-o, --output <path>', 'Output directory')
    .option('-s, --shards <number>', 'Number of shards', '1')
    .option('--shard-index <number>', 'Run a specific shard index (0-based, for multi-machine)')
    .option('--shard-total <number>', 'Total number of shards (for multi-machine)')
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
    .option(
      '--environment-tag <tag>',
      'Environment tag for multi-environment reporting (or set CI_ENVIRONMENT_NAME)'
    )
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
          environmentTag: options.environmentTag || process.env.CI_ENVIRONMENT_NAME || undefined,
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

        const shardIndexOption =
          options.shardIndex !== undefined ? parseInt(options.shardIndex) : undefined;
        const shardTotalOption =
          options.shardTotal !== undefined ? parseInt(options.shardTotal) : undefined;
        const isMultiMachineShard =
          shardIndexOption !== undefined && shardTotalOption !== undefined;
        const shardCount = config.shards || 1;

        if (isMultiMachineShard) {
          console.log(
            chalk.cyan(
              `\n📡 Multi-machine shard mode: running shard ${(shardIndexOption as number) + 1}/${shardTotalOption}`
            )
          );
          console.log(
            chalk.gray(
              `   Playwright native sharding (--shard=${(shardIndexOption as number) + 1}/${shardTotalOption}) will distribute tests`
            )
          );
          const executor = new Executor(config, getStorage());
          const reporter = new Reporter(config.outputDir);

          executor.on('run_started', (data) => {
            console.log(
              chalk.blue(
                `\n🚀 Run started: ${data.runId} (shard ${(shardIndexOption as number) + 1}/${shardTotalOption})`
              )
            );
          });

          executor.on('output', (data) => {
            process.stdout.write(data.data);
          });

          executor.on('run_completed', async (result) => {
            console.log(
              chalk.green(
                `\n✅ Shard ${(shardIndexOption as number) + 1}/${shardTotalOption} completed: ${result.id}`
              )
            );
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
            shardIndex: shardIndexOption,
            shardTotal: shardTotalOption,
            tagFilter: options.tags ? options.tags.split(',') : undefined,
            grepPattern: options.grep,
            projectFilter: options.projectFilter,
            updateSnapshots: options.updateSnapshots,
            testLocations: testFiles && testFiles.length > 0 ? testFiles : undefined,
          });
          spinner.succeed(
            `Shard ${shardIndexOption + 1}/${shardTotalOption} completed: ${result.passed}/${result.totalTests} passed`
          );
        } else if (shardCount > 1) {
          const parallelExecutor = new ParallelExecutor(config, shardCount, getStorage());
          const reporter = new Reporter(config.outputDir);

          console.log(chalk.blue(`\n🔀 Running ${shardCount} shards in parallel on this machine`));
          console.log(
            chalk.gray(`   Using Playwright native sharding with automatic blob report merge`)
          );

          const { results, mergedReportDir } = await parallelExecutor.executeAndMergeReports();

          const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
          const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
          const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);
          const totalTests = results.reduce((sum, r) => sum + r.totalTests, 0);

          console.log(chalk.bold(`\n📊 Combined Results across ${shardCount} shards:`));
          console.log(`  Passed: ${chalk.green(totalPassed)}`);
          console.log(`  Failed: ${chalk.red(totalFailed)}`);
          console.log(`  Skipped: ${chalk.yellow(totalSkipped)}`);

          for (let i = 0; i < results.length; i++) {
            const r = results[i];
            console.log(
              chalk.gray(
                `  Shard ${i + 1}: ${r.passed} passed, ${r.failed} failed, ${r.skipped} skipped`
              )
            );
            await reporter.generateReport(r);
          }

          if (mergedReportDir) {
            const mergedIndexPath = path.join(mergedReportDir, 'index.html');
            if (fs.existsSync(mergedIndexPath)) {
              console.log(chalk.blue(`\n📄 Merged HTML Report: ${mergedIndexPath}`));
            }
          } else if (config.htmlReport) {
            const htmlReportDir = path.join(
              config.outputDir,
              config.htmlReportDir || 'html-report',
              'index.html'
            );
            if (fs.existsSync(htmlReportDir)) {
              console.log(chalk.blue(`\n📄 Playwright HTML Report: ${htmlReportDir}`));
            }
          }

          spinner.succeed(`All shards completed: ${totalPassed}/${totalTests} passed`);
        } else {
          const executor = new Executor(config, getStorage());
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
        }
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
    .option('--strategy <strategy>', 'Sharding strategy: distributed, intelligent', 'distributed')
    .option('--json', 'Output orchestration plan in JSON format')
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

        let config;
        if (options.strategy === 'intelligent') {
          config = await orchestrator.optimizeSharding();
        } else {
          config = await orchestrator.orchestrate();
        }

        spinner.succeed(`Discovered ${config.testAssignment.length} tests`);

        if (options.json) {
          const shards: Array<{
            shardIndex: number;
            shardTotal: number;
            testCount: number;
            testFiles: string[];
            estimatedDuration?: number;
          }> = [];

          for (let i = 0; i < config.totalShards; i++) {
            const tests = config.testAssignment.filter((t) => t.shardId === i);
            shards.push({
              shardIndex: i,
              shardTotal: config.totalShards,
              testCount: tests.length,
              testFiles: tests.map((t) => t.testId),
              estimatedDuration: tests.reduce((sum, t) => sum + (t.estimatedDuration || 0), 0),
            });
          }

          console.log(
            JSON.stringify(
              {
                totalShards: config.totalShards,
                totalTests: config.testAssignment.length,
                strategy: config.strategy,
                shards,
              },
              null,
              2
            )
          );
          return;
        }

        console.log(chalk.bold('\n📋 Test Distribution:'));
        console.log(`  Strategy: ${config.strategy}`);
        console.log(`  Total Shards: ${config.totalShards}`);

        for (let i = 0; i < config.totalShards; i++) {
          const tests = config.testAssignment.filter((t) => t.shardId === i);
          const estimatedDuration = tests.reduce((sum, t) => sum + (t.estimatedDuration || 0), 0);
          console.log(chalk.blue(`\n  Shard ${i + 1}/${config.totalShards}:`));
          console.log(`    Tests: ${tests.length}`);
          if (estimatedDuration > 0) {
            console.log(`    Estimated duration: ${(estimatedDuration / 1000).toFixed(1)}s`);
          }
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
        let testResult: import('@yuantest/contracts').TestResult | null = null;

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
}
