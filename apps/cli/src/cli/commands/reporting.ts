import { Command } from 'commander';
import { spawn as spawnProc } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import { Reporter } from '../../reporter';
import { FlakyTestManager } from '../../flaky';
import { getStorage } from '@yuantest/core';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { CliContext } from '../context';

dayjs.extend(relativeTime);

export function registerReportingCommands(program: Command, _ctx: CliContext): void {
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
    .command('merge-reports <blobReportsDir>')
    .description('Merge blob reports from multiple shards or environments into a single report')
    .option('-r, --reporter <format>', 'Output reporter format (html,json,junit)', 'html')
    .option('-o, --output <path>', 'Output directory for merged report')
    .option('-c, --config <path>', 'Playwright config file for merge options')
    .action(async (blobReportsDir, options) => {
      const spinner = ora('Merging reports...').start();

      try {
        const resolvedBlobDir = path.resolve(blobReportsDir);
        if (!fs.existsSync(resolvedBlobDir)) {
          spinner.fail(`Blob reports directory not found: ${resolvedBlobDir}`);
          process.exit(1);
        }

        const fsModule = await import('fs/promises');
        const blobFiles = (await fsModule.readdir(resolvedBlobDir)).filter((f: string) =>
          f.endsWith('.zip')
        );

        if (blobFiles.length === 0) {
          spinner.fail(`No blob report files (.zip) found in ${resolvedBlobDir}`);
          process.exit(1);
        }

        spinner.text = `Found ${blobFiles.length} blob report file(s), merging...`;

        const reporters = options.reporter.split(',').map((r: string) => r.trim());
        const reporterArg = reporters.join(',');

        const mergeArgs = [
          'playwright',
          'merge-reports',
          resolvedBlobDir,
          `--reporter=${reporterArg}`,
        ];

        if (options.config) {
          mergeArgs.push(`--config=${options.config}`);
        }

        const outputDir = options.output
          ? path.resolve(options.output)
          : path.join(resolvedBlobDir, '..', 'merged-report');

        const mergeExitCode = await new Promise<number>((resolve, reject) => {
          const proc = spawnProc('npx', mergeArgs, {
            cwd: path.dirname(resolvedBlobDir),
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: true,
            env: {
              ...process.env,
              PLAYWRIGHT_HTML_REPORT: outputDir,
            },
          });

          let stdout = '';
          let stderr = '';

          proc.stdout?.on('data', (chunk: Buffer) => {
            stdout += chunk.toString();
          });

          proc.stderr?.on('data', (chunk: Buffer) => {
            stderr += chunk.toString();
          });

          proc.on('close', (code: number | null) => {
            if (stdout) {
              console.log(chalk.gray(stdout));
            }
            if (stderr && code !== 0) {
              console.log(chalk.yellow(stderr));
            }
            resolve(code ?? 1);
          });

          proc.on('error', (err: Error) => {
            reject(err);
          });
        });

        if (mergeExitCode === 0) {
          spinner.succeed(`Successfully merged ${blobFiles.length} blob report(s)`);
          console.log(chalk.blue(`\n📄 Merged report output: ${outputDir}`));

          const indexPath = path.join(outputDir, 'index.html');
          if (fs.existsSync(indexPath)) {
            console.log(chalk.blue(`   Open with: npx playwright show-report ${outputDir}`));
          }
        } else {
          spinner.fail(`Merge reports command failed with exit code: ${mergeExitCode}`);
          process.exit(1);
        }
      } catch (error: unknown) {
        spinner.fail(`Merge failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
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
        console.error(
          chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`)
        );
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
        console.error(
          chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`)
        );
        process.exit(1);
      }
    });
}
