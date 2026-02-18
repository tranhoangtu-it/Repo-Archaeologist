const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { isAstLanguage, extractAstData } = require('../utils/ast-extractor');

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
    this.pathResolutionConfig = this.loadPathResolutionConfig();
  }

  loadPathResolutionConfig() {
    const candidates = ['tsconfig.json', 'jsconfig.json'];
    const defaultConfig = {
      baseUrl: null,
      pathAliases: []
    };

    for (const candidate of candidates) {
      const configPath = path.join(this.repoPath, candidate);
      if (!fsSync.existsSync(configPath)) {
        continue;
      }

      const configChain = this.getConfigChain(configPath);
      if (configChain.length === 0) {
        continue;
      }

      let baseUrl = this.repoPath;
      const mergedPaths = {};

      configChain.forEach(({ configPath: sourcePath, config }) => {
        const compilerOptions = config.compilerOptions || {};
        const configDir = path.dirname(sourcePath);

        if (typeof compilerOptions.baseUrl === 'string') {
          baseUrl = path.resolve(configDir, compilerOptions.baseUrl);
        }

        if (compilerOptions.paths && typeof compilerOptions.paths === 'object') {
          Object.assign(mergedPaths, compilerOptions.paths);
        }
      });

      return {
        baseUrl,
        pathAliases: this.parsePathAliases(mergedPaths, baseUrl)
      };
    }

    return defaultConfig;
  }

  getConfigChain(configPath, visited = new Set()) {
    const absoluteConfigPath = path.resolve(configPath);
    if (visited.has(absoluteConfigPath)) {
      return [];
    }
    visited.add(absoluteConfigPath);

    const parsedConfig = this.readJsonConfig(absoluteConfigPath);
    if (!parsedConfig) {
      return [];
    }

    const chain = [];
    const extendsEntries = this.getExtendsEntries(parsedConfig.extends);

    extendsEntries.forEach((extendsValue) => {
      const resolvedExtendsPath = this.resolveExtendedConfigPath(extendsValue, path.dirname(absoluteConfigPath));
      if (resolvedExtendsPath) {
        const parentChain = this.getConfigChain(resolvedExtendsPath, visited);
        parentChain.forEach((item) => chain.push(item));
      }
    });

    chain.push({
      configPath: absoluteConfigPath,
      config: parsedConfig
    });

    return chain;
  }

  getExtendsEntries(extendsValue) {
    if (!extendsValue) return [];
    if (typeof extendsValue === 'string') return [extendsValue];
    if (Array.isArray(extendsValue)) {
      return extendsValue.filter(value => typeof value === 'string');
    }
    return [];
  }

  resolveExtendedConfigPath(extendsValue, currentDir) {
    if (typeof extendsValue !== 'string' || extendsValue.length === 0) {
      return null;
    }

    if (extendsValue.startsWith('.') || extendsValue.startsWith('/')) {
      return this.resolveConfigFilePath(path.resolve(currentDir, extendsValue));
    }

    const moduleCandidates = [extendsValue];
    if (!extendsValue.endsWith('.json')) {
      moduleCandidates.push(`${extendsValue}.json`);
    }

    for (const candidate of moduleCandidates) {
      try {
        const resolved = require.resolve(candidate, {
          paths: [currentDir, this.repoPath]
        });
        const resolvedConfig = this.resolveConfigFilePath(resolved);
        if (resolvedConfig) {
          return resolvedConfig;
        }
      } catch (_error) {
        // Try next candidate
      }
    }

    return null;
  }

  resolveConfigFilePath(basePath) {
    const candidatePaths = [
      basePath,
      `${basePath}.json`,
      path.join(basePath, 'tsconfig.json'),
      path.join(basePath, 'jsconfig.json')
    ];

    for (const candidate of candidatePaths) {
      try {
        if (fsSync.statSync(candidate).isFile()) {
          return candidate;
        }
      } catch (_error) {
        // Try next candidate
      }
    }

    return null;
  }

  readJsonConfig(configPath) {
    try {
      const rawContent = fsSync.readFileSync(configPath, 'utf8');
      const sanitized = rawContent
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(sanitized);
    } catch (_error) {
      return null;
    }
  }

  parsePathAliases(paths, baseUrl) {
    if (!paths || typeof paths !== 'object') {
      return [];
    }

    const effectiveBaseUrl = baseUrl || this.repoPath;
    return Object.entries(paths)
      .map(([pattern, targets]) => {
        if (!Array.isArray(targets) || targets.length === 0) {
          return null;
        }

        const hasWildcard = pattern.endsWith('/*');
        const prefix = hasWildcard ? pattern.slice(0, -2) : pattern;
        const normalizedTargets = targets
          .filter(target => typeof target === 'string' && target.length > 0)
          .map(target => {
            const targetHasWildcard = target.endsWith('/*');
            const targetPrefix = targetHasWildcard ? target.slice(0, -2) : target;
            return {
              hasWildcard: targetHasWildcard,
              prefix: path.resolve(effectiveBaseUrl, targetPrefix)
            };
          });

        if (normalizedTargets.length === 0) {
          return null;
        }

        return {
          pattern,
          prefix,
          hasWildcard,
          targets: normalizedTargets
        };
      })
      .filter(Boolean);
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
      const extractedData = isAstLanguage(language)
        ? (extractAstData(content, language) || this.extractRegexData(content, patterns))
        : this.extractRegexData(content, patterns);
      const analysis = {
        path: filePath,
        language,
        size: content.length,
        lines: content.split('\n').length,
        imports: extractedData.imports,
        functions: extractedData.functions,
        classes: extractedData.classes,
        exports: extractedData.exports,
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
        analysis.interfaces = extractedData.interfaces || [];
      }
      if (patterns.structPattern) {
        analysis.structs = extractedData.structs || [];
      }

      return analysis;
    } catch (_error) {
      return null;
    }
  }

  extractRegexData(content, patterns) {
    return {
      imports: this.extractMatches(content, patterns.importPattern),
      functions: this.extractMatches(content, patterns.functionPattern),
      classes: this.extractMatches(content, patterns.classPattern),
      exports: this.extractMatches(content, patterns.exportPattern),
      interfaces: patterns.interfacePattern ? this.extractMatches(content, patterns.interfacePattern) : [],
      structs: patterns.structPattern ? this.extractMatches(content, patterns.structPattern) : []
    };
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
    const rootDir = path.resolve(dirPath);
    const normalizedPatterns = ignorePatterns
      .map(pattern => pattern.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/+$/, '').toLowerCase())
      .filter(Boolean);

    function shouldIgnore(entryName, fullPath) {
      const normalizedEntryName = entryName.toLowerCase();
      const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/').toLowerCase();
      const relativeParts = relativePath.split('/');

      return normalizedPatterns.some(pattern => {
        if (normalizedEntryName === pattern) return true;
        if (relativePath === pattern) return true;
        if (relativePath.startsWith(`${pattern}/`)) return true;
        return relativeParts.includes(pattern);
      });
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
        const fullPath = path.join(dir, entry.name);
        if (shouldIgnore(entry.name, fullPath)) continue;

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
    const candidates = this.getImportCandidates(fromFile, importPath);
    for (const candidate of candidates) {
      const resolved = this.resolveExistingPath(candidate);
      if (resolved) {
        return resolved;
      }
    }

    return null;
  }

  getImportCandidates(fromFile, importPath) {
    if (!importPath || typeof importPath !== 'string') {
      return [];
    }

    if (importPath.startsWith('.')) {
      return [path.resolve(path.dirname(fromFile), importPath)];
    }

    const aliasCandidates = this.resolveAliasCandidates(importPath);
    if (aliasCandidates.length > 0) {
      return aliasCandidates;
    }

    const looksLikeProjectPath = importPath.includes('/') ||
      importPath.startsWith('@') ||
      importPath.startsWith('~') ||
      Boolean(path.extname(importPath));

    if (this.pathResolutionConfig.baseUrl && looksLikeProjectPath) {
      return [path.resolve(this.pathResolutionConfig.baseUrl, importPath)];
    }

    return [];
  }

  resolveAliasCandidates(importPath) {
    const { pathAliases } = this.pathResolutionConfig;
    if (!Array.isArray(pathAliases) || pathAliases.length === 0) {
      return [];
    }

    const candidates = [];

    pathAliases.forEach((alias) => {
      if (alias.hasWildcard) {
        if (!importPath.startsWith(alias.prefix)) {
          return;
        }

        const suffix = importPath.slice(alias.prefix.length);
        alias.targets.forEach((target) => {
          const targetRelative = target.hasWildcard
            ? `${target.prefix}${suffix}`
            : target.prefix;
          candidates.push(targetRelative);
        });
        return;
      }

      if (importPath === alias.pattern) {
        alias.targets.forEach((target) => {
          candidates.push(target.prefix);
        });
      }
    });

    return candidates;
  }

  resolveExistingPath(basePath) {
    if (!basePath) return null;

    const candidates = this.expandPathCandidates(basePath);

    for (const candidate of candidates) {
      if (this.fileExists(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  expandPathCandidates(basePath) {
    const importExtensions = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.py', '.java', '.go'];
    const candidates = new Set();
    const normalizedBase = path.normalize(basePath);

    candidates.add(normalizedBase);

    if (!path.extname(normalizedBase)) {
      importExtensions.forEach((ext) => {
        candidates.add(`${normalizedBase}${ext}`);
      });
    }

    importExtensions.forEach((ext) => {
      candidates.add(path.join(normalizedBase, `index${ext}`));
    });

    return Array.from(candidates);
  }

  fileExists(filePath) {
    try {
      return fsSync.statSync(filePath).isFile();
    } catch (_error) {
      return false;
    }
  }

  detectDeadCode(analyses, callGraph, options = {}) {
    const includeTests = Boolean(options.includeTests);
    const deadFiles = [];
    
    analyses.forEach(analysis => {
      if (!includeTests && this.isTestFile(analysis.path)) {
        return;
      }

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

  isTestFile(filePath) {
    const normalizedPath = filePath.toLowerCase();
    return /(^|[\\/])(__tests__|tests?)([\\/]|$)/.test(normalizedPath) ||
      /\.(test|spec)\.[^./\\]+$/.test(normalizedPath);
  }
}

module.exports = { StaticAnalyzer };
