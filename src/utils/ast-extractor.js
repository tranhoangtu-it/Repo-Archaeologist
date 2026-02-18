const babelParser = require('@babel/parser');

function isAstLanguage(language) {
  return language === 'javascript' || language === 'typescript';
}

function extractAstData(content, language) {
  try {
    const ast = babelParser.parse(content, {
      sourceType: 'unambiguous',
      errorRecovery: true,
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
      plugins: getAstPlugins(language)
    });

    const imports = new Set();
    const functions = new Set();
    const classes = new Set();
    const exports = new Set();
    const interfaces = new Set();

    walkAst(ast, (node) => {
      switch (node.type) {
      case 'ImportDeclaration':
        addImportSource(node, imports, { ignoreTypeOnly: true });
        break;
      case 'ExportAllDeclaration':
        addImportSource(node, imports);
        exports.add('*');
        break;
      case 'ExportNamedDeclaration':
        addImportSource(node, imports, { ignoreTypeOnly: true });
        if (node.declaration) {
          collectDeclarationNames(node.declaration, {
            functions,
            classes,
            interfaces,
            exports
          });
        }
        if (Array.isArray(node.specifiers)) {
          node.specifiers.forEach((specifier) => {
            const exportedName = getIdentifierName(specifier.exported || specifier.local);
            if (exportedName) {
              exports.add(exportedName);
            }
          });
        }
        break;
      case 'ExportDefaultDeclaration':
        exports.add('default');
        if (node.declaration) {
          collectDeclarationNames(node.declaration, {
            functions,
            classes,
            interfaces
          });
        }
        break;
      case 'TSExportAssignment':
        getExportNamesFromValue(node.expression).forEach(name => exports.add(name));
        break;
      case 'CallExpression':
        addRequireImport(node, imports);
        break;
      case 'AssignmentExpression':
        addCommonJsExports(node, exports);
        break;
      case 'FunctionDeclaration':
        if (node.id && node.id.name) {
          functions.add(node.id.name);
        }
        break;
      case 'VariableDeclarator':
        addFunctionFromVariableDeclarator(node, functions);
        break;
      case 'ClassDeclaration':
        if (node.id && node.id.name) {
          classes.add(node.id.name);
        }
        break;
      case 'TSInterfaceDeclaration':
        if (node.id && node.id.name) {
          interfaces.add(node.id.name);
        }
        break;
      default:
        break;
      }
    });

    return {
      imports: Array.from(imports),
      functions: Array.from(functions),
      classes: Array.from(classes),
      exports: Array.from(exports),
      interfaces: Array.from(interfaces),
      structs: []
    };
  } catch (_error) {
    return null;
  }
}

function getAstPlugins(language) {
  const plugins = [
    'jsx',
    'classProperties',
    'classPrivateProperties',
    'classPrivateMethods',
    'dynamicImport',
    'optionalChaining',
    'nullishCoalescingOperator',
    'topLevelAwait'
  ];

  if (language === 'typescript') {
    plugins.push('typescript');
  }

  return plugins;
}

function walkAst(rootNode, visitor) {
  const stack = [rootNode];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;
    if (typeof current.type !== 'string') continue;

    visitor(current);

    Object.values(current).forEach((value) => {
      if (!value) return;

      if (Array.isArray(value)) {
        for (let i = value.length - 1; i >= 0; i--) {
          const child = value[i];
          if (child && typeof child.type === 'string') {
            stack.push(child);
          }
        }
        return;
      }

      if (typeof value === 'object' && typeof value.type === 'string') {
        stack.push(value);
      }
    });
  }
}

function addImportSource(node, imports, options = {}) {
  if (options.ignoreTypeOnly && node.importKind === 'type') {
    return;
  }

  if (node.source && typeof node.source.value === 'string') {
    imports.add(node.source.value);
  }
}

function addRequireImport(node, imports) {
  if (node.callee && node.callee.type === 'Import') {
    const [firstArg] = node.arguments || [];
    if (firstArg && firstArg.type === 'StringLiteral') {
      imports.add(firstArg.value);
    }
    return;
  }

  if (!node.callee || node.callee.type !== 'Identifier' || node.callee.name !== 'require') {
    return;
  }

  if (!Array.isArray(node.arguments) || node.arguments.length === 0) {
    return;
  }

  const [firstArg] = node.arguments;
  if (firstArg && firstArg.type === 'StringLiteral') {
    imports.add(firstArg.value);
  }
}

