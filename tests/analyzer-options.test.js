const {
  DEFAULT_IGNORE_PATTERNS,
  parseIgnorePatterns,
  getAnalyzerOptions
} = require('../src/utils/analyzer-options');

describe('analyzer-options', () => {
  test('should keep default ignore patterns when option is missing', () => {
    expect(parseIgnorePatterns()).toEqual(DEFAULT_IGNORE_PATTERNS);
  });

  test('should merge custom ignore patterns with defaults', () => {
    const patterns = parseIgnorePatterns('custom,tmp');

    expect(patterns).toEqual(expect.arrayContaining(DEFAULT_IGNORE_PATTERNS));
    expect(patterns).toContain('custom');
    expect(patterns).toContain('tmp');
  });

  test('should enable co-change by default', () => {
    const options = getAnalyzerOptions({});
    expect(options.includeCoChange).toBe(true);
  });

  test('should disable co-change when skipCochange is provided', () => {
    const options = getAnalyzerOptions({ skipCochange: true });
    expect(options.includeCoChange).toBe(false);
  });
});
