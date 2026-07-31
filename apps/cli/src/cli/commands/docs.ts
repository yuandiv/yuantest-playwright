import { Command } from 'commander';
import chalk from 'chalk';
import { CliContext } from '../context';

export function registerDocsCommands(program: Command, _ctx: CliContext): void {
  program
    .command('docs')
    .description('Open documentation in browser')
    .action(() => {
      const url = 'https://yuantest-playwright.readthedocs.io/';
      console.log(chalk.cyan(`Opening documentation: ${url}`));
      void import('child_process').then(({ exec }) => {
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
}
