const { RepositoryAnalyzer } = require('../analyzers/repository-analyzer');
const fs = require('fs').promises;
const chalk = require('chalk');
const ora = require('ora');
const Table = require('cli-table3');
const path = require('path');

async function risk(repoPath, options) {
  const spinner = ora('Calculating refactor risk scores...').start();
  
  try {
    const analyzer = new RepositoryAnalyzer(repoPath);
    const analysis = await analyzer.analyze();
    
    const filesWithRisk = analysis.files.map(file => ({
      ...file,
      riskScore: analyzer.calculateRiskScore(file)
    }));
    
    const threshold = parseInt(options.threshold) || 5;
    const highRiskFiles = filesWithRisk
      .filter(f => f.riskScore >= threshold)
      .sort((a, b) => b.riskScore - a.riskScore);
    
    spinner.succeed('Risk calculation complete!');
    
    displayRiskReport(highRiskFiles, analysis.repository, threshold);
    
    if (options.output) {
      const report = generateRiskReport(highRiskFiles, analysis.repository, threshold);
      await fs.writeFile(options.output, report);
      console.log(chalk.green(`\nReport saved to ${options.output}`));
    }
  } catch (error) {
    spinner.fail('Risk calculation failed');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

function displayRiskReport(highRiskFiles, repoPath, threshold) {
  console.log('\n' + chalk.bold.blue('=== Refactor Risk Report ==='));
  console.log(chalk.gray(`Repository: ${repoPath}`));
  console.log(chalk.gray(`Threshold: ${threshold}`));
  console.log();
  
  if (highRiskFiles.length === 0) {
    console.log(chalk.green('✓ No high-risk files found!'));
    return;
  }
  
  console.log(chalk.yellow(`Found ${highRiskFiles.length} high-risk files:\n`));
  
  const table = new Table({
    head: ['Rank', 'File', 'Risk Score', 'Lines', 'Complexity', 'Dependencies'],
    style: {
      head: ['cyan']
    }
  });
  
  highRiskFiles.slice(0, 20).forEach((file, i) => {
    const relPath = path.relative(repoPath, file.path);
    const shortPath = relPath.length > 50 ? '...' + relPath.slice(-47) : relPath;
    const deps = file.callGraphInfo?.calledBy?.length || 0;
    
    const riskColor = file.riskScore >= 10 ? chalk.red : 
                     file.riskScore >= 7 ? chalk.yellow : 
                     chalk.white;
    
    table.push([
      i + 1,
      shortPath,
      riskColor(file.riskScore.toString()),
      file.lines,
      file.complexity,
      deps
    ]);
  });
  
  console.log(table.toString());
  
  if (highRiskFiles.length > 20) {
    console.log(chalk.gray(`\n... and ${highRiskFiles.length - 20} more files`));
  }
  
  console.log('\n' + chalk.bold('Risk Score Factors:'));
  console.log('  • Complexity: High cyclomatic complexity increases risk');
  console.log('  • Size: Larger files are harder to refactor');
  console.log('  • Change Frequency: Files that change often are riskier');
  console.log('  • Contributors: Multiple contributors indicate complexity');
  console.log('  • Dependencies: Files with many dependents are critical');
  
  const avgRisk = (highRiskFiles.reduce((sum, f) => sum + f.riskScore, 0) / highRiskFiles.length).toFixed(1);
  console.log(chalk.bold(`\nAverage Risk Score: ${avgRisk}`));
  
  console.log('\n' + chalk.bold('Recommendations:'));
  const criticalFiles = highRiskFiles.filter(f => f.riskScore >= 10);
  if (criticalFiles.length > 0) {
    console.log(chalk.red(`  ⚠ ${criticalFiles.length} critical files need immediate attention`));
  }
  const highFiles = highRiskFiles.filter(f => f.riskScore >= 7 && f.riskScore < 10);
  if (highFiles.length > 0) {
    console.log(chalk.yellow(`  ⚠ ${highFiles.length} files have high risk - consider refactoring`));
  }
  console.log('  • Start by breaking down large files');
  console.log('  • Add tests before refactoring critical files');
  console.log('  • Document complex logic');
  console.log('  • Consider extracting reusable components');
}

function generateRiskReport(highRiskFiles, repoPath, threshold) {
  let report = `# Refactor Risk Report\n\n`;
  report += `**Repository:** ${repoPath}\n`;
  report += `**Threshold:** ${threshold}\n`;
  report += `**Generated:** ${new Date().toISOString()}\n\n`;
  
  if (highRiskFiles.length === 0) {
    report += `No high-risk files found!\n`;
    return report;
  }
  
  report += `## Summary\n\n`;
  report += `Found ${highRiskFiles.length} high-risk files.\n\n`;
  
  const avgRisk = (highRiskFiles.reduce((sum, f) => sum + f.riskScore, 0) / highRiskFiles.length).toFixed(1);
  report += `Average Risk Score: ${avgRisk}\n\n`;
  
  report += `## High-Risk Files\n\n`;
  report += `| Rank | File | Risk Score | Lines | Complexity | Dependencies |\n`;
  report += `|------|------|------------|-------|------------|-------------|\n`;
  
  highRiskFiles.forEach((file, i) => {
    const relPath = path.relative(repoPath, file.path);
    const deps = file.callGraphInfo?.calledBy?.length || 0;
    report += `| ${i + 1} | ${relPath} | ${file.riskScore} | ${file.lines} | ${file.complexity} | ${deps} |\n`;
  });
  
  report += `\n## Risk Score Factors\n\n`;
  report += `- **Complexity:** High cyclomatic complexity increases risk\n`;
  report += `- **Size:** Larger files are harder to refactor\n`;
  report += `- **Change Frequency:** Files that change often are riskier\n`;
  report += `- **Contributors:** Multiple contributors indicate complexity\n`;
  report += `- **Dependencies:** Files with many dependents are critical\n\n`;
  
  report += `## Recommendations\n\n`;
  const criticalFiles = highRiskFiles.filter(f => f.riskScore >= 10);
  if (criticalFiles.length > 0) {
    report += `⚠️ **${criticalFiles.length} critical files** need immediate attention:\n\n`;
    criticalFiles.forEach(file => {
      const relPath = path.relative(repoPath, file.path);
      report += `- ${relPath} (Score: ${file.riskScore})\n`;
    });
    report += `\n`;
  }
  
  report += `### General Recommendations\n\n`;
  report += `1. Start by breaking down large files\n`;
  report += `2. Add tests before refactoring critical files\n`;
  report += `3. Document complex logic\n`;
  report += `4. Consider extracting reusable components\n`;
  report += `5. Review files with high change frequency for stability issues\n\n`;
  
  report += `---\n\n`;
  report += `*This report was automatically generated by Repo Archaeologist.*\n`;
  
  return report;
}

module.exports = { risk };
