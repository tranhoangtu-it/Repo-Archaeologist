const { StaticAnalyzer } = require('../src/analyzers/static-analyzer');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

describe('StaticAnalyzer', () => {
  let tempDir;
  let analyzer;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-repo-'));
    analyzer = new StaticAnalyzer(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('detectLanguage', () => {
    test('should detect JavaScript files', () => {
      expect(analyzer.detectLanguage('.js')).toBe('javascript');
      expect(analyzer.detectLanguage('.jsx')).toBe('javascript');
      expect(analyzer.detectLanguage('.mjs')).toBe('javascript');
    });

    test('should detect TypeScript files', () => {
      expect(analyzer.detectLanguage('.ts')).toBe('typescript');
      expect(analyzer.detectLanguage('.tsx')).toBe('typescript');
    });

    test('should detect Python files', () => {
      expect(analyzer.detectLanguage('.py')).toBe('python');
    });

    test('should detect Java files', () => {
      expect(analyzer.detectLanguage('.java')).toBe('java');
    });

    test('should detect Go files', () => {
      expect(analyzer.detectLanguage('.go')).toBe('go');
    });

    test('should return null for unsupported extensions', () => {
      expect(analyzer.detectLanguage('.txt')).toBeNull();
      expect(analyzer.detectLanguage('.md')).toBeNull();
    });
  });

  describe('analyzeFile', () => {
    test('should analyze a JavaScript file', async () => {
      const filePath = path.join(tempDir, 'test.js');
      const content = `
const express = require('express');
import { something } from 'module';

function myFunction() {
  if (true) {
    console.log('test');
  }
}

class MyClass {
  method() {}
}

module.exports = MyClass;
`;
      await fs.writeFile(filePath, content);

      const analysis = await analyzer.analyzeFile(filePath);

      expect(analysis).not.toBeNull();
      expect(analysis.language).toBe('javascript');
      expect(analysis.lines).toBeGreaterThan(10);
      expect(analysis.imports).toContain('express');
      expect(analysis.imports).toContain('module');
      expect(analysis.functions).toContain('myFunction');
      expect(analysis.classes).toContain('MyClass');
      expect(analysis.exports).toContain('MyClass');
      expect(analysis.complexity).toBeGreaterThan(1);
    });

    test('should return null for unsupported file types', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'some text');

      const analysis = await analyzer.analyzeFile(filePath);

      expect(analysis).toBeNull();
    });

    test('should return null for non-existent files', async () => {
      const filePath = path.join(tempDir, 'nonexistent.js');

      const analysis = await analyzer.analyzeFile(filePath);

      expect(analysis).toBeNull();
    });
  });

  describe('calculateComplexity', () => {
    test('should calculate complexity correctly', () => {
      const simpleCode = 'const x = 1;';
      expect(analyzer.calculateComplexity(simpleCode)).toBe(1);

      const codeWithIf = 'if (x) { doSomething(); }';
      expect(analyzer.calculateComplexity(codeWithIf)).toBe(2);

      const complexCode = `
        if (x) {
          for (let i = 0; i < 10; i++) {
            if (i > 5 && i < 8) {
              try {
                doSomething();
              } catch (e) {
                handleError();
              }
            }
          }
        }
      `;
      expect(analyzer.calculateComplexity(complexCode)).toBeGreaterThan(5);
    });
  });

  describe('analyzeDirectory', () => {
    test('should analyze all supported files in a directory', async () => {
      await fs.writeFile(path.join(tempDir, 'file1.js'), 'const x = 1;');
      await fs.writeFile(path.join(tempDir, 'file2.js'), 'function test() {}');
      await fs.writeFile(path.join(tempDir, 'readme.md'), '# README');

      const analyses = await analyzer.analyzeDirectory(tempDir);

      expect(analyses.length).toBe(2);
      expect(analyses.every(a => a.language === 'javascript')).toBe(true);
    });

    test('should ignore specified patterns', async () => {
      await fs.mkdir(path.join(tempDir, 'node_modules'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'node_modules', 'dep.js'), 'const x = 1;');
      await fs.writeFile(path.join(tempDir, 'main.js'), 'const y = 2;');

      const analyses = await analyzer.analyzeDirectory(tempDir);

      expect(analyses.length).toBe(1);
      expect(analyses[0].path).toContain('main.js');
    });
  });

  describe('buildCallGraph', () => {
    test('should build a call graph from analyses', async () => {
      const file1Path = path.join(tempDir, 'file1.js');
      const file2Path = path.join(tempDir, 'file2.js');

      await fs.writeFile(file1Path, "const x = require('./file2');");
      await fs.writeFile(file2Path, 'module.exports = {};');

      const analyses = await analyzer.analyzeDirectory(tempDir);
      const callGraph = analyzer.buildCallGraph(analyses);

      expect(callGraph).toBeDefined();
      expect(Object.keys(callGraph).length).toBe(2);
    });
  });

  describe('detectDeadCode', () => {
    test('should detect potentially dead code', async () => {
      await fs.writeFile(path.join(tempDir, 'used.js'), 'export const used = 1;');
      await fs.writeFile(path.join(tempDir, 'main.js'), "import { used } from './used';");

      const analyses = await analyzer.analyzeDirectory(tempDir);
      const callGraph = analyzer.buildCallGraph(analyses);
      const deadCode = analyzer.detectDeadCode(analyses, callGraph);

      expect(Array.isArray(deadCode)).toBe(true);
    });
  });
});
