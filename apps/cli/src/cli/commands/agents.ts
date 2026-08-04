import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { CliContext } from '../context';
import type { LLMConfig } from '@yuantest/contracts';

export function registerAgentsCommands(program: Command, ctx: CliContext): void {
  program
    .command('agents')
    .description('Playwright Test Agents - AI-powered test creation and healing')
    .action(() => {
      console.log(chalk.bold('\nPlaywright Test Agents'));
      console.log(chalk.gray('  AI-powered test planning, generation, and healing'));
      console.log('');
      console.log('  Commands:');
      console.log(`    ${chalk.cyan('agents init')}      Initialize agent definitions`);
      console.log(`    ${chalk.cyan('agents plan')}      Generate a test plan`);
      console.log(`    ${chalk.cyan('agents generate')}  Generate test code from a plan`);
      console.log(`    ${chalk.cyan('agents heal')}      Heal a failing test`);
      console.log(``);
    });

  program
    .command('agents-init')
    .description('Initialize Playwright Test Agent definitions for your AI tool')
    .option('--loop <tool>', 'AI tool: vscode, claude, opencode', 'vscode')
    .option(
      '--project-root <path>',
      'Project root directory (auto-detected from playwright.config)'
    )
    .action(async (options) => {
      const spinner = ora('Initializing agent definitions...').start();
      try {
        const { AgentService } = await import('@yuantest/ai');
        const projectRoot = ctx.findProjectRoot(options.projectRoot);
        const agentService = new AgentService('./test-data', { projectRoot });
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
    .option(
      '--project-root <path>',
      'Project root directory (auto-detected from playwright.config)'
    )
    .action(async (description, options) => {
      const spinner = ora('Generating test plan...').start();
      try {
        const { AgentService } = await import('@yuantest/ai');
        const { loadLLMConfig } = await import('@yuantest/core');
        const llmConfig = (loadLLMConfig() || {
          enabled: false,
          apiKey: '',
          baseUrl: 'http://localhost:11434',
          model: '',
          remark: '',
          maxTokens: 4096,
          temperature: 0.3,
        }) as LLMConfig;

        if (!llmConfig.enabled) {
          spinner.fail(
            'AI diagnosis is not enabled. Configure LLM first via: yuantest llm-config --set'
          );
          process.exit(1);
        }

        const projectRoot = ctx.findProjectRoot(options.projectRoot);
        const agentService = new AgentService('./test-data', { projectRoot }, llmConfig);
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
              console.log(
                chalk.gray(
                  `      ${j + 1}. ${step.action}${step.target ? ` on ${step.target}` : ''}`
                )
              );
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
    .option(
      '--project-root <path>',
      'Project root directory (auto-detected from playwright.config)'
    )
    .action(async (planPath, options) => {
      const spinner = ora('Generating test code...').start();
      try {
        const { AgentService } = await import('@yuantest/ai');
        const { loadLLMConfig } = await import('@yuantest/core');
        const llmConfig = (loadLLMConfig() || {
          enabled: false,
          apiKey: '',
          baseUrl: 'http://localhost:11434',
          model: '',
          remark: '',
          maxTokens: 4096,
          temperature: 0.3,
        }) as LLMConfig;

        if (!llmConfig.enabled) {
          spinner.fail(
            'AI diagnosis is not enabled. Configure LLM first via: yuantest llm-config --set'
          );
          process.exit(1);
        }

        const projectRoot = ctx.findProjectRoot(options.projectRoot);
        const agentService = new AgentService('./test-data', { projectRoot }, llmConfig);
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
    .option(
      '--project-root <path>',
      'Project root directory (auto-detected from playwright.config)'
    )
    .action(async (testFilePath, options) => {
      const spinner = ora('Healing test...').start();
      try {
        const { AgentService } = await import('@yuantest/ai');
        const { loadLLMConfig } = await import('@yuantest/core');
        const llmConfig = (loadLLMConfig() || {
          enabled: false,
          apiKey: '',
          baseUrl: 'http://localhost:11434',
          model: '',
          remark: '',
          maxTokens: 4096,
          temperature: 0.3,
        }) as LLMConfig;

        if (!llmConfig.enabled) {
          spinner.fail(
            'AI diagnosis is not enabled. Configure LLM first via: yuantest llm-config --set'
          );
          process.exit(1);
        }

        const projectRoot = ctx.findProjectRoot(options.projectRoot);
        const agentConfig: Partial<import('@yuantest/contracts').AgentConfig> = {
          autoHeal: options.apply,
          projectRoot,
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
            spinner.succeed(
              `Test healed in ${result.duration}ms (${healResult.roundsUsed} round(s))`
            );
          } else {
            spinner.warn(
              `Healing attempted but not fully resolved (${healResult.roundsUsed} round(s))`
            );
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
}
