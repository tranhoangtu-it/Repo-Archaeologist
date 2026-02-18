let cachedDeps = null;

async function loadCliDeps() {
  if (cachedDeps) {
    return cachedDeps;
  }

  const [chalkModule, oraModule] = await Promise.all([
    import('chalk'),
    import('ora')
  ]);

  cachedDeps = {
    chalk: chalkModule.default,
    ora: oraModule.default
  };

  return cachedDeps;
}

module.exports = { loadCliDeps };