function addCommonJsExports(node, exportsSet) {
  if (!node.left || node.left.type !== 'MemberExpression') {
    return;
  }

  const leftPath = getMemberExpressionPath(node.left);
  if (!leftPath) {
    return;
  }

  if (leftPath === 'module.exports') {
    getExportNamesFromValue(node.right).forEach(name => exportsSet.add(name));
    return;
  }

  if (leftPath.startsWith('exports.')) {
    const exportName = leftPath.slice('exports.'.length).split('.')[0];
    if (exportName) {
      exportsSet.add(exportName);
    }
    return;
  }

  if (leftPath.startsWith('module.exports.')) {
    const exportName = leftPath.slice('module.exports.'.length).split('.')[0];
    if (exportName) {
      exportsSet.add(exportName);
    }
  }
}

function getMemberExpressionPath(node) {
  if (!node || node.type !== 'MemberExpression') {
    return null;
  }

  const objectPath = node.object.type === 'Identifier'
    ? node.object.name
    : getMemberExpressionPath(node.object);
  const propertyName = getMemberPropertyName(node);

  if (!objectPath || !propertyName) {
    return null;
  }

  return `${objectPath}.${propertyName}`;
}

function getMemberPropertyName(node) {
  const property = node.property;
  if (!property) return null;

  if (!node.computed && property.type === 'Identifier') {
    return property.name;
  }

  if (property.type === 'StringLiteral' || property.type === 'NumericLiteral') {
    return String(property.value);
  }

  return null;
}

function getExportNamesFromValue(node) {
  if (!node) return [];

  if (node.type === 'Identifier') {
    return [node.name];
  }

  if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
    return [node.id && node.id.name ? node.id.name : 'default'];
  }

  if (node.type === 'ClassExpression' || node.type === 'ClassDeclaration') {
    return [node.id && node.id.name ? node.id.name : 'default'];
  }

  if (node.type === 'FunctionDeclaration') {
    return [node.id && node.id.name ? node.id.name : 'default'];
  }

  if (node.type === 'ObjectExpression') {
    const names = [];

    node.properties.forEach((property) => {
      if (property.type !== 'ObjectProperty' && property.type !== 'ObjectMethod') {
        return;
      }

      const propertyName = getIdentifierName(property.key);
      if (propertyName) {
        names.push(propertyName);
      }
    });

    return names.length > 0 ? names : ['default'];
  }

  return ['default'];
}

function collectDeclarationNames(node, collections) {
  if (!node) return;

  const { functions, classes, interfaces, exports } = collections;

  if (node.type === 'FunctionDeclaration' && node.id && node.id.name) {
    functions.add(node.id.name);
    if (exports) exports.add(node.id.name);
    return;
  }

  if (node.type === 'ClassDeclaration' && node.id && node.id.name) {
    classes.add(node.id.name);
    if (exports) exports.add(node.id.name);
    return;
  }

  if (node.type === 'VariableDeclaration' && Array.isArray(node.declarations)) {
    node.declarations.forEach((declaration) => {
      const variableName = getIdentifierName(declaration.id);
      if (!variableName) return;

      if (exports) exports.add(variableName);
      addFunctionFromVariableDeclarator(declaration, functions);
    });
    return;
  }

  if (node.type === 'TSInterfaceDeclaration' && node.id && node.id.name) {
    interfaces.add(node.id.name);
    if (exports) exports.add(node.id.name);
    return;
  }

  if (node.type === 'TSTypeAliasDeclaration' && node.id && node.id.name) {
    if (exports) exports.add(node.id.name);
  }
}

function addFunctionFromVariableDeclarator(node, functionsSet) {
  if (!node || !node.id || node.id.type !== 'Identifier' || !node.init) {
    return;
  }

  if (node.init.type === 'FunctionExpression' || node.init.type === 'ArrowFunctionExpression') {
    functionsSet.add(node.id.name);
  }
}

function getIdentifierName(node) {
  if (!node) return null;

  if (node.type === 'Identifier') {
    return node.name;
  }

  if (node.type === 'StringLiteral' || node.type === 'NumericLiteral') {
    return String(node.value);
  }

  return null;
}

module.exports = {
  isAstLanguage,
  extractAstData
};
