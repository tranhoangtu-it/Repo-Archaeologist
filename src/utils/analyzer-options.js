const DEFAULT_IGNORE_PATTERNS = ['node_modules', '.git', 'dist', 'build', 'coverage'];

function parseIgnorePatterns(ignoreOption) {
  if (!ignoreOption) {
    return DEFAULT_IGNORE_PATTERNS;
  }

  const additionalPatterns = ignoreOption
    .split(',')
    .map(pattern => pattern.trim())
    .filter(Boolean);

  return [...new Set([...DEFAULT_IGNORE_PATTERNS, ...additionalPatterns])];
}

function getAnalyzerOptions(options = {}) {
  return {
    ignorePatterns: parseIgnorePatterns(options.ignore),
    includeTestsInDeadCode: Boolean(options.includeTests),
    includeCoChange: options.includeCoChange === false ? false : !Boolean(options.skipCochange)
  };
}

module.exports = {
  DEFAULT_IGNORE_PATTERNS,
  parseIgnorePatterns,
  getAnalyzerOptions
};
