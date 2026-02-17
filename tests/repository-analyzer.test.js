const { RepositoryAnalyzer } = require('../src/analyzers/repository-analyzer');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const simpleGit = require('simple-git');

describe('RepositoryAnalyzer', () => {
  let tempDir;
  let analyzer;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-repo-'));
    
    const git = simpleGit(tempDir);
    await git.init();
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');
    
    analyzer = new RepositoryAnalyzer(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('analyze', () => {
    test('should analyze a repository', async () => {
      await fs.writeFile(path.join(tempDir, 'test.js'), 'const x = 1;');
      await simpleGit(tempDir).add('.').commit('Initial commit');

      const result = await analyzer.analyze();

      expect(result).toBeDefined();
      expect(result.repository).toBe(tempDir);
      expect(result.totalFiles).toBeGreaterThanOrEqual(1);
      expect(result.files).toBeInstanceOf(Array);
      expect(result.callGraph).toBeDefined();
      expect(result.deadCode).toBeInstanceOf(Array);
      expect(result.languages).toBeDefined();
      expect(result.analyzedAt).toBeDefined();
    });

    test('should handle empty repository', async () => {
      const result = await analyzer.analyze();

      expect(result).toBeDefined();
      expect(result.totalFiles).toBe(0);
      expect(result.files).toHaveLength(0);
    });
  });

  describe('aggregateLanguages', () => {
    test('should aggregate language statistics', () => {
      const files = [
        { language: 'javascript', lines: 100, size: 1000 },
        { language: 'javascript', lines: 200, size: 2000 },
        { language: 'python', lines: 150, size: 1500 }
      ];

      const languages = analyzer.aggregateLanguages(files);

      expect(languages.javascript).toBeDefined();
      expect(languages.javascript.count).toBe(2);
      expect(languages.javascript.totalLines).toBe(300);
      expect(languages.javascript.totalSize).toBe(3000);

      expect(languages.python).toBeDefined();
      expect(languages.python.count).toBe(1);
    });
  });

  describe('calculateRiskScore', () => {
    test('should calculate risk score based on multiple factors', () => {
      const lowRiskFile = {
        complexity: 3,
        lines: 50,
        changeFrequency: 0.05,
        ownership: { contributors: [{ author: 'user1', commits: 5 }] },
        callGraphInfo: { calledBy: [] }
      };

      const highRiskFile = {
        complexity: 25,
        lines: 600,
        changeFrequency: 0.6,
        ownership: { contributors: Array(12).fill({ author: 'user', commits: 1 }) },
        callGraphInfo: { calledBy: Array(15).fill('file.js') }
      };

      const lowScore = analyzer.calculateRiskScore(lowRiskFile);
      const highScore = analyzer.calculateRiskScore(highRiskFile);

      expect(lowScore).toBeLessThan(highScore);
      expect(highScore).toBeGreaterThan(10);
    });
  });

  describe('categorizeFiles', () => {
    test('should categorize files correctly', () => {
      const files = [
        { path: '/repo/src/index.js', callGraphInfo: { calledBy: [] } },
        { path: '/repo/src/utils/helper.js', callGraphInfo: { calledBy: ['file1.js'] } },
        { path: '/repo/test/app.test.js', callGraphInfo: { calledBy: [] } },
        { path: '/repo/package.json', callGraphInfo: { calledBy: [] } },
        { path: '/repo/README.md', callGraphInfo: { calledBy: [] } },
        { path: '/repo/src/core.js', callGraphInfo: { calledBy: ['f1', 'f2', 'f3', 'f4'] } }
      ];

      const categories = analyzer.categorizeFiles(files);

      expect(categories.entryPoints.length).toBeGreaterThan(0);
      expect(categories.tests.length).toBeGreaterThan(0);
      expect(categories.config.length).toBeGreaterThan(0);
      expect(categories.documentation.length).toBeGreaterThan(0);
      expect(categories.core.length).toBeGreaterThan(0);
    });
  });

  describe('identifyFeatures', () => {
    test('should identify features from file paths', () => {
      const files = [
        { path: path.join(tempDir, 'auth/login.js') },
        { path: path.join(tempDir, 'auth/logout.js') },
        { path: path.join(tempDir, 'payments/process.js') }
      ];

      const features = analyzer.identifyFeatures(files);

      expect(features.length).toBeGreaterThan(0);
      const featureNames = features.map(f => f.name);
      // Features should be identified from path structure
      expect(featureNames.length).toBeGreaterThan(0);
    });
  });
});
