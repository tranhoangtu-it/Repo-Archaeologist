# Contributing to Repo Archaeologist

Thank you for your interest in contributing to Repo Archaeologist! This document provides guidelines and instructions for contributing.

## Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/tranhoangtu-it/Repo-Archaeologist.git
   cd Repo-Archaeologist
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run tests**
   ```bash
   npm test
   ```

4. **Try the CLI**
   ```bash
   node bin/cli.js --help
   node bin/cli.js analyze .
   ```

## Project Structure

```
Repo-Archaeologist/
├── bin/
│   └── cli.js              # CLI entry point
├── src/
│   ├── analyzers/
│   │   ├── git-analyzer.js           # Git history analysis
│   │   ├── static-analyzer.js        # Static code analysis
│   │   └── repository-analyzer.js    # Main repository analyzer
│   └── commands/
│       ├── analyze.js      # Analyze command
│       ├── map.js          # Map command
│       ├── onboard.js      # Onboard command
│       └── risk.js         # Risk command
├── tests/
│   ├── static-analyzer.test.js
│   └── repository-analyzer.test.js
├── examples/               # Example outputs
└── README.md
```

## How to Contribute

### Reporting Bugs

If you find a bug, please create an issue with:
- A clear title and description
- Steps to reproduce the issue
- Expected vs actual behavior
- Your environment (Node version, OS)
- Code samples or repository links if applicable

### Suggesting Features

Feature suggestions are welcome! Please create an issue with:
- A clear description of the feature
- Use cases and benefits
- Potential implementation approach (optional)

### Submitting Pull Requests

1. **Fork the repository** and create a feature branch
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow the existing code style
   - Add tests for new functionality
   - Update documentation as needed

3. **Run tests and linting**
   ```bash
   npm test
   npm run lint
   ```

4. **Commit your changes**
   ```bash
   git commit -m "Add feature: description"
   ```

5. **Push and create a pull request**
   ```bash
   git push origin feature/your-feature-name
   ```

## Code Style

- Use 2 spaces for indentation
- Use single quotes for strings
- Add semicolons at the end of statements
- Follow ESLint rules (`.eslintrc.json`)
- Write clear, self-documenting code
- Add comments for complex logic

## Testing

- Write tests for all new features
- Ensure existing tests pass
- Aim for high code coverage
- Use descriptive test names

Example test:
```javascript
describe('MyFeature', () => {
  test('should do something specific', () => {
    // Arrange
    const input = 'test';
    
    // Act
    const result = myFunction(input);
    
    // Assert
    expect(result).toBe('expected');
  });
});
```

## Adding Language Support

To add support for a new programming language:

1. **Update `static-analyzer.js`**
   ```javascript
   languagePatterns: {
     // ...existing languages
     rust: {
       extensions: ['.rs'],
       importPattern: /use\s+([^;]+);/g,
       functionPattern: /fn\s+(\w+)/g,
       // ... other patterns
     }
   }
   ```

2. **Add tests** for the new language in `tests/static-analyzer.test.js`

3. **Update documentation** in README.md

## Adding Commands

To add a new CLI command:

1. **Create command file** in `src/commands/your-command.js`
   ```javascript
   async function yourCommand(repoPath, options) {
     // Implementation
   }
   
   module.exports = { yourCommand };
   ```

2. **Register command** in `bin/cli.js`
   ```javascript
   program
     .command('your-command')
     .description('Description')
     .argument('[path]', 'Path to repository', '.')
     .option('-o, --output <file>', 'Output file')
     .action(yourCommand);
   ```

3. **Add tests** for the new command

4. **Update documentation** in README.md

## Performance Considerations

- Be mindful of large repositories (10k+ files)
- Use streaming for large file operations
- Implement pagination for large result sets
- Avoid loading entire repository into memory
- Profile performance-critical code

## Documentation

- Keep README.md up to date
- Document all public APIs
- Add JSDoc comments for complex functions
- Include usage examples

## Questions?

If you have questions, feel free to:
- Open an issue for discussion
- Tag maintainers in comments
- Check existing issues for similar questions

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
