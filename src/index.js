const { RepositoryAnalyzer } = require('./analyzers/repository-analyzer');
const { StaticAnalyzer } = require('./analyzers/static-analyzer');
const { GitAnalyzer } = require('./analyzers/git-analyzer');

module.exports = {
  RepositoryAnalyzer,
  StaticAnalyzer,
  GitAnalyzer
};
