#!/usr/bin/env node

const { program } = require('commander');
const { analyze } = require('../src/commands/analyze');
const { map } = require('../src/commands/map');
const { onboard } = require('../src/commands/onboard');
const { risk } = require('../src/commands/risk');
const packageJson = require('../package.json');

program
  .name('repo-archaeologist')
  .description('Git blame, but for architecture. Reconstructs repository architecture using static analysis, call graphs, and Git history.')
  .version(packageJson.version);

program
  .command('analyze')
  .description('Analyze repository architecture')
  .argument('[path]', 'Path to repository', '.')
  .option('-o, --output <file>', 'Output file for analysis results')
  .option('--format <type>', 'Output format (json, text)', 'text')
  .action(analyze);

program
  .command('map')
  .description('Generate architecture map')
  .argument('[path]', 'Path to repository', '.')
  .option('-o, --output <file>', 'Output file for architecture map')
  .option('--format <type>', 'Output format (json, markdown)', 'markdown')
  .action(map);

program
  .command('onboard')
  .description('Generate onboarding report')
  .argument('[path]', 'Path to repository', '.')
  .option('-o, --output <file>', 'Output file for onboarding report')
  .action(onboard);

program
  .command('risk')
  .description('Calculate refactor risk scores')
  .argument('[path]', 'Path to repository', '.')
  .option('-o, --output <file>', 'Output file for risk scores')
  .option('--threshold <number>', 'Minimum risk score to display', '5')
  .action(risk);

program.parse(process.argv);
