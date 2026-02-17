const simpleGit = require('simple-git');
const path = require('path');

class GitAnalyzer {
  constructor(repoPath) {
    this.repoPath = repoPath;
    this.git = simpleGit(repoPath);
  }

  async getFileHistory(filePath) {
    try {
      const log = await this.git.log({ file: filePath });
      return log.all;
    } catch (error) {
      return [];
    }
  }

  async getFileOwnership(filePath) {
    try {
      const log = await this.git.log({ file: filePath });
      const authorCounts = {};
      
      log.all.forEach(commit => {
        const author = commit.author_name;
        authorCounts[author] = (authorCounts[author] || 0) + 1;
      });

      const sortedAuthors = Object.entries(authorCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([author, commits]) => ({ author, commits }));

      return {
        primary: sortedAuthors[0]?.author || 'Unknown',
        contributors: sortedAuthors,
        totalCommits: log.all.length
      };
    } catch (error) {
      return {
        primary: 'Unknown',
        contributors: [],
        totalCommits: 0
      };
    }
  }

  async getRecentlyModifiedFiles(daysAgo = 90) {
    try {
      const since = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
      const log = await this.git.log({ '--since': since });
      
      const fileModifications = {};
      for (const commit of log.all) {
        const diffSummary = await this.git.show([commit.hash, '--name-only', '--format=']);
        const files = diffSummary.split('\n').filter(f => f.trim());
        
        files.forEach(file => {
          if (!fileModifications[file]) {
            fileModifications[file] = [];
          }
          fileModifications[file].push({
            hash: commit.hash,
            author: commit.author_name,
            date: commit.date,
            message: commit.message
          });
        });
      }
      
      return fileModifications;
    } catch (error) {
      return {};
    }
  }

  async getChangeFrequency(filePath) {
    try {
      const log = await this.git.log({ file: filePath });
      const commits = log.all;
      
      if (commits.length < 2) {
        return 0;
      }

      const firstCommit = new Date(commits[commits.length - 1].date);
      const lastCommit = new Date(commits[0].date);
      const daysDiff = (lastCommit - firstCommit) / (1000 * 60 * 60 * 24);
      
      return daysDiff > 0 ? commits.length / daysDiff : 0;
    } catch (error) {
      return 0;
    }
  }

  async getFilesChangedTogether(filePath, threshold = 0.3) {
    try {
      const fileLog = await this.git.log({ file: filePath });
      const fileCommits = new Set(fileLog.all.map(c => c.hash));
      
      const coChangedFiles = {};
      
      for (const hash of fileCommits) {
        const diffSummary = await this.git.show([hash, '--name-only', '--format=']);
        const files = diffSummary.split('\n').filter(f => f.trim() && f !== filePath);
        
        files.forEach(file => {
          coChangedFiles[file] = (coChangedFiles[file] || 0) + 1;
        });
      }

      const totalCommits = fileCommits.size;
      const relatedFiles = Object.entries(coChangedFiles)
        .filter(([_, count]) => count / totalCommits >= threshold)
        .map(([file, count]) => ({ 
          file, 
          count, 
          correlation: count / totalCommits 
        }))
        .sort((a, b) => b.correlation - a.correlation);

      return relatedFiles;
    } catch (error) {
      return [];
    }
  }

  async getAllTrackedFiles() {
    try {
      const files = await this.git.raw(['ls-files']);
      return files.split('\n').filter(f => f.trim());
    } catch (error) {
      return [];
    }
  }
}

module.exports = { GitAnalyzer };
