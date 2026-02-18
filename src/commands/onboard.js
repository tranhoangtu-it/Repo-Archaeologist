const { RepositoryAnalyzer } = require('../analyzers/repository-analyzer');
const fs = require('fs').promises;
const path = require('path');
const { loadCliDeps } = require('../utils/cli-deps');
const { getAnalyzerOptions } = require('../utils/analyzer-options');

async function onboard(repoPath, options) {
  const { chalk, ora } = await loadCliDeps();
  const spinner = ora('Generating onboarding report...').start();
  
  try {
    const analyzer = new RepositoryAnalyzer(repoPath);
    const analysis = await analyzer.analyze(getAnalyzerOptions(options));
    const categories = analyzer.categorizeFiles(analysis.files);
    const features = analyzer.identifyFeatures(analysis.files);
    
    spinner.succeed('Onboarding report generated!');
    
    const report = generateOnboardingReport(analysis, categories, features);
    
    if (options.output) {
      await fs.writeFile(options.output, report);
      console.log(chalk.green(`Report saved to ${options.output}`));
    } else {
      console.log(report);
    }
  } catch (error) {
    spinner.fail('Report generation failed');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

function generateOnboardingReport(analysis, categories, features) {
  let report = '# Onboarding Guide\n\n';
  report += `**Repository:** ${analysis.repository}\n`;
  report += `**Generated:** ${analysis.analyzedAt}\n\n`;
  
  report += '## Quick Start\n\n';
  report += 'Welcome to the codebase! This guide will help you understand the repository structure and get started quickly.\n\n';
  
  report += '### Repository Statistics\n\n';
  report += `- **Total Files:** ${analysis.totalFiles}\n`;
  report += '- **Languages Used:**\n';
  Object.entries(analysis.languages).forEach(([lang, stats]) => {
    const percentage = ((stats.totalLines / Object.values(analysis.languages).reduce((sum, l) => sum + l.totalLines, 0)) * 100).toFixed(1);
    report += `  - ${lang}: ${stats.count} files (${percentage}% of codebase)\n`;
  });
  report += '\n';
  
  report += '### Where to Start\n\n';
  
  if (categories.entryPoints.length > 0) {
    report += '#### Entry Points\n\n';
    report += 'Start by looking at these main entry points:\n\n';
    categories.entryPoints.slice(0, 5).forEach((file, i) => {
      const relPath = path.relative(analysis.repository, file.path);
      report += `${i + 1}. **${relPath}**\n`;
      report += '   - Purpose: Main application entry point\n';
      report += `   - Owner: ${file.ownership?.primary || 'Unknown'}\n`;
      report += `   - Complexity: ${file.complexity > 10 ? 'High' : file.complexity > 5 ? 'Medium' : 'Low'}\n`;
    });
    report += '\n';
  }
  
  if (categories.core.length > 0) {
    report += '#### Core Components\n\n';
    report += 'These are the most important files in the codebase (heavily used by other files):\n\n';
    categories.core.slice(0, 5).forEach((file, i) => {
      const relPath = path.relative(analysis.repository, file.path);
      const deps = file.callGraphInfo?.calledBy?.length || 0;
      report += `${i + 1}. **${relPath}** (used by ${deps} files)\n`;
      report += `   - Owner: ${file.ownership?.primary || 'Unknown'}\n`;
      report += `   - Functions: ${file.functions?.length || 0}\n`;
      report += `   - Classes: ${file.classes?.length || 0}\n`;
    });
    report += '\n';
  }
  
  if (features.length > 0) {
    report += '### Features Overview\n\n';
    features.slice(0, 8).forEach(feature => {
      report += `- **${feature.name}**: ${feature.fileCount} files\n`;
    });
    report += '\n';
  }
  
  report += '### Team & Ownership\n\n';
  report += 'Key contributors to this codebase:\n\n';
  analysis.topContributors.slice(0, 5).forEach((contributor, i) => {
    report += `${i + 1}. **${contributor.author}**\n`;
    report += `   - Primary owner of: ${contributor.filesOwned} files\n`;
    report += `   - Total commits: ${contributor.totalCommits}\n`;
  });
  report += '\n';
  
  report += '### Testing\n\n';
  if (categories.tests.length > 0) {
    report += `This repository has ${categories.tests.length} test files.\n\n`;
    report += 'Test files are located in:\n';
    const testDirs = new Set();
    categories.tests.forEach(file => {
      const dir = path.dirname(path.relative(analysis.repository, file.path));
      testDirs.add(dir);
    });
    testDirs.forEach(dir => {
      report += `- ${dir}\n`;
    });
  } else {
    report += 'No test files detected in standard locations.\n';
  }
  report += '\n';
  
  report += '### Configuration\n\n';
  if (categories.config.length > 0) {
    report += 'Configuration files:\n\n';
    categories.config.forEach(file => {
      const relPath = path.relative(analysis.repository, file.path);
      report += `- ${relPath}\n`;
    });
  } else {
    report += 'No configuration files detected.\n';
  }
  report += '\n';
  
  if (analysis.deadCode.length > 0) {
    report += '### Maintenance Notes\n\n';
    report += `⚠️ There are ${analysis.deadCode.length} files that may be unused (dead code).\n`;
    report += 'Consider reviewing these files for potential cleanup.\n\n';
  }
  
  report += '### Next Steps\n\n';
  report += '1. Read through the entry points to understand the application flow\n';
  report += '2. Review the core components to understand the main abstractions\n';
  report += '3. Check the configuration files to understand project setup\n';
  report += '4. Look at test files to understand expected behavior\n';
  report += '5. Reach out to the key contributors for questions\n\n';
  
  report += '---\n\n';
  report += '*This report was automatically generated by Repo Archaeologist.*\n';
  
  return report;
}

module.exports = { onboard };
