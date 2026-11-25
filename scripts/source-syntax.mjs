import { dirname, join } from 'node:path/posix';
import ts from '../packages/agent/node_modules/typescript/lib/typescript.js';

const agentPrefix = 'packages/agent/';
const desktopUi = 'apps/desktop/ui/';
const sharedDesktopModules = new Set(['defaults', 'protocol', 'wire', 'wire-values']);
const networkGlobals = new Set(['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']);
const networkModules = new Set(['http', 'https', 'net', 'tls', 'dgram', 'websocket']);
const mutation = new Set(['push', 'pop', 'splice', 'sort', 'reverse', 'fill', 'copyWithin', 'shift', 'unshift']);
const lintDirective = /(?:^|[\s*])(?:@ts-(?:ignore|expect-error|nocheck)\b|eslint-disable\b|biome-ignore\b|tslint:disable\b|prettier-ignore\b|noqa\b|type:\s*ignore\b|shellcheck\s+disable\b)/;

function modulePath(node) {
  let specifier;
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) specifier = node.moduleSpecifier;
  else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) specifier = node.argument.literal;
  else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
    ts.isIdentifier(node.expression) && node.expression.text === 'require')) specifier = node.arguments[0];
  return specifier && ts.isStringLiteralLike(specifier) ? specifier.text : undefined;
}

function relativeModule(node, file) {
  const specifier = modulePath(node);
  return specifier?.startsWith('.') ? join(dirname(file), specifier).replace(/\.(?:[cm]?ts|tsx|[cm]?js)$/, '') : undefined;
}

function importsBinding(node, names, checkNamespace = false) {
  if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) return checkNamespace;
  const named = ts.isImportDeclaration(node) ? node.importClause?.namedBindings : node.exportClause;
  if (named && (ts.isNamedImports(named) || ts.isNamedExports(named))) {
    return named.elements.some(binding => names.includes((binding.propertyName ?? binding.name).text));
  }
  return checkNamespace && (named !== undefined || ts.isExportDeclaration(node));
}

function isTypeOnly(node) {
  if (ts.isImportTypeNode(node)) return true;
  if (!ts.isImportDeclaration(node) || !node.importClause) return false;
  const { isTypeOnly, name, namedBindings } = node.importClause;
  return isTypeOnly || (!name && namedBindings && ts.isNamedImports(namedBindings) &&
    namedBindings.elements.length > 0 && namedBindings.elements.every(binding => binding.isTypeOnly));
}

function property(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) return node.argumentExpression.text;
  return undefined;
}

function displayModule(node, file) {
  const specifier = modulePath(node);
  if (!specifier) return false;
  if (specifier === 'deepbot/native') return file !== 'apps/desktop/App.tsx';
  if (/^(?:node:|@deepbot\/agent(?:\/|$))/.test(specifier)) return true;
  const path = relativeModule(node, file);
  return path?.startsWith(agentPrefix) && !(
    path.startsWith(agentPrefix + 'src/') && sharedDesktopModules.has(path.slice((agentPrefix + 'src/').length))
  );
}

function desktopImport(node, file) {
  const target = relativeModule(node, file);
  if (!target?.startsWith(desktopUi)) return false;
  const [layer, feature] = file.slice(desktopUi.length).split('/');
  const [targetLayer, targetFeature] = target.slice(desktopUi.length).split('/');
  if (layer === 'components') return targetLayer === 'features' || targetLayer === 'services';
  return layer === 'features' && targetLayer === 'features' && targetFeature !== feature;
}

function desktopNetwork(node) {
  if (networkModules.has(modulePath(node))) return true;
  const target = ts.isCallExpression(node) || ts.isNewExpression(node) ? node.expression :
    ts.isVariableDeclaration(node) ? node.initializer : undefined;
  return target && networkGlobals.has(ts.isIdentifier(target) ? target.text : property(target));
}

function component(node) {
  if (ts.isFunctionDeclaration(node) && node.name) return /^[A-Z]/.test(node.name.text);
  if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) return false;
  const declaration = node.parent;
  return ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name) && /^[A-Z]/.test(declaration.name.text);
}

function destructuredComponentProps(node) {
  if (!ts.isParameter(node) && !ts.isVariableDeclaration(node)) return false;
  if (ts.isIdentifier(node.name)) return false;
  if (ts.isParameter(node)) return node.parent.parameters[0] === node && component(node.parent);
  let owner = node.parent;
  while (owner && !ts.isFunctionLike(owner)) owner = owner.parent;
  if (!owner || !component(owner)) return false;
  const props = owner.parameters[0]?.name;
  let value = node.initializer;
  while (value && (ts.isPropertyAccessExpression(value) || ts.isElementAccessExpression(value) ||
    ts.isParenthesizedExpression(value))) value = value.expression;
  return props && ts.isIdentifier(props) && value && ts.isIdentifier(value) && value.text === props.text;
}

