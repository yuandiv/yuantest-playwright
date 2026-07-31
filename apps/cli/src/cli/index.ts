#!/usr/bin/env node

import { Command } from 'commander';
import { createCliContext } from './context';
import { registerExecutionCommands } from './commands/execution';
import { registerReportingCommands } from './commands/reporting';
import { registerFlakyCommands } from './commands/flaky';
import { registerAnalysisCommands } from './commands/analysis';
import { registerResourceCommands } from './commands/resources';
import { registerAgentsCommands } from './commands/agents';
import { registerUiCommands } from './commands/ui';
import { registerDocsCommands } from './commands/docs';

const program = new Command();

program
  .name('yuantest')
  .description('Playwright test orchestrator, executor and reporter')
  .version('1.0.0');

const ctx = createCliContext();

registerExecutionCommands(program, ctx);
registerReportingCommands(program, ctx);
registerFlakyCommands(program, ctx);
registerAnalysisCommands(program, ctx);
registerResourceCommands(program, ctx);
registerAgentsCommands(program, ctx);
registerUiCommands(program, ctx);
registerDocsCommands(program, ctx);

if (!process.argv.slice(2).length) {
  program.outputHelp();
  process.exit(0);
}

program.parse(process.argv);
