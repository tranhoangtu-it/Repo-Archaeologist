const { GitAnalyzer } = require('../src/analyzers/git-analyzer');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const simpleGit = require('simple-git');

describe('GitAnalyzer', () => {
  let tempDir;
  let git;
  let analyzer;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-git-'));
    git = simpleGit(tempDir);
    await git.init();
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');
    analyzer = new GitAnalyzer(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('checkIsRepo', () => {
    test('should succeed for a valid git repo', async () => {
      await expect(analyzer.checkIsRepo()).resolves.toBeUndefined();
    });

    test('should throw for non-git directory', async () => {
      const nonGitDir = await fs.mkdtemp(path.join(os.tmpdir(), 'not-git-'));
      const badAnalyzer = new GitAnalyzer(nonGitDir);
      await expect(badAnalyzer.checkIsRepo()).rejects.toThrow('Not a git repository');
      await fs.rm(nonGitDir, { recursive: true, force: true });
    });

    test('should cache the check result', async () => {
      await analyzer.checkIsRepo();
      expect(analyzer._isRepoChecked).toBe(true);
      // Second call should not throw even if git state changes
      await analyzer.checkIsRepo();
    });
  });

  describe('getFileHistory', () => {
    test('should return commit history for a file', async () => {
      await fs.writeFile(path.join(tempDir, 'file.js'), 'v1');
      await git.add('.').commit('first');
      await fs.writeFile(path.join(tempDir, 'file.js'), 'v2');
      await git.add('.').commit('second');

      const history = await analyzer.getFileHistory('file.js');
      expect(history).toHaveLength(2);
      expect(history[0].message).toBe('second');
      expect(history[1].message).toBe('first');
    });

    test('should return empty array for non-existent file', async () => {
      await fs.writeFile(path.join(tempDir, 'dummy.js'), 'x');
      await git.add('.').commit('init');

      const history = await analyzer.getFileHistory('nonexistent.js');
      expect(history).toEqual([]);
    });

    test('should return empty array for non-git repo', async () => {
      const nonGitDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nogit-'));
      const badAnalyzer = new GitAnalyzer(nonGitDir);
      const history = await badAnalyzer.getFileHistory('file.js');
      expect(history).toEqual([]);
      await fs.rm(nonGitDir, { recursive: true, force: true });
    });

    test('should build repository index once for multiple file lookups', async () => {
      await fs.writeFile(path.join(tempDir, 'a.js'), 'a1');
      await fs.writeFile(path.join(tempDir, 'b.js'), 'b1');
      await git.add('.').commit('first');
      await fs.writeFile(path.join(tempDir, 'a.js'), 'a2');
      await git.add('.').commit('second');

      const rawSpy = jest.spyOn(analyzer.git, 'raw');

      await analyzer.getFileHistory('a.js');
      await analyzer.getFileHistory('b.js');

      const indexCalls = rawSpy.mock.calls.filter((call) => {
        const [args] = call;
        return Array.isArray(args) && args[0] === 'log' && args.includes('--name-only');
      });
      expect(indexCalls).toHaveLength(1);
    });
  });

  describe('getFileOwnership', () => {
    test('should identify primary owner', async () => {
      await fs.writeFile(path.join(tempDir, 'file.js'), 'v1');
      await git.add('.').commit('first');
      await fs.writeFile(path.join(tempDir, 'file.js'), 'v2');
      await git.add('.').commit('second');

      const ownership = await analyzer.getFileOwnership('file.js');
      expect(ownership.primary).toBe('Test User');
      expect(ownership.totalCommits).toBe(2);
      expect(ownership.contributors).toHaveLength(1);
      expect(ownership.contributors[0]).toEqual({ author: 'Test User', commits: 2 });
    });

    test('should return Unknown for no history', async () => {
      await fs.writeFile(path.join(tempDir, 'dummy.js'), 'x');
      await git.add('.').commit('init');

      const ownership = await analyzer.getFileOwnership('nonexistent.js');
      expect(ownership.primary).toBe('Unknown');
      expect(ownership.contributors).toEqual([]);
      expect(ownership.totalCommits).toBe(0);
    });

    test('should return fallback for non-git repo', async () => {
      const nonGitDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nogit-'));
      const badAnalyzer = new GitAnalyzer(nonGitDir);
      const ownership = await badAnalyzer.getFileOwnership('file.js');
      expect(ownership.primary).toBe('Unknown');
      await fs.rm(nonGitDir, { recursive: true, force: true });
    });
  });

  describe('getChangeFrequency', () => {
    test('should return 0 for single commit', async () => {
      await fs.writeFile(path.join(tempDir, 'file.js'), 'v1');
      await git.add('.').commit('only commit');

      const freq = await analyzer.getChangeFrequency('file.js');
      expect(freq).toBe(0);
    });

    test('should return positive frequency for multiple commits', async () => {
      await fs.writeFile(path.join(tempDir, 'file.js'), 'v1');
      await git.add('.').commit('first');
      await fs.writeFile(path.join(tempDir, 'file.js'), 'v2');
      await git.add('.').commit('second');

      const freq = await analyzer.getChangeFrequency('file.js');
      expect(typeof freq).toBe('number');
      expect(freq).toBeGreaterThanOrEqual(0);
    });

    test('should return 0 for non-existent file', async () => {
      await fs.writeFile(path.join(tempDir, 'dummy.js'), 'x');
      await git.add('.').commit('init');

      const freq = await analyzer.getChangeFrequency('nonexistent.js');
      expect(freq).toBe(0);
    });

    test('should reuse cached history between ownership and frequency lookups', async () => {
      await fs.writeFile(path.join(tempDir, 'file.js'), 'v1');
      await git.add('.').commit('first');
      await fs.writeFile(path.join(tempDir, 'file.js'), 'v2');
      await git.add('.').commit('second');

      const logSpy = jest.spyOn(analyzer.git, 'log');
      const rawSpy = jest.spyOn(analyzer.git, 'raw');

      await analyzer.getFileOwnership('file.js');
      await analyzer.getChangeFrequency('file.js');

      expect(logSpy).toHaveBeenCalledTimes(0);
      const indexCalls = rawSpy.mock.calls.filter((call) => {
        const [args] = call;
        return Array.isArray(args) && args[0] === 'log' && args.includes('--name-only');
      });
      expect(indexCalls).toHaveLength(1);
    });
  });

  describe('getFilesChangedTogether', () => {
    test('should find co-changed files', async () => {
      await fs.writeFile(path.join(tempDir, 'a.js'), 'a1');
      await fs.writeFile(path.join(tempDir, 'b.js'), 'b1');
      await git.add('.').commit('both files');

      const coChanged = await analyzer.getFilesChangedTogether('a.js');
      expect(coChanged.length).toBeGreaterThan(0);
      expect(coChanged[0].file).toBe('b.js');
      expect(coChanged[0].correlation).toBe(1);
    });

    test('should use commit file cache', async () => {
      await fs.writeFile(path.join(tempDir, 'a.js'), 'a1');
      await fs.writeFile(path.join(tempDir, 'b.js'), 'b1');
      await git.add('.').commit('together');

      // First call populates cache
      await analyzer.getFilesChangedTogether('a.js');
      const cacheSize = analyzer._commitFileCache.size;
      expect(cacheSize).toBeGreaterThan(0);

      // Second call uses cache (no new entries)
      await analyzer.getFilesChangedTogether('b.js');
      expect(analyzer._commitFileCache.size).toBe(cacheSize);
    });

    test('should return empty for no history', async () => {
      await fs.writeFile(path.join(tempDir, 'x.js'), 'x');
      await git.add('.').commit('init');

      const result = await analyzer.getFilesChangedTogether('nonexistent.js');
      expect(result).toEqual([]);
    });

    test('should filter by threshold', async () => {
      await fs.writeFile(path.join(tempDir, 'a.js'), 'a1');
      await fs.writeFile(path.join(tempDir, 'b.js'), 'b1');
      await git.add('.').commit('commit1');

      await fs.writeFile(path.join(tempDir, 'a.js'), 'a2');
      await git.add('.').commit('commit2 - only a');

      // b.js only in 1 of 2 commits for a.js = 0.5 correlation
      const result = await analyzer.getFilesChangedTogether('a.js', 0.6);
      const bFile = result.find(r => r.file === 'b.js');
      expect(bFile).toBeUndefined();
    });

    test('should exclude the target file when input path is absolute', async () => {
      const aPath = path.join(tempDir, 'a.js');
      const bPath = path.join(tempDir, 'b.js');
      await fs.writeFile(aPath, 'a1');
      await fs.writeFile(bPath, 'b1');
      await git.add('.').commit('commit1');
      await fs.writeFile(aPath, 'a2');
      await fs.writeFile(bPath, 'b2');
      await git.add('.').commit('commit2');

      const result = await analyzer.getFilesChangedTogether(aPath);
      const files = result.map(entry => entry.file);

      expect(files).toContain('b.js');
      expect(files).not.toContain('a.js');
      expect(files).not.toContain(aPath);
    });
  });

  describe('getRecentlyModifiedFiles', () => {
    test('should return recently modified files', async () => {
      await fs.writeFile(path.join(tempDir, 'recent.js'), 'data');
      await git.add('.').commit('recent change');

      const files = await analyzer.getRecentlyModifiedFiles(90);
      expect(Object.keys(files).length).toBeGreaterThan(0);
      expect(files['recent.js']).toBeDefined();
      expect(files['recent.js'][0].author).toBe('Test User');
    });

    test('should use commit file cache', async () => {
      await fs.writeFile(path.join(tempDir, 'file.js'), 'data');
      await git.add('.').commit('change');

      await analyzer.getRecentlyModifiedFiles(90);
      expect(analyzer._commitFileCache.size).toBeGreaterThan(0);
    });

    test('should return empty for non-git repo', async () => {
      const nonGitDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nogit-'));
      const badAnalyzer = new GitAnalyzer(nonGitDir);
      const result = await badAnalyzer.getRecentlyModifiedFiles();
      expect(result).toEqual({});
      await fs.rm(nonGitDir, { recursive: true, force: true });
    });
  });

  describe('getAllTrackedFiles', () => {
    test('should list tracked files', async () => {
      await fs.writeFile(path.join(tempDir, 'tracked.js'), 'code');
      await git.add('.').commit('add file');

      const files = await analyzer.getAllTrackedFiles();
      expect(files).toContain('tracked.js');
    });

    test('should not include untracked files', async () => {
      await fs.writeFile(path.join(tempDir, 'tracked.js'), 'code');
      await git.add('.').commit('add');
      await fs.writeFile(path.join(tempDir, 'untracked.js'), 'code');

      const files = await analyzer.getAllTrackedFiles();
      expect(files).toContain('tracked.js');
      expect(files).not.toContain('untracked.js');
    });

    test('should return empty for non-git repo', async () => {
      const nonGitDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nogit-'));
      const badAnalyzer = new GitAnalyzer(nonGitDir);
      const result = await badAnalyzer.getAllTrackedFiles();
      expect(result).toEqual([]);
      await fs.rm(nonGitDir, { recursive: true, force: true });
    });
  });

  describe('_getCommitFiles (caching)', () => {
    test('should cache and return consistent results', async () => {
      await fs.writeFile(path.join(tempDir, 'file.js'), 'data');
      await git.add('.').commit('test commit');

      const log = await git.log();
      const hash = log.latest.hash;

      const files1 = await analyzer._getCommitFiles(hash);
      const files2 = await analyzer._getCommitFiles(hash);

      expect(files1).toEqual(files2);
      expect(analyzer._commitFileCache.has(hash)).toBe(true);
    });
  });
});
