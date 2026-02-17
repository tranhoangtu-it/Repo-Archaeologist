const { RepositoryAnalyzer } = require('../analyzers/repository-analyzer');
const fs = require('fs').promises;
const chalk = require('chalk');
const ora = require('ora');

async function analyze(repoPath, options) {
  const spinner = ora('Analyzing repository...').start();
  
  try {
    const analyzer = new RepositoryAnalyzer(repoPath);
    const analysis = await analyzer.analyze();
    
    spinner.succeed('Analysis complete!');
    
    if (options.format === 'json') {
      const output = JSON.stringify(analysis, null, 2);
      if (options.output) {
        await fs.writeFile(options.output, output);
        console.log(chalk.green(`Results saved to ${options.output}`));
      } else {
        console.log(output);
      }
    } else {
      displayTextAnalysis(analysis);
      if (options.output) {
        const textOutput = formatTextAnalysis(analysis);
        await fs.writeFile(options.output, textOutput);
        console.log(chalk.green(`Results saved to ${options.output}`));
      }
    }
  } catch (error) {
    spinner.fail('Analysis failed');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

function displayTextAnalysis(analysis) {
  console.log('\n' + chalk.bold.blue('=== Repository Analysis ==='));
  console.log(chalk.gray(`Repository: ${analysis.repository}`));
  console.log(chalk.gray(`Analyzed at: ${analysis.analyzedAt}`));
  console.log();
  
  console.log(chalk.bold('Overview:'));
  console.log(`  Total Files: ${analysis.totalFiles}`);
  console.log(`  Dead Code Files: ${analysis.deadCode.length}`);
  console.log();
  
  console.log(chalk.bold('Languages:'));
  Object.entries(analysis.languages).forEach(([lang, stats]) => {
    console.log(`  ${chalk.cyan(lang)}: ${stats.count} files, ${stats.totalLines} lines`);
  });
  console.log();
  
  console.log(chalk.bold('Top Contributors:'));
  analysis.topContributors.slice(0, 5).forEach((contributor, i) => {
    console.log(`  ${i + 1}. ${chalk.green(contributor.author)}`);
    console.log(`     Files: ${contributor.filesOwned}, Commits: ${contributor.totalCommits}`);
  });
  console.log();
  
  if (analysis.deadCode.length > 0) {
    console.log(chalk.bold.yellow('Potential Dead Code:'));
    analysis.deadCode.slice(0, 10).forEach(file => {
      console.log(`  ${chalk.yellow('⚠')} ${file.path}`);
      console.log(`     ${chalk.gray(file.reason)}`);
    });
    if (analysis.deadCode.length > 10) {
      console.log(`  ${chalk.gray(`... and ${analysis.deadCode.length - 10} more`)}`);
    }
  }
}

function formatTextAnalysis(analysis) {
  let output = '=== Repository Analysis ===\n';
  output += `Repository: ${analysis.repository}\n`;
  output += `Analyzed at: ${analysis.analyzedAt}\n\n`;
  
  output += 'Overview:\n';
  output += `  Total Files: ${analysis.totalFiles}\n`;
  output += `  Dead Code Files: ${analysis.deadCode.length}\n\n`;
  
  output += 'Languages:\n';
  Object.entries(analysis.languages).forEach(([lang, stats]) => {
    output += `  ${lang}: ${stats.count} files, ${stats.totalLines} lines\n`;
  });
  output += '\n';
  
  output += 'Top Contributors:\n';
  analysis.topContributors.slice(0, 5).forEach((contributor, i) => {
    output += `  ${i + 1}. ${contributor.author}\n`;
    output += `     Files: ${contributor.filesOwned}, Commits: ${contributor.totalCommits}\n`;
  });
  
  return output;
}

module.exports = { analyze };
