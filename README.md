# repo-archaeologist

![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)

CLI tool that reconstructs the architecture of legacy codebases using static analysis, call graphs, and Git history.

## Features

- Static analysis across multiple languages
- Call graph generation
- Git history analysis and ownership detection
- Dependency mapping
- Architecture visualization

## Supported Languages

- JavaScript / TypeScript
- Python
- Java
- Go

## Installation

```bash
npm install -g repo-archaeologist
```

## Usage

```bash
# Analyze a repository
repo-archaeologist analyze ./path/to/repo

# Generate call graph
repo-archaeologist graph ./path/to/repo

# Show ownership map
repo-archaeologist owners ./path/to/repo
```

## Use Cases

- Onboarding onto legacy codebases
- Understanding undocumented architectures
- Identifying code ownership and hotspots
- Planning refactoring strategies

## License

See [LICENSE](./LICENSE) for details.
