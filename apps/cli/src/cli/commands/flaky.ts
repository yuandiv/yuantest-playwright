import { Command } from 'commander';
import chalk from 'chalk';
import { FlakyTestManager } from '../../flaky';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { getStorage } from '../../storage';
import { CliContext } from '../context';
import { loadUserPreferences } from '../../config/loader';

dayjs.extend(relativeTime);

export function registerFlakyCommands(program: Command, _ctx: CliContext): void {
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
        const prefs = loadUserPreferences();
        if (prefs?.autoQuarantine !== undefined && typeof prefs.autoQuarantine === 'boolean') {
          flakyManager.setConfig({ autoQuarantine: prefs.autoQuarantine });
        }
        if (prefs?.flakyCriteria && typeof prefs.flakyCriteria === 'object') {
          flakyManager.setConfig({ flakyCriteria: prefs.flakyCriteria });
        }
        if (prefs?.quarantineCriteria && typeof prefs.quarantineCriteria === 'object') {
          flakyManager.setConfig({ quarantineCriteria: prefs.quarantineCriteria });
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
          console.log(
            `    ${chalk.red((test.failureRate * 100).toFixed(0) + '%')} | ${test.title}`
          );
        });
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
        console.error(
          chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`)
        );
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
        console.error(
          chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`)
        );
        process.exit(1);
      }
    });
}
