const { RepositoryAnalyzer } = require('../analyzers/repository-analyzer');
const fs = require('fs').promises;
const path = require('path');
const { loadCliDeps } = require('../utils/cli-deps');
const { getAnalyzerOptions } = require('../utils/analyzer-options');

async function map(repoPath, options) {
  const { chalk, ora } = await loadCliDeps();
  const spinner = ora('Generating architecture map...').start();
  
  try {
    const analyzer = new RepositoryAnalyzer(repoPath);
    const analysis = await analyzer.analyze(getAnalyzerOptions(options));
    const categories = analyzer.categorizeFiles(analysis.files);
    const features = analyzer.identifyFeatures(analysis.files);
    
    spinner.succeed('Architecture map generated!');
    
    const mapData = {
      repository: analysis.repository,
      categories,
      features,
      callGraph: analysis.callGraph,
      generatedAt: new Date().toISOString()
    };
    
    if (options.format === 'json') {
      const output = JSON.stringify(mapData, null, 2);
      if (options.output) {
        await fs.writeFile(options.output, output);
        console.log(chalk.green(`Map saved to ${options.output}`));
      } else {
        console.log(output);
      }
    } else {
      const markdownMap = generateMarkdownMap(mapData, analysis);
      if (options.output) {
        await fs.writeFile(options.output, markdownMap);
        console.log(chalk.green(`Map saved to ${options.output}`));
      } else {
        console.log(markdownMap);
      }
    }
  } catch (error) {
    spinner.fail('Map generation failed');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

function generateMarkdownMap(mapData, analysis) {
  let markdown = '# Architecture Map\n\n';
  markdown += `**Repository:** ${mapData.repository}\n`;
  markdown += `**Generated:** ${mapData.generatedAt}\n\n`;
  
  markdown += '## Overview\n\n';
  markdown += `- **Total Files:** ${analysis.totalFiles}\n`;
  markdown += `- **Languages:** ${Object.keys(analysis.languages).join(', ')}\n`;
  markdown += `- **Dead Code Files:** ${analysis.deadCode.length}\n\n`;
  
  markdown += '## File Categories\n\n';
  
  if (mapData.categories.entryPoints.length > 0) {
    markdown += `### Entry Points (${mapData.categories.entryPoints.length})\n\n`;
    mapData.categories.entryPoints.forEach(file => {
      const relPath = path.relative(mapData.repository, file.path);
      markdown += `- **${relPath}**\n`;
      markdown += `  - Language: ${file.language}\n`;
      markdown += `  - Lines: ${file.lines}\n`;
      markdown += `  - Owner: ${file.ownership?.primary || 'Unknown'}\n`;
    });
    markdown += '\n';
  }
  
  if (mapData.categories.core.length > 0) {
    markdown += `### Core Files (${mapData.categories.core.length})\n\n`;
    markdown += 'Files that are heavily depended upon:\n\n';
    mapData.categories.core.slice(0, 10).forEach(file => {
      const relPath = path.relative(mapData.repository, file.path);
      const dependencies = file.callGraphInfo?.calledBy?.length || 0;
      markdown += `- **${relPath}** (${dependencies} dependencies)\n`;
    });
    if (mapData.categories.core.length > 10) {
      markdown += `- ... and ${mapData.categories.core.length - 10} more\n`;
    }
    markdown += '\n';
  }
  
  if (mapData.features.length > 0) {
    markdown += '## Features\n\n';
    mapData.features.forEach(feature => {
      markdown += `### ${feature.name}\n\n`;
      markdown += `Files: ${feature.fileCount}\n\n`;
      feature.files.slice(0, 5).forEach(filePath => {
        const relPath = path.relative(mapData.repository, filePath);
        markdown += `- ${relPath}\n`;
      });
      if (feature.files.length > 5) {
        markdown += `- ... and ${feature.files.length - 5} more\n`;
      }
      markdown += '\n';
    });
  }
  
  markdown += '## Key Dependencies\n\n';
  markdown += 'Files with the most incoming dependencies:\n\n';
  const sortedByDeps = analysis.files
    .filter(f => f.callGraphInfo?.calledBy?.length > 0)
    .sort((a, b) => (b.callGraphInfo?.calledBy?.length || 0) - (a.callGraphInfo?.calledBy?.length || 0))
    .slice(0, 10);
  
  sortedByDeps.forEach((file, i) => {
    const relPath = path.relative(mapData.repository, file.path);
    const deps = file.callGraphInfo?.calledBy?.length || 0;
    markdown += `${i + 1}. **${relPath}** (${deps} dependencies)\n`;
  });
  
  return markdown;
}

module.exports = { map };
