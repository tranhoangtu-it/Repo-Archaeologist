const { GitAnalyzer } = require('./git-analyzer');
const { StaticAnalyzer } = require('./static-analyzer');
const path = require('path');

const GIT_CONCURRENCY_LIMIT = 5;

class RepositoryAnalyzer {
  constructor(repoPath) {
    this.repoPath = path.resolve(repoPath);
    this.gitAnalyzer = new GitAnalyzer(this.repoPath);
    this.staticAnalyzer = new StaticAnalyzer(this.repoPath);
  }

  async analyze() {
    const staticAnalysis = await this.staticAnalyzer.analyzeDirectory(this.repoPath);
    const callGraph = this.staticAnalyzer.buildCallGraph(staticAnalysis);
    const deadCode = this.staticAnalyzer.detectDeadCode(staticAnalysis, callGraph);

    const filesWithGitInfo = await this._processWithConcurrency(
      staticAnalysis,
      async (fileAnalysis) => {
        const ownership = await this.gitAnalyzer.getFileOwnership(fileAnalysis.path);
        const changeFrequency = await this.gitAnalyzer.getChangeFrequency(fileAnalysis.path);
        const coChangedFiles = await this.gitAnalyzer.getFilesChangedTogether(fileAnalysis.path);

        return {
          ...fileAnalysis,
          ownership,
          changeFrequency,
          coChangedFiles: coChangedFiles.slice(0, 5),
          callGraphInfo: callGraph[fileAnalysis.path]
        };
      },
      GIT_CONCURRENCY_LIMIT
    );

    return {
      repository: this.repoPath,
      totalFiles: filesWithGitInfo.length,
      files: filesWithGitInfo,
      callGraph,
      deadCode,
      languages: this.aggregateLanguages(filesWithGitInfo),
      topContributors: this.aggregateContributors(filesWithGitInfo),
      analyzedAt: new Date().toISOString()
    };
  }

  aggregateLanguages(files) {
    const languages = {};
    files.forEach(file => {
      if (!languages[file.language]) {
        languages[file.language] = {
          count: 0,
          totalLines: 0,
          totalSize: 0
        };
      }
      languages[file.language].count++;
      languages[file.language].totalLines += file.lines;
      languages[file.language].totalSize += file.size;
    });
    return languages;
  }

  aggregateContributors(files) {
    const contributors = {};
    files.forEach(file => {
      if (file.ownership && file.ownership.contributors) {
        file.ownership.contributors.forEach(({ author, commits }) => {
          if (!contributors[author]) {
            contributors[author] = {
              filesOwned: 0,
              totalCommits: 0
            };
          }
          contributors[author].totalCommits += commits;
        });
        
        if (file.ownership.primary && file.ownership.primary !== 'Unknown') {
          contributors[file.ownership.primary].filesOwned++;
        }
      }
    });

    return Object.entries(contributors)
      .map(([author, data]) => ({ author, ...data }))
      .sort((a, b) => b.totalCommits - a.totalCommits)
      .slice(0, 10);
  }

  calculateRiskScore(file) {
    let score = 0;
    
    if (file.complexity > 20) score += 3;
    else if (file.complexity > 10) score += 2;
    else if (file.complexity > 5) score += 1;
    
    if (file.lines > 500) score += 3;
    else if (file.lines > 300) score += 2;
    else if (file.lines > 150) score += 1;
    
    if (file.changeFrequency > 0.5) score += 3;
    else if (file.changeFrequency > 0.2) score += 2;
    else if (file.changeFrequency > 0.1) score += 1;
    
    const contributorCount = file.ownership?.contributors?.length || 0;
    if (contributorCount > 10) score += 2;
    else if (contributorCount > 5) score += 1;
    
    const incomingDeps = file.callGraphInfo?.calledBy?.length || 0;
    if (incomingDeps > 10) score += 3;
    else if (incomingDeps > 5) score += 2;
    else if (incomingDeps > 2) score += 1;
    
    return score;
  }

  categorizeFiles(files) {
    const categories = {
      entryPoints: [],
      core: [],
      utilities: [],
      tests: [],
      config: [],
      documentation: []
    };

    files.forEach(file => {
      const filePath = file.path.toLowerCase();
      const fileName = path.basename(filePath);
      
      if (filePath.includes('test') || filePath.includes('spec')) {
        categories.tests.push(file);
      } else if (fileName.includes('config') || fileName.includes('.config') || 
                 fileName === 'package.json' || fileName === 'tsconfig.json') {
        categories.config.push(file);
      } else if (filePath.includes('readme') || fileName.endsWith('.md')) {
        categories.documentation.push(file);
      } else if (fileName.includes('index') || fileName.includes('main') || 
                 fileName.includes('app')) {
        categories.entryPoints.push(file);
      } else if (fileName.includes('util') || fileName.includes('helper') || 
                 filePath.includes('utils') || filePath.includes('helpers')) {
        categories.utilities.push(file);
      } else {
        const incomingDeps = file.callGraphInfo?.calledBy?.length || 0;
        if (incomingDeps > 3) {
          categories.core.push(file);
        } else {
          categories.utilities.push(file);
        }
      }
    });

    return categories;
  }

  async _processWithConcurrency(items, fn, limit) {
    const results = [];
    for (let i = 0; i < items.length; i += limit) {
      const batch = items.slice(i, i + limit);
      const batchResults = await Promise.all(batch.map(fn));
      results.push(...batchResults);
    }
    return results;
  }

  identifyFeatures(files) {
    const features = new Map();
    
    files.forEach(file => {
      const pathParts = file.path.split(path.sep);
      
      const featureIndicators = pathParts.filter(part => 
        !['src', 'lib', 'app', 'components', 'utils', 'test'].includes(part.toLowerCase())
      );

      if (featureIndicators.length > 0) {
        const feature = featureIndicators[0];
        if (!features.has(feature)) {
          features.set(feature, []);
        }
        features.get(feature).push(file.path);
      }
    });

    return Array.from(features.entries()).map(([name, files]) => ({
      name,
      fileCount: files.length,
      files
    }));
  }
}

module.exports = { RepositoryAnalyzer };
