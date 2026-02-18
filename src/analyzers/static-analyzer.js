const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

class StaticAnalyzer {
  constructor(repoPath) {
    this.repoPath = repoPath;
    this.languagePatterns = {
      javascript: {
        extensions: ['.js', '.jsx', '.mjs'],
        importPattern: /(?:import\s+.*?from\s+['"](.+?)['"]|require\s*\(\s*['"](.+?)['"]\s*\))/g,
        functionPattern: /(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>|(\w+)\s*:\s*(?:async\s+)?function)/g,
        classPattern: /class\s+(\w+)/g,
        exportPattern: /export\s+(?:default\s+)?(?:class|function|const)\s+(\w+)|module\.exports\s*=\s*(\w+)/g
      },
      typescript: {
        extensions: ['.ts', '.tsx'],
        importPattern: /(?:import\s+.*?from\s+['"](.+?)['"]|require\s*\(\s*['"](.+?)['"]\s*\))/g,
        functionPattern: /(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>|(\w+)\s*:\s*(?:async\s+)?function)/g,
        classPattern: /class\s+(\w+)/g,
        interfacePattern: /interface\s+(\w+)/g,
        exportPattern: /export\s+(?:default\s+)?(?:class|function|const|interface)\s+(\w+)/g
      },
      python: {
        extensions: ['.py'],
        importPattern: /(?:from\s+(\S+)\s+import|import\s+(\S+))/g,
        functionPattern: /def\s+(\w+)\s*\(/g,
        classPattern: /class\s+(\w+)/g
      },
      java: {
        extensions: ['.java'],
        importPattern: /import\s+([^;]+);/g,
        functionPattern: /(?:public|private|protected)?\s*(?:static\s+)?(?:\w+\s+)+(\w+)\s*\([^)]*\)\s*\{/g,
        classPattern: /(?:public\s+)?class\s+(\w+)/g
      },
      go: {
        extensions: ['.go'],
        importPattern: /import\s+(?:.*?"(.+?)"|"(.+?)")/g,
        groupedImportPattern: /import\s*\(\s*([\s\S]*?)\)/g,
        functionPattern: /func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(/g,
        structPattern: /type\s+(\w+)\s+struct/g
      }
    };
  }

  async analyzeFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const ext = path.extname(filePath);
      const language = this.detectLanguage(ext);
      
      if (!language) {
        return null;
      }

      const patterns = this.languagePatterns[language];
      const analysis = {
        path: filePath,
        language,
        size: content.length,
        lines: content.split('\n').length,
        imports: this.extractMatches(content, patterns.importPattern),
        functions: this.extractMatches(content, patterns.functionPattern),
        classes: this.extractMatches(content, patterns.classPattern),
        exports: this.extractMatches(content, patterns.exportPattern),
        complexity: this.calculateComplexity(content)
      };

      // Handle Go grouped imports: import ( "fmt" \n "os" )
      if (patterns.groupedImportPattern) {
        const groupedImports = this.extractGroupedImports(content, patterns.groupedImportPattern);
        groupedImports.forEach(imp => analysis.imports.push(imp));
        // Deduplicate
        analysis.imports = [...new Set(analysis.imports)];
      }

      if (patterns.interfacePattern) {
        analysis.interfaces = this.extractMatches(content, patterns.interfacePattern);
      }
      if (patterns.structPattern) {
        analysis.structs = this.extractMatches(content, patterns.structPattern);
      }

      return analysis;
    } catch (error) {
      return null;
    }
  }

  detectLanguage(extension) {
    for (const [lang, config] of Object.entries(this.languagePatterns)) {
      if (config.extensions.includes(extension)) {
        return lang;
      }
    }
    return null;
  }

  extractMatches(content, pattern) {
    if (!pattern) return [];
    
    const matches = new Set();
    let match;
    
    while ((match = pattern.exec(content)) !== null) {
      for (let i = 1; i < match.length; i++) {
        if (match[i]) {
          matches.add(match[i]);
        }
      }
    }
    
    return Array.from(matches);
  }

  extractGroupedImports(content, pattern) {
    const imports = [];
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const block = match[1];
      const linePattern = /"(.+?)"/g;
      let lineMatch;
      while ((lineMatch = linePattern.exec(block)) !== null) {
        imports.push(lineMatch[1]);
      }
    }
    return imports;
  }

  calculateComplexity(content) {
    const complexityKeywords = [
      { pattern: /\bif\b/g, name: 'if' },
      { pattern: /\belse\b/g, name: 'else' },
      { pattern: /\bfor\b/g, name: 'for' },
      { pattern: /\bwhile\b/g, name: 'while' },
      { pattern: /\bswitch\b/g, name: 'switch' },
      { pattern: /\bcase\b/g, name: 'case' },
      { pattern: /&&/g, name: '&&' },
      { pattern: /\|\|/g, name: '||' },
      { pattern: /(?<!\?)\?(?![.?])/g, name: '?' },
      { pattern: /\btry\b/g, name: 'try' },
      { pattern: /\bcatch\b/g, name: 'catch' }
    ];
    
    let complexity = 1;
    complexityKeywords.forEach(({ pattern }) => {
      const matches = content.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    });
    
    return complexity;
  }

  async analyzeDirectory(dirPath, ignorePatterns = ['node_modules', '.git', 'dist', 'build', 'coverage']) {
    const analyses = [];
    const self = this;
    const visitedDirs = new Set();

    function shouldIgnore(entryName) {
      return ignorePatterns.some(pattern => entryName === pattern);
    }

    async function walk(dir) {
      // Symlink cycle detection via realpath
      let realDir;
      try {
        realDir = await fs.realpath(dir);
      } catch {
        return; // broken symlink
      }
      if (visitedDirs.has(realDir)) return;
      visitedDirs.add(realDir);

      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (shouldIgnore(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() || entry.isSymbolicLink()) {
          // Check if symlink points to a directory
          if (entry.isSymbolicLink()) {
            try {
              const stat = await fs.stat(fullPath);
              if (!stat.isDirectory()) {
                if (stat.isFile()) {
                  const analysis = await self.analyzeFile(fullPath);
                  if (analysis) analyses.push(analysis);
                }
                continue;
              }
            } catch {
              continue; // broken symlink
            }
          }
          await walk(fullPath);
        } else if (entry.isFile()) {
          const analysis = await self.analyzeFile(fullPath);
          if (analysis) analyses.push(analysis);
        }
      }
    }

    await walk(dirPath);
    return analyses;
  }

  buildCallGraph(analyses) {
    const callGraph = {};
    const fileMap = new Map();
    
    analyses.forEach(analysis => {
      fileMap.set(analysis.path, analysis);
      callGraph[analysis.path] = {
        calls: [],
        calledBy: []
      };
    });

    analyses.forEach(analysis => {
      analysis.imports.forEach(importPath => {
        const resolvedPath = this.resolveImportPath(analysis.path, importPath);
        if (resolvedPath && fileMap.has(resolvedPath)) {
          callGraph[analysis.path].calls.push(resolvedPath);
          callGraph[resolvedPath].calledBy.push(analysis.path);
        }
      });
    });

    return callGraph;
  }

  resolveImportPath(fromFile, importPath) {
    if (importPath.startsWith('.')) {
      const dir = path.dirname(fromFile);
      const resolved = path.resolve(dir, importPath);
      
      const extensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go'];
      for (const ext of extensions) {
        const withExt = resolved + ext;
        try {
          fsSync.accessSync(withExt);
          return withExt;
        } catch (e) {
          // File doesn't exist, try next extension
        }
      }
      return resolved;
    }
    return null;
  }

  detectDeadCode(analyses, callGraph) {
    const deadFiles = [];
    
    analyses.forEach(analysis => {
      const graph = callGraph[analysis.path];
      
      if (!graph) return;
      
      const isReferenced = graph.calledBy.length > 0;
      const hasExports = analysis.exports && analysis.exports.length > 0;
      const baseName = path.basename(analysis.path, path.extname(analysis.path));
      const isEntryPoint = baseName === 'index' ||
                          baseName === 'main' ||
                          baseName === 'app';
      
      if (!isReferenced && !isEntryPoint && hasExports) {
        deadFiles.push({
          path: analysis.path,
          reason: 'No imports found from other files',
          exports: analysis.exports,
          confidence: 'medium'
        });
      }
    });
    
    return deadFiles;
  }
}

module.exports = { StaticAnalyzer };
