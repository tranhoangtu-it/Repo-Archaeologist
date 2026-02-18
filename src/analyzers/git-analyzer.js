const simpleGit = require('simple-git');
const path = require('path');

class GitAnalyzer {
  constructor(repoPath) {
    this.repoPath = repoPath;
    this.git = simpleGit(repoPath);
    this._commitFileCache = new Map();
    this._fileHistoryCache = new Map();
    this._repoIndexPromise = null;
    this._isRepoChecked = false;
  }

  _normalizeFilePath(filePath) {
    if (typeof filePath !== 'string') {
      return '';
    }

    const trimmed = filePath.trim();
    if (trimmed.length === 0) {
      return '';
    }

    const absolutePath = path.isAbsolute(trimmed)
      ? path.normalize(trimmed)
      : path.resolve(this.repoPath, trimmed);
    const relativePath = path.relative(this.repoPath, absolutePath);

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return '';
    }

    return relativePath.replace(/\\/g, '/');
  }

  _parseRepositoryLog(rawLog) {
    const commits = [];
    const commitFilesMap = new Map();
    const fileCommitsMap = new Map();
    let currentCommit = null;

    rawLog.split('\n').forEach((line) => {
      if (!line) {
        return;
      }

      const headerParts = line.split('\t');
      if (headerParts.length >= 4 && /^[0-9a-f]{7,40}$/i.test(headerParts[0])) {
        const [hash, authorName, date, ...messageParts] = headerParts;
        currentCommit = {
          hash,
          author_name: authorName,
          date,
          message: messageParts.join('\t')
        };
        commits.push(currentCommit);
        commitFilesMap.set(hash, []);
        return;
      }

      if (!currentCommit) {
        return;
      }

      const normalizedFile = line.trim().replace(/\\/g, '/');
      if (!normalizedFile) {
        return;
      }

      const commitFiles = commitFilesMap.get(currentCommit.hash) || [];
      if (!commitFiles.includes(normalizedFile)) {
        commitFiles.push(normalizedFile);
        commitFilesMap.set(currentCommit.hash, commitFiles);
      }

      if (!fileCommitsMap.has(normalizedFile)) {
        fileCommitsMap.set(normalizedFile, []);
      }
      fileCommitsMap.get(normalizedFile).push(currentCommit);
    });

    return {
      commits,
      commitFilesMap,
      fileCommitsMap
    };
  }

  async _getRepositoryIndex() {
    if (this._repoIndexPromise) {
      return this._repoIndexPromise;
    }

    this._repoIndexPromise = (async () => {
      await this.checkIsRepo();
      const rawLog = await this.git.raw([
        'log',
        '--name-only',
        '--date=iso-strict',
        '--pretty=format:%H%x09%an%x09%aI%x09%s'
      ]);
      const repositoryIndex = this._parseRepositoryLog(rawLog);

      repositoryIndex.commitFilesMap.forEach((files, hash) => {
        this._commitFileCache.set(hash, files);
      });
      repositoryIndex.fileCommitsMap.forEach((commits, filePath) => {
        this._fileHistoryCache.set(filePath, commits);
      });

      return repositoryIndex;
    })().catch((error) => {
      this._repoIndexPromise = null;
      throw error;
    });

    return this._repoIndexPromise;
  }

  async checkIsRepo() {
    if (this._isRepoChecked) return;
    const isRepo = await this.git.checkIsRepo();
    if (!isRepo) {
      throw new Error(`Not a git repository: ${this.repoPath}`);
    }
    this._isRepoChecked = true;
  }

  async _getCommitFiles(hash) {
    if (this._commitFileCache.has(hash)) {
      return this._commitFileCache.get(hash);
    }
    const diffSummary = await this.git.show([hash, '--name-only', '--format=']);
    const files = diffSummary.split('\n').filter(f => f.trim());
    this._commitFileCache.set(hash, files);
    return files;
  }

  async getFileHistory(filePath) {
    try {
      await this.checkIsRepo();
      const normalizedPath = this._normalizeFilePath(filePath);
      if (!normalizedPath) {
        return [];
      }

      if (this._fileHistoryCache.has(normalizedPath)) {
        return this._fileHistoryCache.get(normalizedPath);
      }

      let history = [];
      try {
        const repositoryIndex = await this._getRepositoryIndex();
        history = repositoryIndex.fileCommitsMap.get(normalizedPath) || [];
      } catch {
        const log = await this.git.log({ file: normalizedPath });
        history = log.all;
      }

      this._fileHistoryCache.set(normalizedPath, history);
      return history;
    } catch (_error) {
      return [];
    }
  }

  async getFileOwnership(filePath) {
    try {
      const commits = await this.getFileHistory(filePath);
      const authorCounts = {};

      commits.forEach(commit => {
        const author = commit.author_name;
        authorCounts[author] = (authorCounts[author] || 0) + 1;
      });

      const sortedAuthors = Object.entries(authorCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([author, commits]) => ({ author, commits }));

      return {
        primary: sortedAuthors[0]?.author || 'Unknown',
        contributors: sortedAuthors,
        totalCommits: commits.length
      };
    } catch (_error) {
      return {
        primary: 'Unknown',
        contributors: [],
        totalCommits: 0
      };
    }
  }

  async getRecentlyModifiedFiles(daysAgo = 90) {
    try {
      const repositoryIndex = await this._getRepositoryIndex();
      const sinceMs = Date.now() - daysAgo * 24 * 60 * 60 * 1000;

      const fileModifications = {};
      for (const commit of repositoryIndex.commits) {
        const commitMs = Date.parse(commit.date);
        if (!Number.isNaN(commitMs) && commitMs < sinceMs) {
          continue;
        }

        const files = repositoryIndex.commitFilesMap.get(commit.hash) || [];

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
    } catch (_error) {
      return {};
    }
  }

  async getChangeFrequency(filePath) {
    try {
      const commits = await this.getFileHistory(filePath);
      
      if (commits.length < 2) {
        return 0;
      }

      const firstCommit = new Date(commits[commits.length - 1].date);
      const lastCommit = new Date(commits[0].date);
      const daysDiff = (lastCommit - firstCommit) / (1000 * 60 * 60 * 24);
      
      return daysDiff > 0 ? commits.length / daysDiff : 0;
    } catch (_error) {
      return 0;
    }
  }

  async getFilesChangedTogether(filePath, threshold = 0.3) {
    try {
      const normalizedPath = this._normalizeFilePath(filePath);
      if (!normalizedPath) {
        return [];
      }

      const repositoryIndex = await this._getRepositoryIndex();
      const fileHistory = await this.getFileHistory(normalizedPath);
      const fileCommits = new Set(fileHistory.map(c => c.hash));
      if (fileCommits.size === 0) {
        return [];
      }

      const coChangedFiles = {};

      for (const hash of fileCommits) {
        const files = (repositoryIndex.commitFilesMap.get(hash) || [])
          .filter(file => file !== normalizedPath);
        
        files.forEach(file => {
          coChangedFiles[file] = (coChangedFiles[file] || 0) + 1;
        });
      }

      const totalCommits = fileCommits.size;
      const relatedFiles = Object.entries(coChangedFiles)
        .filter(([, count]) => count / totalCommits >= threshold)
        .map(([file, count]) => ({
          file,
          count,
          correlation: count / totalCommits 
        }))
        .sort((a, b) => b.correlation - a.correlation);

      return relatedFiles;
    } catch (_error) {
      return [];
    }
  }

  async getAllTrackedFiles() {
    try {
      await this.checkIsRepo();
      const files = await this.git.raw(['ls-files']);
      return files.split('\n').filter(f => f.trim());
    } catch (_error) {
      return [];
    }
  }
}

module.exports = { GitAnalyzer };