function libraryCollection(node) {
  if (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) return false;
  const name = property(node);
  return (name === 'memories' || name === 'routines') && property(node.expression) === 'data' ||
    libraryCollection(node.expression);
}

function libraryWrite(node) {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
     node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return libraryCollection(node.left);
  if (ts.isDeleteExpression(node)) return libraryCollection(node.expression);
  if (ts.isCallExpression(node) && (ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression))) {
    return mutation.has(property(node.expression)) && libraryCollection(node.expression.expression);
  }
  return false;
}

const assertions = node => ts.isAsExpression(node) || ts.isTypeAssertionExpression(node);
const matchers = {
  'nsh-base-button': node => modulePath(node) === 'nsh/base' && importsBinding(node, ['Button'], true),
  'ts-explicit-any': node => node.kind === ts.SyntaxKind.AnyKeyword || node.kind === ts.SyntaxKind.JSDocAllType,
  'ts-never-cast': node => assertions(node) && node.type.kind === ts.SyntaxKind.NeverKeyword,
  'protocol-cast': node => assertions(node) && ts.isTypeReferenceNode(node.type) &&
    ts.isIdentifier(node.type.typeName) && ['HostMessage', 'AgentMessage'].includes(node.type.typeName.text),
  'desktop-agent-modules': displayModule,
  'desktop-wire-transport': (node, file) => relativeModule(node, file) === desktopUi + 'services/agent',
  'desktop-network': desktopNetwork,
  'desktop-ui-imports': desktopImport,
  'desktop-base-controls': node => modulePath(node) === 'nsh/base' && !isTypeOnly(node) &&
    importsBinding(node, ['Select', 'Dialog', 'Switch', 'Input', 'Tabs'], true),
  'nsh-component-props': destructuredComponentProps,
  'desktop-local-json': node => modulePath(node) === 'nsh' && importsBinding(node, ['Storage'], true),
  'agent-private-storage': node => {
    const specifier = modulePath(node);
    return /^(?:node:sqlite|sqlite3?|better-sqlite3)$/.test(specifier ?? '') ||
      /^@earendil-works\/pi-durable\/storage(?:\/|$)/.test(specifier ?? '');
  },
  'agent-private-ledger': (node, file) => {
    const target = relativeModule(node, file);
    return target === agentPrefix + 'src/storage/session' ||
      target === agentPrefix + 'src/work/ledger' && importsBinding(node, ['LedgerDoc'], true);
  },
  'agent-entrypoint-ledger': node => ['ledger', 'harness'].includes(property(node)),
  'agent-http': node => ts.isCallExpression(node) && (ts.isIdentifier(node.expression)
    ? node.expression.text === 'fetch' : property(node.expression) === 'fetch'),
  'connector-child-process': node => /^(?:node:)?child_process$/.test(modulePath(node) ?? '') && !isTypeOnly(node),
  'connector-config-write': node => /^(?:node:)?fs(?:\/promises)?$/.test(modulePath(node) ?? '') &&
    importsBinding(node, ['writeFile', 'writeFileSync', 'open', 'openSync', 'createWriteStream'], true),
  'bot-library-write': libraryWrite,
  'verify-model-snapshot': node => ts.isStringLiteralLike(node) && /(?:^|\/)(?:models|connectors)\.json$/.test(node.text),
};

function commentPositions(source) {
  const result = new Set();
  function add(range) {
    const content = source.text.slice(range.pos + 2, range.end);
    if (lintDirective.test(content)) result.add(range.pos);
  }
  function collect(node) {
    for (const range of ts.getLeadingCommentRanges(source.text, node.pos) ?? []) add(range);
    for (const range of ts.getTrailingCommentRanges(source.text, node.end) ?? []) add(range);
    if (!ts.isJSDoc(node)) for (const child of node.getChildren(source)) collect(child);
  }
  collect(source);
  return [...result].sort((a, b) => a - b);
}

export function createSyntaxScanner() {
  const files = new Map();
  return (check, file, text) => {
    if (!files.has(file)) files.set(file, ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true));
    const source = files.get(file);
    if (check === 'lint-suppression') return commentPositions(source);
    const match = matchers[check];
    if (!match) throw new Error(`未知源码检查：${check}`);
    const positions = [];
    function visit(node) {
      if (match(node, file)) positions.push(node.getStart(source));
      for (const doc of node.jsDoc ?? []) visit(doc);
      ts.forEachChild(node, visit);
    }
    visit(source);
    return positions;
  };
}
