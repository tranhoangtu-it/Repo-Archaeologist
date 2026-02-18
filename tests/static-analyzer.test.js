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

    test('should include dynamic imports extracted from AST', async () => {
      const filePath = path.join(tempDir, 'dynamic-import.js');
      const content = `
async function loadFeature() {
  const feature = await import('./feature');
  return feature;
}
`;
      await fs.writeFile(filePath, content);

      const analysis = await analyzer.analyzeFile(filePath);

      expect(analysis).not.toBeNull();
      expect(analysis.imports).toContain('./feature');
      expect(analysis.functions).toContain('loadFeature');
    });

    test('should ignore pseudo imports and exports inside strings/comments', async () => {
      const filePath = path.join(tempDir, 'false-positive.js');
      const content = `
// import fake from 'fake-module';
// module.exports = Fake;
const str1 = "require('not-real')";
const str2 = 'export const nope = true;';
const tpl = \`module.exports = Something\`;

function realFunction() {
  return str1 + str2 + tpl;
}
`;
      await fs.writeFile(filePath, content);

      const analysis = await analyzer.analyzeFile(filePath);

      expect(analysis).not.toBeNull();
      expect(analysis.imports).toEqual([]);
      expect(analysis.exports).toEqual([]);
      expect(analysis.functions).toContain('realFunction');
    });

    test('should analyze TypeScript exports with AST', async () => {
      const filePath = path.join(tempDir, 'feature.ts');
      const content = `
import { helper } from './helper';

export interface FeatureConfig {
  enabled: boolean;
}

export const runFeature = () => helper();
`;
      await fs.writeFile(filePath, content);

      const analysis = await analyzer.analyzeFile(filePath);

      expect(analysis).not.toBeNull();
      expect(analysis.language).toBe('typescript');
      expect(analysis.imports).toContain('./helper');
      expect(analysis.interfaces).toContain('FeatureConfig');
      expect(analysis.functions).toContain('runFeature');
      expect(analysis.exports).toContain('runFeature');
      expect(analysis.exports).toContain('FeatureConfig');
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

    test('should not count ?. (optional chaining) as complexity', () => {
      const code = 'const x = obj?.foo?.bar;';
      // Only base complexity 1, no ternary counted
      expect(analyzer.calculateComplexity(code)).toBe(1);
    });

    test('should not count ?? (nullish coalescing) as complexity', () => {
      const code = 'const x = a ?? b;';
      expect(analyzer.calculateComplexity(code)).toBe(1);
    });

    test('should count ternary ? correctly', () => {
      const code = 'const x = condition ? a : b;';
      // Base 1 + ternary 1 = 2
      expect(analyzer.calculateComplexity(code)).toBe(2);
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

    test('should ignore nested relative path patterns', async () => {
      await fs.mkdir(path.join(tempDir, 'src', 'utils'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'src', 'index.js'), 'const root = true;');
      await fs.writeFile(path.join(tempDir, 'src', 'utils', 'helper.js'), 'const helper = true;');

      const analyses = await analyzer.analyzeDirectory(tempDir, [
        'node_modules',
        '.git',
        'dist',
        'build',
        'coverage',
        'src/utils'
      ]);
      const analyzedPaths = analyses.map(a => a.path);

      expect(analyzedPaths.some(p => p.includes('src/utils/helper.js'))).toBe(false);
      expect(analyzedPaths.some(p => p.includes('src/index.js'))).toBe(true);
    });

    test('should not false-positive ignore dirs with similar names (e.g. build-utils vs build)', async () => {
      await fs.mkdir(path.join(tempDir, 'build-utils'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'build-utils', 'helper.js'), 'const x = 1;');

      const analyses = await analyzer.analyzeDirectory(tempDir);
      const helperFile = analyses.find(a => a.path.includes('build-utils'));
      expect(helperFile).toBeDefined();
    });

    test('should handle symlink cycles without crashing', async () => {
      await fs.mkdir(path.join(tempDir, 'dirA'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'dirA', 'file.js'), 'const x = 1;');
      // Create circular symlink: dirA/link -> tempDir
      try {
        await fs.symlink(tempDir, path.join(tempDir, 'dirA', 'link'), 'dir');
      } catch {
        // Symlinks may not be supported on all platforms
        return;
      }

      // Should complete without infinite loop
      const analyses = await analyzer.analyzeDirectory(tempDir);
      expect(analyses.length).toBeGreaterThan(0);
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

    test('should resolve directory index imports in call graph', async () => {
      const mainPath = path.join(tempDir, 'main.js');
      const libDir = path.join(tempDir, 'lib');
      const libIndexPath = path.join(libDir, 'index.js');
      await fs.mkdir(libDir, { recursive: true });
      await fs.writeFile(mainPath, "const lib = require('./lib');");
      await fs.writeFile(libIndexPath, 'module.exports = {};');

      const analyses = await analyzer.analyzeDirectory(tempDir);
      const callGraph = analyzer.buildCallGraph(analyses);

      expect(callGraph[mainPath].calls).toContain(libIndexPath);
      expect(callGraph[libIndexPath].calledBy).toContain(mainPath);
    });

    test('should resolve tsconfig path aliases in call graph', async () => {
      await fs.writeFile(
        path.join(tempDir, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            baseUrl: '.',
            paths: {
              '@/*': ['src/*']
            }
          }
        }, null, 2)
      );

      analyzer = new StaticAnalyzer(tempDir);
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      const mainPath = path.join(tempDir, 'src', 'main.ts');
      const corePath = path.join(tempDir, 'src', 'core.ts');

      await fs.writeFile(mainPath, "import { core } from '@/core';\nexport const main = core;");
      await fs.writeFile(corePath, 'export const core = 1;');

      const analyses = await analyzer.analyzeDirectory(tempDir);
      const callGraph = analyzer.buildCallGraph(analyses);

      expect(callGraph[mainPath].calls).toContain(corePath);
      expect(callGraph[corePath].calledBy).toContain(mainPath);
    });

    test('should resolve path aliases from extended tsconfig in call graph', async () => {
      const configDir = path.join(tempDir, 'config');
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        path.join(configDir, 'tsconfig.base.json'),
        JSON.stringify({
          compilerOptions: {
            baseUrl: '..',
            paths: {
              '@/*': ['src/*']
            }
          }
        }, null, 2)
      );
      await fs.writeFile(
        path.join(tempDir, 'tsconfig.json'),
        JSON.stringify({
          extends: './config/tsconfig.base.json'
        }, null, 2)
      );

      analyzer = new StaticAnalyzer(tempDir);
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      const mainPath = path.join(tempDir, 'src', 'main.ts');
      const corePath = path.join(tempDir, 'src', 'core.ts');

      await fs.writeFile(mainPath, "import { core } from '@/core';\nexport const main = core;");
      await fs.writeFile(corePath, 'export const core = 1;');

      const analyses = await analyzer.analyzeDirectory(tempDir);
      const callGraph = analyzer.buildCallGraph(analyses);

      expect(callGraph[mainPath].calls).toContain(corePath);
      expect(callGraph[corePath].calledBy).toContain(mainPath);
    });
  });

  describe('extractGroupedImports', () => {
    test('should extract Go grouped imports', () => {
      const content = `
package main

import (
    "fmt"
    "os"
    "strings"
)

func main() {}
`;
      const pattern = /import\s*\(\s*([\s\S]*?)\)/g;
      const imports = analyzer.extractGroupedImports(content, pattern);
      expect(imports).toContain('fmt');
      expect(imports).toContain('os');
      expect(imports).toContain('strings');
    });
  });

  describe('analyzeFile - Go', () => {
    test('should detect Go grouped imports', async () => {
      const filePath = path.join(tempDir, 'main.go');
      const content = `package main

import (
    "fmt"
    "os"
)

func main() {
    fmt.Println("hello")
}
`;
      await fs.writeFile(filePath, content);
      const analysis = await analyzer.analyzeFile(filePath);

      expect(analysis).not.toBeNull();
      expect(analysis.language).toBe('go');
      expect(analysis.imports).toContain('fmt');
      expect(analysis.imports).toContain('os');
      expect(analysis.functions).toContain('main');
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

    test('should not flag files named index/main/app as dead code', () => {
      const analyses = [
        { path: '/repo/src/main.js', exports: ['something'] },
        { path: '/repo/src/index.js', exports: ['foo'] },
        { path: '/repo/src/app.js', exports: ['bar'] },
        { path: '/repo/maintenance/helper.js', exports: ['help'] }
      ];
      const callGraph = {
        '/repo/src/main.js': { calls: [], calledBy: [] },
        '/repo/src/index.js': { calls: [], calledBy: [] },
        '/repo/src/app.js': { calls: [], calledBy: [] },
        '/repo/maintenance/helper.js': { calls: [], calledBy: [] }
      };

      const deadCode = analyzer.detectDeadCode(analyses, callGraph);

      // main.js, index.js, app.js should NOT be flagged as dead code
      const deadPaths = deadCode.map(d => d.path);
      expect(deadPaths).not.toContain('/repo/src/main.js');
      expect(deadPaths).not.toContain('/repo/src/index.js');
      expect(deadPaths).not.toContain('/repo/src/app.js');
      // maintenance/helper.js SHOULD be flagged (basename is "helper", not "main")
      expect(deadPaths).toContain('/repo/maintenance/helper.js');
    });

    test('should ignore test files in dead-code detection by default', () => {
      const analyses = [
        { path: '/repo/tests/example.test.js', exports: ['something'] },
        { path: '/repo/src/feature.js', exports: ['feature'] }
      ];
      const callGraph = {
        '/repo/tests/example.test.js': { calls: [], calledBy: [] },
        '/repo/src/feature.js': { calls: [], calledBy: [] }
      };

      const deadCode = analyzer.detectDeadCode(analyses, callGraph);
      const deadPaths = deadCode.map(d => d.path);

      expect(deadPaths).not.toContain('/repo/tests/example.test.js');
      expect(deadPaths).toContain('/repo/src/feature.js');
    });

    test('should include test files when includeTests option is enabled', () => {
      const analyses = [
        { path: '/repo/tests/example.test.js', exports: ['something'] }
      ];
      const callGraph = {
        '/repo/tests/example.test.js': { calls: [], calledBy: [] }
      };

      const deadCode = analyzer.detectDeadCode(analyses, callGraph, {
        includeTests: true
      });

      expect(deadCode.map(d => d.path)).toContain('/repo/tests/example.test.js');
    });
  });
});
