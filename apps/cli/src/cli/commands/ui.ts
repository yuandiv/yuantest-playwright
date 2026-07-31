import { Command } from 'commander';
import chalk from 'chalk';
import { DashboardServer } from '../../ui/server';
import { loadConfigFile, getDashboardConfig } from '@yuantest/core';
import { CliContext } from '../context';

export function registerUiCommands(program: Command, _ctx: CliContext): void {
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
}
