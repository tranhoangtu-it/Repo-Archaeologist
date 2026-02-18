const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const simpleGit = require('simple-git');

jest.mock('../src/utils/cli-deps', () => {
  const passthrough = text => text;
  const bold = text => text;
  bold.blue = text => text;
  bold.yellow = text => text;

  const chalk = {
    green: passthrough,
    red: passthrough,
    gray: passthrough,
    cyan: passthrough,
    yellow: passthrough,
    white: passthrough,
    bold
  };

  const ora = jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis()
  }));

  return {
    loadCliDeps: jest.fn(async () => ({ chalk, ora }))
  };
});

const { analyze } = require('../src/commands/analyze');
const { map } = require('../src/commands/map');
const { onboard } = require('../src/commands/onboard');
const { risk } = require('../src/commands/risk');

describe('Command Handlers', () => {
  let tempDir;
  let consoleSpy;
  let errorSpy;
  let exitSpy;

  function getJsonOutput() {
    const jsonCall = consoleSpy.mock.calls.find(call => {
      try {
        JSON.parse(call[0]);
        return true;
      } catch {
        return false;
      }
    });

    return jsonCall ? JSON.parse(jsonCall[0]) : null;
  }

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-cmd-'));
    const git = simpleGit(tempDir);
    await git.init();
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');

    // Create a simple file and commit
    await fs.writeFile(path.join(tempDir, 'index.js'), 'const x = 1;\nmodule.exports = x;');
    await git.add('.').commit('initial commit');

    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(async () => {
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('analyze command', () => {
    test('should complete analysis with text format', async () => {
      await analyze(tempDir, { format: 'text' });
      expect(consoleSpy).toHaveBeenCalled();
    });

    test('should output JSON format', async () => {
      await analyze(tempDir, { format: 'json' });
      expect(getJsonOutput()).toBeDefined();
    });

    test('should save to output file', async () => {
      const outputPath = path.join(tempDir, 'output.json');
      await analyze(tempDir, { format: 'json', output: outputPath });
      const content = await fs.readFile(outputPath, 'utf-8');
      const data = JSON.parse(content);
      expect(data.repository).toBeDefined();
      expect(data.totalFiles).toBeDefined();
    });

    test('should handle errors with process.exit(1)', async () => {
      await expect(
        analyze('/nonexistent/path/that/does/not/exist', {})
      ).rejects.toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errorSpy).toHaveBeenCalled();
    });

    test('should exclude test files from dead code by default', async () => {
      await fs.mkdir(path.join(tempDir, 'tests'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'tests', 'dead.test.js'),
        'const testValue = 1;\nmodule.exports = testValue;'
      );

      await analyze(tempDir, { format: 'json' });
      const output = getJsonOutput();
      const deadPaths = output.deadCode.map(file => file.path);

      expect(deadPaths.some(p => p.includes('dead.test.js'))).toBe(false);
    });

    test('should include test files in dead code when includeTests is enabled', async () => {
      await fs.mkdir(path.join(tempDir, 'tests'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'tests', 'dead.test.js'),
        'const testValue = 1;\nmodule.exports = testValue;'
      );

      await analyze(tempDir, { format: 'json', includeTests: true });
      const output = getJsonOutput();
      const deadPaths = output.deadCode.map(file => file.path);

      expect(deadPaths.some(p => p.includes('dead.test.js'))).toBe(true);
    });

    test('should ignore additional paths from ignore option', async () => {
      await fs.mkdir(path.join(tempDir, 'custom-ignore'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'custom-ignore', 'ignored.js'),
        'const ignoredValue = 1;\nmodule.exports = ignoredValue;'
      );

      await analyze(tempDir, { format: 'json', ignore: 'custom-ignore' });
      const output = getJsonOutput();
      const analyzedPaths = output.files.map(file => file.path);

      expect(analyzedPaths.some(p => p.includes('custom-ignore'))).toBe(false);
    });

    test('should skip co-change analysis when skipCochange is enabled', async () => {
      await fs.writeFile(path.join(tempDir, 'a.js'), 'const a = 1;\nmodule.exports = a;');
      await fs.writeFile(path.join(tempDir, 'b.js'), 'const b = 1;\nmodule.exports = b;');
      await simpleGit(tempDir).add('.').commit('cochange commit');

      await analyze(tempDir, { format: 'json', skipCochange: true });
      const output = getJsonOutput();

      expect(output.files.every(file => Array.isArray(file.coChangedFiles) && file.coChangedFiles.length === 0)).toBe(true);
    });
  });

  describe('map command', () => {
    test('should generate architecture map', async () => {
      await map(tempDir, { format: 'text' });
      expect(consoleSpy).toHaveBeenCalled();
    });

    test('should output JSON format', async () => {
      await map(tempDir, { format: 'json' });
      const jsonCall = consoleSpy.mock.calls.find(call => {
        try { JSON.parse(call[0]); return true; } catch { return false; }
      });
      expect(jsonCall).toBeDefined();
    });

    test('should save map to file', async () => {
      const outputPath = path.join(tempDir, 'map.md');
      await map(tempDir, { format: 'text', output: outputPath });
      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('Architecture Map');
    });

    test('should handle errors with process.exit(1)', async () => {
      await expect(
        map('/nonexistent/path/that/does/not/exist', {})
      ).rejects.toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('onboard command', () => {
    test('should generate onboarding report', async () => {
      await onboard(tempDir, {});
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Onboarding Guide');
    });

    test('should save report to file', async () => {
      const outputPath = path.join(tempDir, 'onboard.md');
      await onboard(tempDir, { output: outputPath });
      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('Onboarding Guide');
      expect(content).toContain('Quick Start');
    });

    test('should handle errors with process.exit(1)', async () => {
      await expect(
        onboard('/nonexistent/path/that/does/not/exist', {})
      ).rejects.toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('risk command', () => {
    test('should calculate risk scores', async () => {
      await risk(tempDir, { threshold: '1' });
      expect(consoleSpy).toHaveBeenCalled();
    });

    test('should use default threshold when not provided', async () => {
      await risk(tempDir, {});
      expect(consoleSpy).toHaveBeenCalled();
    });

    test('should save risk report to file', async () => {
      const outputPath = path.join(tempDir, 'risk.md');
      await risk(tempDir, { threshold: '1', output: outputPath });
      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('Refactor Risk Report');
    });

    test('should handle errors with process.exit(1)', async () => {
      await expect(
        risk('/nonexistent/path/that/does/not/exist', {})
      ).rejects.toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
