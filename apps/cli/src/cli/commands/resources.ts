import { Command } from 'commander';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { TraceManager } from '@yuantest/executor';
import { AnnotationManager } from '../../annotations';
import { TagManager } from '../../tags';
import { ArtifactManager } from '../../artifacts';
import { VisualTestingManager } from '../../visual';
import { Artifact } from '@yuantest/contracts';
import dayjs from 'dayjs';
import { CliContext } from '../context';

export function registerResourceCommands(program: Command, _ctx: CliContext): void {
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
}
