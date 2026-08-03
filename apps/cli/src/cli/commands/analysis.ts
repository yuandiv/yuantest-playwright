import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { Reporter } from '@yuantest/reporter';
import { FlakyTestManager } from '@yuantest/flaky';
import { RootCauseAnalysis, LLMConfig } from '@yuantest/contracts';
import { getStorage } from '@yuantest/core';
import { CliContext } from '../context';

export function registerAnalysisCommands(program: Command, _ctx: CliContext): void {
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
            const { DiagnosisAgent } = await import('../../ai/agents/diagnosis');
            const { loadLLMConfig } = await import('@yuantest/core');
            const config = loadLLMConfig() || {
              enabled: false,
              apiKey: '',
              baseUrl: 'http://localhost:11434',
              model: '',
              remark: '',
              maxTokens: 4096,
              temperature: 0.3,
            };
            const flakyManager = new FlakyTestManager('./test-data', {}, getStorage());
            const agent = new DiagnosisAgent(
              {
                enabled: false,
                loopTarget: 'vscode' as const,
                specsDir: 'specs',
                autoHeal: false,
                maxHealRounds: 3,
                projectRoot: process.cwd(),
              },
              config as LLMConfig,
              undefined,
              './test-data'
            );
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

                  const diagnosis = await agent.diagnose(
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
              console.log(
                chalk.gray('   Configure LLM via: yuantest ui → Settings → AI Diagnosis')
              );
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
              chalk.yellow(
                '\n⚠️  Not enough failed tests for cluster analysis (minimum 2 required)'
              )
            );
          } else {
            try {
              const { clusterFailures } = await import('@yuantest/diagnosis');
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
        console.error(
          chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`)
        );
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
          await import('@yuantest/diagnosis');

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
        console.error(
          chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`)
        );
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
        if (options.set) {
          const config = JSON.parse(options.set);
          const { saveLLMConfig } = await import('@yuantest/core');
          saveLLMConfig(config);
          console.log(chalk.green('✅ LLM configuration updated'));
          const { loadLLMConfig } = await import('@yuantest/core');
          const masked = loadLLMConfig() || {
            enabled: false,
            apiKey: '',
            baseUrl: 'http://localhost:11434',
            model: '',
            remark: '',
            maxTokens: 4096,
            temperature: 0.3,
          };
          console.log(JSON.stringify(masked, null, 2));
          return;
        }

        if (options.test) {
          const spinner = ora('Testing LLM connection...').start();
          const { loadLLMConfig } = await import('@yuantest/core');
          const { LLMService } = await import('../../ai/agents/llm-service');
          const config = (loadLLMConfig() || {
            enabled: false,
            apiKey: '',
            baseUrl: 'http://localhost:11434',
            model: '',
            remark: '',
            maxTokens: 4096,
            temperature: 0.3,
          }) as LLMConfig;
          const tempService = new LLMService(config);
          const result = await tempService.validateConnection();
          if (result.success) {
            spinner.succeed('LLM connection successful');
          } else {
            spinner.fail(`LLM connection failed: ${result.error || 'Unknown error'}`);
          }
          return;
        }

        if (options.status) {
          const { loadLLMConfig } = await import('@yuantest/core');
          const { LLMService } = await import('../../ai/agents/llm-service');
          const config = (loadLLMConfig() || {
            enabled: false,
            apiKey: '',
            baseUrl: 'http://localhost:11434',
            model: '',
            remark: '',
            maxTokens: 4096,
            temperature: 0.3,
          }) as LLMConfig;
          let success = false;
          if (config.enabled && config.baseUrl && config.model) {
            const tempService = new LLMService(config);
            const result = await tempService.validateConnection();
            success = result.success;
          }
          const configured = config.enabled && !!config.baseUrl && !!config.model;
          console.log(chalk.bold('\n🤖 LLM Status:'));
          console.log(`  Configured: ${configured ? chalk.green('Yes') : chalk.red('No')}`);
          console.log(`  Connected: ${success ? chalk.green('Yes') : chalk.red('No')}`);
          const statusColor = !configured ? 'yellow' : success ? 'green' : 'red';
          const statusLabel =
            statusColor === 'green'
              ? '🟢 Green'
              : statusColor === 'yellow'
                ? '🟡 Yellow'
                : '🔴 Red';
          console.log(
            `  Status: ${statusColor === 'green' ? chalk.green(statusLabel) : statusColor === 'yellow' ? chalk.yellow(statusLabel) : chalk.red(statusLabel)}`
          );
          return;
        }

        const { loadLLMConfig } = await import('@yuantest/core');
        const config = loadLLMConfig() || {
          enabled: false,
          apiKey: '',
          baseUrl: 'http://localhost:11434',
          model: '',
          remark: '',
          maxTokens: 4096,
          temperature: 0.3,
        };
        console.log(chalk.bold('\n🤖 LLM Configuration:'));
        console.log(`  Enabled: ${config.enabled ? chalk.green('Yes') : chalk.red('No')}`);
        console.log(`  Base URL: ${config.baseUrl || 'Not set'}`);
        console.log(`  Model: ${config.model || 'Not set'}`);
        console.log(`  API Key: ${config.apiKey ? 'sk-****' : 'Not set'}`);
        console.log(`  Max Tokens: ${config.maxTokens}`);
        console.log(`  Temperature: ${config.temperature}`);
      } catch (error) {
        console.error(
          chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`)
        );
        process.exit(1);
      }
    });
}
