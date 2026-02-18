# Repo Archaeologist

**Git blame, but for architecture.**

A powerful CLI tool that reconstructs a repository's living architecture using static analysis, call graphs, and Git history. Turn unfamiliar legacy codebases into understandable systems in minutes.

## Features

🔍 **Static Analysis**
- Analyzes JavaScript, TypeScript, Python, Java, and Go codebases
- Extracts functions, classes, imports, and exports
- Calculates cyclomatic complexity
- Builds call graphs to understand dependencies

📊 **Git History Analysis**
- Identifies real file ownership based on commit history
- Tracks change frequency and patterns
- Discovers files that change together
- Detects potentially dead code

🗺️ **Architecture Mapping**
- Categorizes files (entry points, core, utilities, tests, config)
- Identifies features and their associated files
- Visualizes dependency relationships
- Shows key architectural components

📚 **Onboarding Reports**
- Generates comprehensive guides for new developers
- Highlights where to start in the codebase
- Shows team ownership and expertise areas
- Provides context about project structure

⚠️ **Refactor Risk Scores**
- Calculates risk scores based on multiple factors
- Identifies critical files that need attention
- Helps prioritize refactoring efforts
- Shows complexity and change impact

## Installation

### Requirements

- Node.js 20.19+ (or 22.13+ / 24+)
- Git (for repository history analysis)

```bash
npm install -g repo-archaeologist
```

Or use it locally in your project:

```bash
npm install repo-archaeologist
```

## Usage

### Common Analysis Options

- `--ignore <patterns>`: Comma-separated additional paths to ignore during analysis
- `--include-tests`: Include test files in dead-code detection (disabled by default)
- `--skip-cochange`: Skip co-change analysis to speed up large repositories

### Performance Tip

For very large repositories, use `--skip-cochange` to skip co-change correlation analysis and reduce execution time.

### Analyze Repository

Get a comprehensive analysis of your repository:

```bash
repo-archaeologist analyze [path]
```

Options:
- `-o, --output <file>`: Save results to a file
- `--format <type>`: Output format (json, text) - default: text
- `--ignore <patterns>`: Comma-separated additional paths to ignore during analysis
- `--include-tests`: Include test files in dead-code detection
- `--skip-cochange`: Skip co-change analysis to speed up large repositories

Example:
```bash
repo-archaeologist analyze ./my-project --format json -o analysis.json
```

Fast mode example:
```bash
repo-archaeologist analyze ./my-project --skip-cochange
```

### Generate Architecture Map

Create an architecture map showing file categories and dependencies:

```bash
repo-archaeologist map [path]
```

Options:
- `-o, --output <file>`: Save map to a file
- `--format <type>`: Output format (json, markdown) - default: markdown
- `--ignore <patterns>`: Comma-separated additional paths to ignore during analysis
- `--include-tests`: Include test files in dead-code detection
- `--skip-cochange`: Skip co-change analysis to speed up large repositories

Example:
```bash
repo-archaeologist map ./my-project -o architecture.md
```

### Create Onboarding Report

Generate a comprehensive onboarding guide for new developers:

```bash
repo-archaeologist onboard [path]
```

Options:
- `-o, --output <file>`: Save report to a file
- `--ignore <patterns>`: Comma-separated additional paths to ignore during analysis
- `--include-tests`: Include test files in dead-code detection
- `--skip-cochange`: Skip co-change analysis to speed up large repositories

Example:
```bash
repo-archaeologist onboard ./my-project -o ONBOARDING.md
```

### Calculate Refactor Risk

Identify high-risk files that may need refactoring:

```bash
repo-archaeologist risk [path]
```

Options:
- `-o, --output <file>`: Save risk report to a file
- `--threshold <number>`: Minimum risk score to display (default: 5)
- `--ignore <patterns>`: Comma-separated additional paths to ignore during analysis
- `--include-tests`: Include test files in dead-code detection
- `--skip-cochange`: Skip co-change analysis to speed up large repositories

Example:
```bash
repo-archaeologist risk ./my-project --threshold 7 -o risk-report.md
```

## How It Works

Repo Archaeologist combines three powerful techniques:

1. **Static Analysis**: Parses source code to understand structure, imports, exports, and complexity
2. **Call Graph Construction**: Maps dependencies between files to identify core components
3. **Git History Mining**: Analyzes commit history to understand ownership, change patterns, and file relationships

For JavaScript/TypeScript projects, import/export extraction now uses AST parsing (with regex fallback), including support for:
- `require(...)` and `import(...)`
- `module.exports` / `exports.*`
- `tsconfig.json` / `jsconfig.json` path aliases (`baseUrl`, `paths`, and `extends`)
- directory `index.*` import resolution for local modules

## Development

- Use Node.js `20.19+` (or `22.13+` / `24+`), matching CI.
- Run lint: `npm run lint`
- Run tests: `npm test -- --runInBand`

The tool outputs actionable insights including:
- What each file does and how it fits into the architecture
- Which features specific files serve
- Real ownership based on contributions, not just file headers
- Potential dead code that may be safely removed
- Change impact analysis showing which files are coupled

## Supported Languages

- JavaScript (.js, .jsx, .mjs)
- TypeScript (.ts, .tsx)
- Python (.py)
- Java (.java)
- Go (.go)

## Risk Score Factors

Risk scores are calculated based on:

- **Complexity**: High cyclomatic complexity (if, for, while, etc.)
- **Size**: Number of lines of code
- **Change Frequency**: How often the file changes
- **Contributors**: Number of different developers
- **Dependencies**: How many files depend on this file

## Example Output

### Architecture Map

```markdown
# Architecture Map

## File Categories

### Entry Points (3)
- src/index.js - Main application entry
- src/cli.js - Command-line interface
- src/server.js - HTTP server

### Core Files (12)
- src/analyzers/repository-analyzer.js (15 dependencies)
- src/utils/file-system.js (12 dependencies)
```

### Risk Report

```
=== Refactor Risk Report ===

Found 5 high-risk files:

┌──────┬────────────────────────┬────────────┬───────┬────────────┬──────────────┐
│ Rank │ File                   │ Risk Score │ Lines │ Complexity │ Dependencies │
├──────┼────────────────────────┼────────────┼───────┼────────────┼──────────────┤
│ 1    │ src/legacy/parser.js   │ 12         │ 850   │ 45         │ 18           │
│ 2    │ src/core/analyzer.js   │ 10         │ 650   │ 38         │ 15           │
└──────┴────────────────────────┴────────────┴───────┴────────────┴──────────────┘
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Author

Trần Hoàng Tú
