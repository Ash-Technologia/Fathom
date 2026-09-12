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
  .option('--sarif', 'Output results in SARIF 2.1.0 format (to stdout or file with -o)')
  .option('--html [file]', 'Generate an HTML report (default: fathom-report.html)')
  .option('--ci', 'CI mode: compact output, exit 1 on critical findings')
  .option('--fail-under <number>', 'Exit 1 if the health score is below this value', parseFloat)
  .option('-o, --output <file>', 'Write JSON or SARIF report directly to a file')
  .option('--verbose', 'Show all findings in terminal output without truncation')
  .option('--baseline', 'Save the current analysis as baseline in .fathom/baseline.json')
  .option(
    '--compare',
    'Compare current analysis against .fathom/baseline.json and report regressions',
  )
  .option(
    '--diff [ref]',
    'Analyze changes introduced by Git diff against base ref (default: auto-detect)',
  )
  .option(
    '--summary [file]',
    'Generate Markdown PR summary (writes to GITHUB_STEP_SUMMARY or specified file)',
  )
  .option('--pr-comment', 'Post PR summary comment to GitHub pull request (requires GITHUB_TOKEN)')
  .option('--architecture', 'Display architecture model, layers, and boundary checks')
  .option('--deps', 'Display dependency intelligence, duplicates, and configuration hygiene')
  .option('--online', 'Enable online dependency vulnerability and freshness queries (opt-in)')
  .action(
    async (
      targetPath: string,
      options: {
        json?: boolean;
        sarif?: boolean;
        html?: string | boolean;
        ci?: boolean;
        failUnder?: number;
        output?: string;
        verbose?: boolean;
        baseline?: boolean;
        compare?: boolean;
        diff?: string | boolean;
        summary?: string | boolean;
        prComment?: boolean;
        architecture?: boolean;
        deps?: boolean;
        online?: boolean;
      },
    ) => {
      await analyzeCommand(targetPath, options);
    },
  );

program.parse(process.argv);
