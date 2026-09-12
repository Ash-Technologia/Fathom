#!/usr/bin/env node
import { Command } from 'commander';
import { analyzeCommand } from './commands.js';

const program = new Command();

program
  .name('fathom')
  .description("Know what's beneath the surface. Local-first repository intelligence.")
  .version('0.1.0', '-v, --version', 'Output the current version')
  .argument('[path]', 'Path to the repository to analyze', '.')
  .option('--json', 'Output results as JSON (to stdout)')
  .option('--html [file]', 'Generate an HTML report (default: fathom-report.html)')
  .option('--ci', 'CI mode: compact output, exit 1 on critical findings')
  .option('--fail-under <number>', 'Exit 1 if the health score is below this value', parseFloat)
  .action(
    async (
      targetPath: string,
      options: {
        json?: boolean;
        html?: string | boolean;
        ci?: boolean;
        failUnder?: number;
      },
    ) => {
      await analyzeCommand(targetPath, options);
    },
  );

program.parse(process.argv);
