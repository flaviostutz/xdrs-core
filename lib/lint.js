#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const TYPE_TO_ID = {
  adrs: 'adr-policy',
  bdrs: 'bdr-policy',
  edrs: 'edr-policy'
};

const ALLOWED_SUBJECTS = {
  adrs: new Set(['principles', 'application', 'data', 'platform', 'operations', 'governance']),
  bdrs: new Set(['principles', 'product', 'operations', 'governance', 'finance']),
  edrs: new Set(['principles', 'application', 'data', 'platform', 'operations', 'governance'])
};

const TYPE_NAMES = new Set(Object.keys(TYPE_TO_ID));
const RESERVED_SCOPES = new Set(['_core', '_local']);
const NUMBERED_FILE_RE = /^(\d{3,})-([a-z0-9-]+)\.md$/;
// Skill package folders are not auto-numbered (see _core-adr-policy-003): plain lowercase
// kebab-case; digits are allowed anywhere in the name, including as a prefix.
const SKILL_DIR_RE = /^[a-z0-9-]+$/;
const REQUIRED_ROOT_INDEX_TEXT = 'XDRS scopes listed last override the ones listed first';
// Activation tags and legend per _core-adr-policy-022 rules 03 and 09
const ACTIVATION_TAGS = new Set(['extends-only', 'disabled']);
const ACTIVATION_LEGEND_TEXT = 'Scopes tagged `disabled` MUST be ignored; `extends-only` scopes apply only via extends (see _core-adr-policy-022)';
const SUBJECT_ARTIFACT_DIRS = new Set(['skills', 'articles', 'researches', 'initiatives']);
const RESOURCE_DIR_NAME = '.assets';
const SOURCE_SNAPSHOT_DIR_NAME = 'sources';
const SOURCE_TRACKING_FILE_NAME = 'source.md';
const SKILL_PACKAGE_OPTIONAL_DIRS = new Set(['scripts', 'references', RESOURCE_DIR_NAME, 'dist']);

const POLICY_ALLOWED_FRONTMATTER_KEYS = new Set(['name', 'description', 'apply-to', 'valid-from', 'license', 'metadata', 'freeze-reference']);
const SKILL_ALLOWED_FRONTMATTER_KEYS = new Set(['name', 'description', 'license', 'metadata']);
const SCOPE_INDEX_ALLOWED_FRONTMATTER_KEYS = new Set(['scope-type', 'name', 'description', 'apply-to', 'valid-from', 'license', 'metadata', 'follows', 'extends', 'extends-only']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp']);
const SLIDE_FILE_RE = /^.+-slides(?:-[a-z0-9-]+)?\.md$/;
const SLIDE_MAX_NAME_LENGTH = 64;
const EMOJI_RE = /\p{Extended_Pictographic}/u;
const POLICY_MAX_WORDS = 2600;
const ARTICLE_MAX_WORDS = 8000;
const RESEARCH_MAX_WORDS = 5000;
const SKILL_MAX_WORDS = 7000;
const REFERENCE_MAX_WORDS = 4000;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const SKILL_OPTIONAL_RUNTIME_SECTION = '### Runtime Requirements';
const SKILL_OPTIONAL_USER_INTERACTION_SECTION = '### User Interaction';
const SKILL_ANTI_PATTERNS_MIN_ENTRIES = 3;
const SKILL_BUNDLING_MAKEFILE_TARGETS = ['build', 'test', 'clean'];
const SCRIPT_HEADER_RE = /^(#!|#|\/\/|\/\*|<!--|--|;)/;

// Subject number block ranges per _core-adr-policy-017
const SUBJECT_NUMBER_RANGES = {
  principles:  [1, 100],
  application: [101, 200],
  data:        [201, 300],
  platform:    [301, 400],
  operations:  [401, 500],
  governance:  [501, 600],
  product:     [601, 700],
  finance:     [701, 800],
};
const RESERVED_NUMBER_RANGE_MIN = 801;
const RESERVED_NUMBER_RANGE_MAX = 900;
const OVERFLOW_RANGE_MIN = 901;

const NORMATIVE_KEYWORDS_RE = /\bMUST NOT\b|\bMUST\b|\bSHOULD NOT\b|\bSHOULD\b|\bMAY\b|\bREQUIRED\b|\bOPTIONAL\b/;
const NORMATIVE_EMPHASIS_RE = /(\*{1,2}|_{1,2})(MUST NOT|SHOULD NOT|MUST|SHOULD|MAY|REQUIRED|OPTIONAL|always|never|mandatory|recommended|advised|preferably|possibly|optionally)(\*{1,2}|_{1,2})/i;

const RESEARCH_SECTION_LIMITS = {
  '## Abstract': 200,
  '## Introduction': 700,
  '## Methods': 1200,
  '## Results': 1800,
  '## Discussion': 1000,
  '## Conclusion': 400,
};

const DOC_TYPE_POLICY_REF = {
  Policy: '[_core-adr-policy-002]',
  Skill: '[_core-adr-policy-003]',
  Article: '[_core-adr-policy-004]',
  Research: '[_core-adr-policy-006]',
  Initiative: '[_core-adr-policy-007]',
  Slide: '[_core-adr-policy-009]',
  Reference: '[_core-adr-policy-003]',
};

function runLintCli(args) {
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return 0;
  }

  const all = args.includes('--all');
  const pathArgs = args.filter((a) => !a.startsWith('--'));
  const targetPath = pathArgs[0] || '.';
  const result = lintWorkspace(targetPath, { ignoreExternal: !all });

  if (result.warnings.length > 0) {
    for (const warning of result.warnings) {
      console.warn(`- [warning] ${warning}`);
    }
  }

  for (const [scopeName, causes] of result.readOnlyScopes) {
    for (const cause of causes) {
      console.log(`- READ-ONLY scope "${scopeName}": ${cause}; no changes must be made to this scope [_core-adr-policy-022.06-read-only-dependencies]`);
    }
  }

  if (result.errors.length === 0) {
    console.log(`Lint passed for ${toDisplayPath(result.xdrsRoot)}`);
    return 0;
  }

  console.error(`Lint failed for ${toDisplayPath(result.xdrsRoot)}`);
  for (const error of result.errors) {
    console.error(`- ${error}`);
  }

  return 1;
}

function printHelp() {
  console.log('Usage: xdrs-core lint [options] [path]\n');
  console.log('Lint the XDRS tree rooted at [path] when [path] contains an index.md, or at [path]/.xdrs by default.');
  console.log('\nOptions:');
  console.log('  --all    Check all files, including files from external scopes distributed via .filedist.lock (default: skip external scopes)');
  console.log('\nAll other commands continue to be delegated to the bundled filedist CLI.');
}

function resolveXdrsRoot(resolvedTarget) {
  // If the path itself contains an index.md, treat it as the XDRS root directly.
  // This allows any folder name to serve as the root, not only ".xdrs".
  if (existsFile(path.join(resolvedTarget, 'index.md'))) {
    return resolvedTarget;
  }
  // Default: look for a ".xdrs" subdirectory
  return path.join(resolvedTarget, '.xdrs');
}

function lintWorkspace(targetPath, options = {}) {
  const { ignoreExternal = true } = options;
  const resolvedTarget = path.resolve(targetPath);
  const xdrsRoot = resolveXdrsRoot(resolvedTarget);
  const errors = [];
  const warnings = [];
  const readOnlyScopes = new Map(); // scopeName -> [cause, ...] per _core-adr-policy-022.06

  if (!existsDirectory(xdrsRoot)) {
    errors.push(`Missing XDRS root directory: ${toDisplayPath(xdrsRoot)} [_core-adr-policy-001]`);
    return { xdrsRoot, errors, warnings, readOnlyScopes };
  }

  const repoRoot = path.dirname(xdrsRoot);
  const filedistPaths = loadFiledist(repoRoot);
  const externalScopes = getExternalScopes(filedistPaths, xdrsRoot);
  const effectiveExternalScopes = ignoreExternal ? externalScopes : new Set();

  const actualTypeIndexes = [];
  const rootEntries = safeReadDir(xdrsRoot, errors, 'read XDRS root directory');
  const scopeEntries = rootEntries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'));

  const rootIndexPath = path.join(xdrsRoot, 'index.md');
  const activation = existsFile(rootIndexPath) ? parseRootIndexActivation(rootIndexPath, xdrsRoot, errors) : new Map();

  // Pass 1: collect known scope-type names from NNN-{scope-type}-scope-type.md files in any scope,
  // plus the follows:/extends:/extends-only fields of every scope index (including external scopes)
  const scopeMeta = new Map(); // scopeName -> readScopeMeta() result (null when index.md is missing)
  const scopeTypeDefiningScopes = new Map(); // scopeTypeName -> Set(scopeName)
  const knownScopeTypes = new Map(); // scopeTypeName -> filePath (first primary found, for downstream validation)
  const scopeTypePrimaryKeys = new Set(); // "scopeName|typeName|scopeTypeName" for companion co-location checks
  const scopeTypePrimaryByScope = new Map(); // "scopeName|scopeTypeName" -> [typeName, ...] for duplicate detection
  const scopeTypeCompanions = []; // [{scopeTypeName, scopeName, typeName, filePath}]
  for (const scopeEntry of scopeEntries) {
    const scopeName = scopeEntry.name;
    const scopePath = path.join(xdrsRoot, scopeName);
    scopeMeta.set(scopeName, readScopeMeta(path.join(scopePath, 'index.md')));
    for (const typeName of Object.keys(TYPE_TO_ID)) {
      const principlesDir = path.join(scopePath, typeName, 'principles');
      if (!existsDirectory(principlesDir)) continue;
      let principlesEntries;
      try { principlesEntries = fs.readdirSync(principlesDir, { withFileTypes: true }); } catch { continue; }
      for (const entry of principlesEntries) {
        if (!entry.isFile()) continue;
        const m = entry.name.match(NUMBERED_FILE_RE);
        if (!m) continue;
        const shortTitle = m[2];
        const filePath = path.join(principlesDir, entry.name);
        if (shortTitle.endsWith('-scope-type')) {
          // Primary scope-type definition file
          const rawScopeTypeName = shortTitle.slice(0, -'-scope-type'.length);
          // Special-case: 'local' maps to '_local' (underscore not allowed in NUMBERED_FILE_RE)
          const scopeTypeName = rawScopeTypeName === 'local' ? '_local' : rawScopeTypeName;
          if (!knownScopeTypes.has(scopeTypeName)) {
            knownScopeTypes.set(scopeTypeName, filePath);
          }
          if (!scopeTypeDefiningScopes.has(scopeTypeName)) {
            scopeTypeDefiningScopes.set(scopeTypeName, new Set());
          }
          scopeTypeDefiningScopes.get(scopeTypeName).add(scopeName);
          scopeTypePrimaryKeys.add(`${scopeName}|${typeName}|${scopeTypeName}`);
          const scopeKey = `${scopeName}|${scopeTypeName}`;
          if (!scopeTypePrimaryByScope.has(scopeKey)) {
            scopeTypePrimaryByScope.set(scopeKey, []);
          }
          scopeTypePrimaryByScope.get(scopeKey).push(typeName);
          validateStructuredFormat(filePath, errors, '_core-adr-policy-010.11-def-scope-type-must-be-structured');
        } else {
          // Check if it's a companion file: title contains '-scope-type-' followed by a qualifier
          const stIdx = shortTitle.indexOf('-scope-type-');
          if (stIdx > 0) {
            const rawScopeTypeName = shortTitle.slice(0, stIdx);
            // Special-case: 'local' maps to '_local'
            const scopeTypeName = rawScopeTypeName === 'local' ? '_local' : rawScopeTypeName;
            scopeTypeCompanions.push({ scopeTypeName, scopeName, typeName, filePath });
            validateStructuredFormat(filePath, errors, '_core-adr-policy-010.11-def-scope-type-must-be-structured');
          }
        }
      }
    }
  }

  // Validate: no duplicate primaries across type folders in the same scope
  for (const [scopeKey, typeNames] of scopeTypePrimaryByScope) {
    if (typeNames.length > 1) {
      const pipeIdx = scopeKey.indexOf('|');
      const sName = scopeKey.slice(0, pipeIdx);
      const stName = scopeKey.slice(pipeIdx + 1);
      errors.push(`Scope type "${stName}" has primary definitions in multiple type folders [${typeNames.join(', ')}] in scope "${sName}": only one primary is allowed per scope [_core-adr-policy-010.02-def-naming]`);
    }
  }

  // Validate: each companion must have a corresponding primary in the same scope and type folder
  for (const { scopeTypeName, scopeName, typeName, filePath } of scopeTypeCompanions) {
    if (!scopeTypePrimaryKeys.has(`${scopeName}|${typeName}|${scopeTypeName}`)) {
      errors.push(`Companion scope-type file has no corresponding primary "${scopeTypeName}-scope-type" policy in the same scope "${scopeName}" and type folder "${typeName}": ${toDisplayPath(filePath)} [_core-adr-policy-010.03-def-companion-files]`);
    }
  }

  for (const entry of rootEntries) {
    if (entry.isFile() && entry.name !== 'index.md') {
      errors.push(`Unexpected file at .xdrs root: ${entry.name} [_core-adr-policy-001]`);
    }
  }

  collectReadOnlyScopes(scopeMeta, activation, externalScopes, knownScopeTypes, scopeTypeDefiningScopes, readOnlyScopes);

  // Populated during lintScopeIndexFrontmatter: scopeName -> [extendedScopeNames...]
  const extendsRelationships = new Map();

  for (const scopeEntry of scopeEntries) {
    lintScopeDirectory(xdrsRoot, scopeEntry.name, errors, warnings, actualTypeIndexes, ignoreExternal, effectiveExternalScopes, knownScopeTypes, extendsRelationships, externalScopes);
  }

  // Detect cycles in extends: chains (DFS)
  const visitedCycle = new Set();
  const inStackCycle = new Set();
  const detectExtendsCycles = (scope, stack) => {
    if (inStackCycle.has(scope)) {
      const cycleStart = stack.indexOf(scope);
      const cycle = stack.slice(cycleStart).concat(scope).join(' -> ');
      errors.push(`Circular extends chain detected: ${cycle} [_core-adr-policy-010.31-extends-no-cycle]`);
      return;
    }
    if (visitedCycle.has(scope)) return;
    visitedCycle.add(scope);
    inStackCycle.add(scope);
    stack.push(scope);
    for (const target of (extendsRelationships.get(scope) || [])) {
      detectExtendsCycles(target, stack);
    }
    stack.pop();
    inStackCycle.delete(scope);
  };
  for (const scope of extendsRelationships.keys()) {
    detectExtendsCycles(scope, []);
  }

  if (!existsFile(rootIndexPath)) {
    errors.push('Missing required root index: .xdrs/index.md [_core-adr-policy-001]');
  } else {
    lintRootIndex(rootIndexPath, xdrsRoot, errors, warnings, effectiveExternalScopes, { activation, scopeMeta, knownScopeTypes });
  }

  return { xdrsRoot, errors, warnings, readOnlyScopes };
}

function lintRootIndex(rootIndexPath, xdrsRoot, errors, warnings, externalScopes, ctx) {
  const content = fs.readFileSync(rootIndexPath, 'utf8');
  const repoRoot = path.dirname(xdrsRoot);

  if (!content.includes(REQUIRED_ROOT_INDEX_TEXT)) {
    errors.push(`Root index is missing required override text: ${toDisplayPath(rootIndexPath)} [_core-adr-policy-001]`);
  }

  const links = parseLocalLinks(content, path.dirname(rootIndexPath), repoRoot);
  for (const linkPath of links) {
    if (!fs.existsSync(linkPath)) {
      if (isExternalScopeLink(linkPath, xdrsRoot, externalScopes)) continue;
      errors.push(`Broken link in root index: ${displayPath(rootIndexPath, linkPath)} [_core-adr-policy-001]`);
    }
    if (isCanonicalTypeIndex(linkPath, xdrsRoot)) {
      errors.push(`Root index must not link directly to type indexes: ${displayPath(rootIndexPath, linkPath)} [_core-adr-policy-001]`);
    }
  }

  const localScopePath = normalizePath(path.join(xdrsRoot, '_local'));

  for (const linkPath of links) {
    if (isPathInside(localScopePath, linkPath) || normalizePath(linkPath) === localScopePath) {
      errors.push(`Root index must not link into _local scope: ${displayPath(rootIndexPath, linkPath)} [_core-adr-policy-001]`);
    }
  }

  const { activation, scopeMeta, knownScopeTypes } = ctx;
  const display = toDisplayPath(rootIndexPath);
  const tagOf = (scopeName) => (activation.get(scopeName) || {}).tag || null;

  // Every scope folder with an index.md (including external scopes), except _local, is linked
  for (const [scopeName, meta] of scopeMeta) {
    if (!meta || scopeName === '_local') continue;
    const fieldTrue = meta.extendsOnly === 'true';
    const suggestedLine = `[View scope ${scopeName}](${scopeName}/index.md)${fieldTrue ? ' `extends-only`' : ''}`;
    const entry = activation.get(scopeName);
    if (!entry) {
      errors.push(`Root index is missing scope index link: ${toDisplayPath(path.join(xdrsRoot, scopeName, 'index.md'))}; add the line: ${suggestedLine} [_core-adr-policy-022.01-root-index-completeness]`);
      continue;
    }
    if (fieldTrue && !entry.tag) {
      errors.push(`Scope "${scopeName}" declares extends-only: true, so its root index link on line ${entry.line} must carry an activation tag; change it to: ${suggestedLine} (or tag it \`disabled\`): ${display} [_core-adr-policy-022.07-extends-only-field]`);
    }
    if (entry.tag === 'extends-only' && scopeName !== '_core' && isCoreTypeScope(meta.scopeTypes, knownScopeTypes)) {
      errors.push(`Core-type scope "${scopeName}" must not be tagged \`extends-only\` (line ${entry.line}): ${display} [_core-adr-policy-022.07-extends-only-field]`);
    }
  }

  const hasTags = [...activation.values()].some((entry) => entry.tag);
  if (hasTags && !content.includes(ACTIVATION_LEGEND_TEXT)) {
    errors.push(`Root index uses activation tags but is missing the legend line: ${ACTIVATION_LEGEND_TEXT}: ${display} [_core-adr-policy-022.09-root-index-ownership]`);
  }

  // extends-only scopes must be reached (transitively) through the extends: chain of an active scope
  const reached = new Set();
  const visit = (scopeName) => {
    for (const target of (scopeMeta.get(scopeName) || {}).extends || []) {
      if (reached.has(target) || !scopeMeta.get(target) || tagOf(target) === 'disabled') continue;
      reached.add(target);
      visit(target);
    }
  };
  for (const [scopeName, meta] of scopeMeta) {
    if (!meta) continue;
    if (scopeName === '_local' || (activation.has(scopeName) && !tagOf(scopeName))) {
      visit(scopeName);
    }
  }
  for (const [scopeName, entry] of activation) {
    if (entry.tag === 'extends-only' && !reached.has(scopeName)) {
      warnings.push(`Scope "${scopeName}" is tagged \`extends-only\` but no active scope extends it, so its policies never apply: ${display} [_core-adr-policy-022.04-extends-only]`);
    }
  }
}

// Parses root index scope links and their activation tags (_core-adr-policy-022 rules 01 and 03).
// Returns Map scopeName -> { tag, line }. Links inside fenced code blocks are ignored.
function parseRootIndexActivation(rootIndexPath, xdrsRoot, errors) {
  const activation = new Map();
  const content = fs.readFileSync(rootIndexPath, 'utf8');
  const repoRoot = path.dirname(xdrsRoot);
  const baseDir = path.dirname(rootIndexPath);
  const display = toDisplayPath(rootIndexPath);
  const lines = content.split(/\r?\n/);
  const ignoredLines = findIgnoredMarkdownLines(lines);

  for (let index = 0; index < lines.length; index += 1) {
    if (ignoredLines[index]) continue;
    const line = lines[index];
    const lineNumber = index + 1;
    const allowedTagOffsets = new Set();
    let hasScopeLink = false;

    for (const match of line.matchAll(/!?\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = normalizeLocalLinkTarget(match[1].trim());
      if (!target) continue;
      const linkPath = target.startsWith('/') ? path.join(repoRoot, target) : path.resolve(baseDir, target);
      if (!isScopeIndex(linkPath, xdrsRoot)) continue;
      hasScopeLink = true;
      const scopeName = relativeFrom(xdrsRoot, linkPath).split(path.sep)[0];
      const linkEnd = match.index + match[0].length;
      const tagMatch = line.slice(linkEnd).match(/^[ \t]*`([^`]*)`/);
      let tag = null;
      if (tagMatch && ACTIVATION_TAGS.has(tagMatch[1])) {
        tag = tagMatch[1];
        allowedTagOffsets.add(linkEnd + tagMatch[0].length - tagMatch[1].length - 2);
      }
      if (scopeName === '_local') continue; // reported by lintRootIndex
      if (tag && scopeName === '_core') {
        errors.push(`Scope "_core" must not carry an activation tag (line ${lineNumber}): ${display} [_core-adr-policy-022.03-activation-tag-syntax]`);
      }
      const existing = activation.get(scopeName);
      if (existing) {
        errors.push(`Root index links scope "${scopeName}" more than once (lines ${existing.line} and ${lineNumber}); keep a single link: ${display} [_core-adr-policy-022.01-root-index-completeness]`);
      } else {
        activation.set(scopeName, { tag, line: lineNumber });
      }
    }

    if (!hasScopeLink) continue;
    for (const span of line.matchAll(/`[^`]*`/g)) {
      if (!allowedTagOffsets.has(span.index)) {
        errors.push(`Root index line ${lineNumber} has invalid inline code ${span[0]}: a scope link line may only carry one activation tag (\`extends-only\` or \`disabled\`, lowercase) right after the link: ${display} [_core-adr-policy-022.03-activation-tag-syntax]`);
      }
    }
  }

  return activation;
}

// Reads the fields of a scope index needed before per-scope lint runs (including external scopes).
// Returns null when the scope has no readable index.md.
function readScopeMeta(scopeIndexPath) {
  if (!existsFile(scopeIndexPath)) return null;
  let content;
  try { content = fs.readFileSync(scopeIndexPath, 'utf8'); } catch { return null; }
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const block = fmMatch ? fmMatch[1] : '';
  const listField = (key) => {
    const lineMatch = block.match(new RegExp(`^${key}:[ \\t]*(.*)`, 'm'));
    return lineMatch ? deriveScopeNameListEntries(block, lineMatch, lineMatch[1].trim()) : [];
  };
  const scopeTypeMatch = block.match(/^scope-type:[ \t]*(.+)$/m);
  const extendsOnlyMatch = block.match(/^extends-only:[ \t]*(.*)$/m);
  return {
    hasFrontmatter: Boolean(fmMatch),
    scopeTypes: scopeTypeMatch ? parseScopeTypeField(scopeTypeMatch[1].trim()) : [],
    follows: listField('follows'),
    extends: listField('extends'),
    extendsOnly: extendsOnlyMatch ? extendsOnlyMatch[1].trim() : null,
  };
}

// Computes read-only scopes and their causes per _core-adr-policy-022.06. Missing dependencies of
// local scopes are reported as lint errors elsewhere; here they only make external scopes read-only.
function collectReadOnlyScopes(scopeMeta, activation, externalScopes, knownScopeTypes, scopeTypeDefiningScopes, readOnlyScopes) {
  const isDisabled = (scopeName) => (activation.get(scopeName) || {}).tag === 'disabled';
  for (const [scopeName, meta] of scopeMeta) {
    if (!meta) continue;
    const isExternal = externalScopes.has(scopeName);
    const causes = [];
    if (isExternal && !meta.hasFrontmatter) {
      causes.push('its scope index has no frontmatter; fix it in the source package');
    }
    if (isExternal && meta.extendsOnly !== null && meta.extendsOnly !== 'true' && meta.extendsOnly !== 'false') {
      causes.push(`its scope index has an invalid extends-only value "${meta.extendsOnly}" (treated as absent); fix it in the source package`);
    }
    if (isExternal && meta.hasFrontmatter && meta.scopeTypes.length === 0) {
      causes.push('its scope index has no scope-type; fix it in the source package');
    }
    for (const [field, targets] of [['follows', meta.follows], ['extends', meta.extends]]) {
      for (const target of targets) {
        if (target === scopeName || RESERVED_SCOPES.has(target)) continue;
        const targetMeta = scopeMeta.get(target);
        if (!targetMeta) {
          if (isExternal) causes.push(`${field}: scope "${target}" is not present in this workspace; install it`);
        } else if (isDisabled(target)) {
          causes.push(`${field}: scope "${target}" is tagged \`disabled\` in the root index; enable it or remove the ${field}: reference`);
        } else if (!targetMeta.hasFrontmatter) {
          causes.push(`${field}: scope "${target}" has an invalid scope index; fix it`);
        }
      }
    }
    for (const scopeType of resolveScopeTypeChain(meta.scopeTypes, knownScopeTypes)) {
      if (scopeType === '_local') continue;
      if (!knownScopeTypes.has(scopeType)) {
        if (isExternal) causes.push(`scope type "${scopeType}" has no ${scopeType}-scope-type policy in this workspace; install the scope that defines it`);
        continue;
      }
      const definers = [...scopeTypeDefiningScopes.get(scopeType)].filter((s) => s !== scopeName);
      if (definers.length > 0 && definers.every(isDisabled)) {
        causes.push(`scope type "${scopeType}" is defined only in disabled scope(s) ${definers.map((s) => `"${s}"`).join(', ')}; enable one of them`);
      }
    }
    if (causes.length > 0) {
      readOnlyScopes.set(scopeName, causes);
    }
  }
}

// Parses a scope-type value in either "a, b" or "[a, b]" form into its elements.
function parseScopeTypeField(raw) {
  const inner = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw;
  return inner.split(',').map((s) => s.trim()).filter(Boolean);
}

// Resolves the flat scope-type chain (declared types plus all parent types, deduplicated) using
// _core-adr-policy-010.09 parent declarations. Types without a known policy end their chain.
function resolveScopeTypeChain(scopeTypes, knownScopeTypes) {
  const chain = [];
  const seen = new Set();
  for (const scopeType of scopeTypes) {
    let current = scopeType;
    while (current && !seen.has(current)) {
      seen.add(current);
      chain.push(current);
      const policyPath = knownScopeTypes.get(current);
      current = policyPath ? extractParentScopeType(policyPath) : null;
    }
  }
  return chain;
}

function isCoreTypeScope(scopeTypes, knownScopeTypes) {
  return resolveScopeTypeChain(scopeTypes, knownScopeTypes).includes('core');
}

function lintScopeIndex(scopeIndexPath, xdrsRoot, scopeName, typeIndexesInScope, errors, externalScopes = new Set()) {
  const content = fs.readFileSync(scopeIndexPath, 'utf8');
  const repoRoot = path.dirname(xdrsRoot);
  const links = parseLocalLinks(content, path.dirname(scopeIndexPath), repoRoot);
  const linkedSet = new Set(links.map(normalizePath));

  for (const linkPath of links) {
    if (!fs.existsSync(linkPath)) {
      if (isExternalScopeLink(linkPath, xdrsRoot, externalScopes)) continue;
      errors.push(`Broken link in scope index: ${displayPath(scopeIndexPath, linkPath)} [_core-adr-policy-001]`);
    }
  }

  for (const typeIndexPath of typeIndexesInScope) {
    if (!linkedSet.has(normalizePath(typeIndexPath))) {
      errors.push(`Scope index ${toDisplayPath(scopeIndexPath)} is missing link to type index: ${toDisplayPath(typeIndexPath)} [_core-adr-policy-001]`);
    }
  }
}

/**
 * Parse a scope-type policy file for a NN-parent-scope-type rule and return the parent type name.
 * Returns null if no parent is declared or the file cannot be read.
 */
function extractParentScopeType(policyFilePath) {
  let content;
  try { content = fs.readFileSync(policyFilePath, 'utf8'); } catch { return null; }
  // Find a rule heading like "#### NN-parent-scope-type"
  const headingMatch = content.match(/^#{4}\s+\d+-parent-scope-type\s*$/m);
  if (!headingMatch) return null;
  // Extract text after the heading until the next heading or end of file
  const afterHeading = content.slice(content.indexOf(headingMatch[0]) + headingMatch[0].length);
  const bodyMatch = afterHeading.match(/`([a-z0-9-]+)`/);
  return bodyMatch ? bodyMatch[1] : null;
}

// Parse a scope-type frontmatter value into its individual elements. Supports a single
// value or a comma-separated list (e.g. "compiled, internal-docs"), matching the grammar
// defined in _core-adr-policy-010 rules 06 and 07.
function parseScopeTypeList(raw) {
  const commaSeparatedScopeTypePattern = /^[a-zA-Z_][a-zA-Z0-9_-]*(?:\s*,\s*[a-zA-Z_][a-zA-Z0-9_-]*)+$/;
  return commaSeparatedScopeTypePattern.test(raw) ? raw.split(',').map((s) => s.trim()) : [raw];
}

// Shared by the follows:/extends: frontmatter fields, which both accept a scope name, a
// comma-separated list of scope names, or an indented YAML list of scope names.
const SCOPE_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
const SCOPE_NAME_LIST_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]*(?:\s*,\s*[a-zA-Z_][a-zA-Z0-9_-]*)+$/;

// Parses the indented "- item" list entries following a scalar-less field line (e.g. a
// `follows:` key with no inline value). Returns raw trimmed strings in order, including empty
// ones for bare "-" markers so callers can distinguish "no items" from "blank item".
function parseYamlListItems(block, lineMatch) {
  const items = [];
  const start = block.indexOf(lineMatch[0]) + lineMatch[0].length;
  for (const line of block.slice(start).split('\n')) {
    const itemMatch = line.match(/^\s+-\s*(\S.*)?$/);
    if (itemMatch) {
      items.push((itemMatch[1] || '').trim());
    } else if (line.trim() && !/^\s/.test(line)) {
      break;
    }
  }
  return items;
}

// Validates the raw shape of a follows:/extends: frontmatter field (inline scalar, inline
// comma-separated list, or indented YAML list). Returns 'empty' when the field has no usable
// value, 'item' when a list entry is blank or not a valid scope name, or null when valid.
function validateScopeNameListFormat(block, lineMatch, inlineValue) {
  if (inlineValue) {
    return (SCOPE_NAME_PATTERN.test(inlineValue) || SCOPE_NAME_LIST_PATTERN.test(inlineValue)) ? null : 'empty';
  }
  const items = parseYamlListItems(block, lineMatch);
  if (items.length === 0) return 'empty';
  return items.some((item) => !item || !SCOPE_NAME_PATTERN.test(item)) ? 'item' : null;
}

// Derives the final array of entry names declared in a follows:/extends: frontmatter field.
function deriveScopeNameListEntries(block, lineMatch, inlineValue) {
  if (inlineValue) {
    if (SCOPE_NAME_LIST_PATTERN.test(inlineValue)) return inlineValue.split(',').map((s) => s.trim());
    return SCOPE_NAME_PATTERN.test(inlineValue) ? [inlineValue] : [];
  }
  return parseYamlListItems(block, lineMatch).filter(Boolean);
}

function lintScopeIndexFrontmatter(scopeIndexPath, scopeName, errors, xdrsRoot, knownScopeTypes = new Map(), extendsRelationships = new Map(), externalScopes = new Set()) {
  const isExternal = externalScopes.has(scopeName);
  const content = fs.readFileSync(scopeIndexPath, 'utf8');
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!fmMatch) {
    errors.push(`Scope index must start with a YAML frontmatter block: ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-001]`);
    return;
  }
  const block = fmMatch[1];
  const fm = extractFrontmatter(content);

  for (const key of fm.topLevelKeys) {
    if (!SCOPE_INDEX_ALLOWED_FRONTMATTER_KEYS.has(key)) {
      errors.push(`Scope index frontmatter has unknown field "${key}": ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-001]`);
    }
  }

  const scopeTypeMatch = block.match(/^scope-type:\s*(.+)$/m);
  const scopeTypeRaw = scopeTypeMatch ? scopeTypeMatch[1].trim() : null;
  if (!scopeTypeRaw) {
    // External scopes with no scope-type become read-only instead (_core-adr-policy-022.06)
    if (!isExternal) {
      errors.push(`Scope index frontmatter must include a scope-type field: ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-010.10-def-valid-iff-policy-exists]`);
    }
    return;
  }

  // Parse scope-type: supports single string or comma-separated list (e.g. "compiled, internal-docs")
  const scopeTypes = parseScopeTypeList(scopeTypeRaw);

  // Validate each element: no duplicates, valid chars, no reserved prefix
  const seenTypes = new Set();
  let hasElementError = false;
  const SCOPE_TYPE_ELEMENT_RE = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
  for (const scopeType of scopeTypes) {
    if (!SCOPE_TYPE_ELEMENT_RE.test(scopeType)) {
      errors.push(`Scope type element "${scopeType}" contains invalid characters (must match [a-zA-Z_][a-zA-Z0-9_-]*): ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-010.08-def-no-underscore-prefix]`);
      hasElementError = true;
      continue;
    }
    if (scopeType.startsWith('_') && scopeType !== '_local') {
      errors.push(`Scope type "${scopeType}" uses a reserved "_" prefix; only "_local" is a valid underscore-prefixed scope type: ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-010.08-def-no-underscore-prefix]`);
      hasElementError = true;
      continue;
    }
    if (seenTypes.has(scopeType)) {
      errors.push(`Scope type list contains duplicate value "${scopeType}": ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-010.07-def-multi-type-validation]`);
      hasElementError = true;
      continue;
    }
    seenTypes.add(scopeType);
  }
  if (hasElementError) return;

  // Use first element for single-value checks that only apply to the primary type
  const scopeType = scopeTypes[0];

  // Validate each type exists in knownScopeTypes and check parent chains with global cycle detection
  const globalVisited = new Set(scopeTypes);
  for (const st of scopeTypes) {
    if (st === '_local') continue;
    if (!knownScopeTypes.has(st)) {
      if (!isExternal) {
        errors.push(`Scope index scope-type "${st}" has no corresponding ${st}-scope-type policy in the principles of any scope: ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-010.10-def-valid-iff-policy-exists]`);
      }
      continue;
    }
    // Validate parent chain
    let currentType = st;
    while (currentType) {
      const policyPath = knownScopeTypes.get(currentType);
      if (!policyPath) break;
      const parentType = extractParentScopeType(policyPath);
      if (!parentType) break;
      if (globalVisited.has(parentType)) {
        errors.push(`Scope type "${currentType}" declares parent "${parentType}" which creates a cycle in the scope-type inheritance chain: ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-010.09-def-parent-scope-type]`);
        break;
      }
      if (!knownScopeTypes.has(parentType)) {
        if (!isExternal) {
          errors.push(`Scope type "${currentType}" declares parent "${parentType}" but no ${parentType}-scope-type policy exists in any scope: ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-010.09-def-parent-scope-type]`);
        }
        break;
      }
      globalVisited.add(parentType);
      currentType = parentType;
    }
  }
  if (scopeName === '_core' && scopeType !== 'core') {
    errors.push(`Scope "_core" must have scope-type "core": ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-011.01-scope-type-name]`);
  }
  if (scopeName === '_local' && scopeType !== '_local') {
    errors.push(`Scope "_local" must have scope-type "_local": ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-015.01-scope-type-name]`);
  }
  const isCoreType = isCoreTypeScope(scopeTypes, knownScopeTypes);
  if (isCoreType && scopeTypes.length > 1) {
    errors.push(`Core-type scope must declare exactly one scope type (found "${scopeTypes.join(', ')}"): ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-011.10-no-type-combination]`);
  }
  if (isCoreType && !scopeName.includes('core')) {
    errors.push(`Scope with type "core" must have "core" in its name: ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-011.03-naming-convention]`);
  }
  if (scopeTypes.includes('_local') && scopeName !== '_local') {
    errors.push(`Scope type "_local" is reserved for the "_local" scope: ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-015.03-exclusive-reservation]`);
  }
  if (scopeTypes.includes('reference') && !scopeName.includes('-ref-')) {
    errors.push(`Scope with type "reference" must follow the naming pattern {domain}-ref-{name} (e.g. "security-ref-baseline"): ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-012.03-naming-convention]`);
  }
  if (scopeTypes.includes('platform') && !scopeName.includes('-plat-')) {
    errors.push(`Scope with type "platform" must follow the naming pattern {domain}-plat-{name} (e.g. "cloud-plat-aws"): ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-013.03-naming-convention]`);
  }

  const extendsOnlyMatch = block.match(/^extends-only:[ \t]*(.*)$/m);
  if (extendsOnlyMatch) {
    const extendsOnlyValue = extendsOnlyMatch[1].trim();
    if (extendsOnlyValue !== 'true' && extendsOnlyValue !== 'false') {
      // External scopes with an invalid value become read-only instead (_core-adr-policy-022.06)
      if (!isExternal) {
        errors.push(`Scope index frontmatter extends-only must be unquoted lowercase true or false (found "${extendsOnlyValue}"): ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-022.07-extends-only-field]`);
      }
    } else if (extendsOnlyValue === 'true' && (RESERVED_SCOPES.has(scopeName) || isCoreType)) {
      errors.push(`Scope index frontmatter extends-only: true is not allowed on _core, _local or core-type scopes: ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-022.07-extends-only-field]`);
    }
  }

  if (!fm.name) {
    errors.push(`Scope index frontmatter must include a non-empty name field: ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-001]`);
  } else if (fm.name !== scopeName) {
    errors.push(`Scope index frontmatter name must match scope directory name "${scopeName}": ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-001]`);
  }

  if (!fm.description) {
    errors.push(`Scope index frontmatter must include a non-empty description field: ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-001]`);
  } else if (fm.descriptionText && countWords(fm.descriptionText) > 40) {
    errors.push(`Scope index frontmatter description must be 40 words or fewer: ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-001]`);
  }

  if (!fm.appliedTo) {
    errors.push(`Scope index frontmatter must include an apply-to field: ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-001]`);
  } else {
    const words = countWords(fm.appliedTo);
    if (words === 0) {
      errors.push(`Scope index frontmatter apply-to must not be empty: ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-001]`);
    } else if (words > 30) {
      errors.push(`Scope index frontmatter apply-to must be 30 words or fewer: ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-001]`);
    }
  }

  if (!fm.validFrom) {
    errors.push(`Scope index frontmatter must include a valid-from field: ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-001]`);
  } else if (!isIsoDate(fm.validFrom)) {
    errors.push(`Scope index frontmatter valid-from must be a valid ISO date YYYY-MM-DD: ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-001]`);
  }

  let followsEntries = [];
  const followsLineMatch = block.match(/^follows:[ \t]*(.*)/m);
  if (followsLineMatch !== null) {
    const followsValue = followsLineMatch[1].trim();
    const followsFormatError = validateScopeNameListFormat(block, followsLineMatch, followsValue);
    if (followsFormatError === 'item') {
      errors.push(`Scope index frontmatter follows entries must be non-empty scope names: ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-001]`);
    } else if (followsFormatError === 'empty') {
      errors.push(`Scope index frontmatter follows must be a core scope name or list of core scope names: ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-001]`);
    }
    if (xdrsRoot) {
      const entries = deriveScopeNameListEntries(block, followsLineMatch, followsValue);
      followsEntries = entries;
      const seenFollows = new Set();
      for (const entry of entries) {
        if (seenFollows.has(entry)) {
          errors.push(`Scope index frontmatter follows has duplicate entry "${entry}": ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-001]`);
        }
        seenFollows.add(entry);
        if (SCOPE_NAME_PATTERN.test(entry)) {
          if (entry === scopeName) {
            errors.push(`Scope index frontmatter follows must not reference the scope itself: ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-001]`);
            continue;
          }
          if (entry === '_core') {
            errors.push(`Scope index frontmatter follows must not reference "_core" as it is always applied implicitly: ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-001]`);
            continue;
          }
          const followedIndexPath = path.join(xdrsRoot, entry, 'index.md');
          if (!existsFile(followedIndexPath)) {
            // Missing -core is expected for an external companion scope: it becomes read-only
            // (collected by collectReadOnlyScopes per _core-adr-policy-022.06), not a lint error.
            if (!isExternal) {
              errors.push(`Scope index frontmatter follows references scope "${entry}" which does not exist in the workspace: ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-001]`);
            }
          } else {
            const followedContent = fs.readFileSync(followedIndexPath, 'utf8');
            const followedTypeMatch = followedContent.match(/^scope-type:\s*(.+)$/m);
            const followedTypes = followedTypeMatch ? parseScopeTypeField(followedTypeMatch[1].trim()) : [];
            if (!isCoreTypeScope(followedTypes, knownScopeTypes)) {
              errors.push(`Scope index frontmatter follows references scope "${entry}" which is not a core-type scope: ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-001]`);
            }
          }
        }
      }
    }
  }

  // Parse extends: field
  let extendsEntries = [];
  const extendsLineMatch = block.match(/^extends:[ \t]*(.*)/m);
  if (extendsLineMatch !== null) {
    const extendsValue = extendsLineMatch[1].trim();
    const extendsFormatError = validateScopeNameListFormat(block, extendsLineMatch, extendsValue);
    if (extendsFormatError === 'item') {
      errors.push(`Scope index frontmatter extends entries must be non-empty scope names: ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-010.27-extends-declaration]`);
    } else if (extendsFormatError === 'empty') {
      errors.push(`Scope index frontmatter extends must be a scope name or list of scope names: ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-010.27-extends-declaration]`);
    }
    const rawEntries = deriveScopeNameListEntries(block, extendsLineMatch, extendsValue);
    const seenExtends = new Set();
    for (const entry of rawEntries) {
      if (seenExtends.has(entry)) {
        errors.push(`Scope index frontmatter extends has duplicate entry "${entry}": ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-010.27-extends-declaration]`);
        continue;
      }
      seenExtends.add(entry);
      if (!SCOPE_NAME_PATTERN.test(entry)) continue;
      if (entry === scopeName) {
        errors.push(`Scope index frontmatter extends must not reference the scope itself: ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-010.30-extends-no-self]`);
        continue;
      }
      if (entry === '_local' || entry === '_core') {
        errors.push(`Scope index frontmatter extends must not reference reserved scope "${entry}": ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-010.29-extends-reserved-scopes]`);
        continue;
      }
      extendsEntries.push(entry);
    }
    if (xdrsRoot) {
      const seenValid = new Set();
      for (const entry of extendsEntries) {
        if (seenValid.has(entry)) continue;
        seenValid.add(entry);
        if (followsEntries.includes(entry)) {
          errors.push(`Scope index frontmatter extends must not repeat scope "${entry}" already declared in follows: ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-010.28-extends-disjoint]`);
          continue;
        }
        if (!existsFile(path.join(xdrsRoot, entry, 'index.md'))) {
          if (!isExternal) {
            errors.push(`Scope index frontmatter extends references scope "${entry}" which does not exist in the workspace: ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-010.32-extends-mandatory-presence]`);
          }
        }
      }
      if (extendsEntries.length > 0) {
        extendsRelationships.set(scopeName, extendsEntries.filter((e) => existsFile(path.join(xdrsRoot, e, 'index.md'))));
      }
    }
  }
}


function lintScopeDirectory(xdrsRoot, scopeName, errors, warnings, actualTypeIndexes, ignoreExternal, externalScopes, knownScopeTypes = new Map(), extendsRelationships = new Map(), trackedExternalScopes = new Set()) {
  const scopePath = path.join(xdrsRoot, scopeName);

  if (ignoreExternal && externalScopes.has(scopeName)) {
    return;
  }

  if (!isValidScopeName(scopeName)) {
    errors.push(`Invalid scope name: ${toDisplayPath(scopePath)} [_core-adr-policy-001]`);
  }

  // Determine if this scope is a core-type scope (but not _core which is exempt)
  // Used to enforce structured format on all policies in core-type scopes
  let isCoreTypeNonExempt = false;
  let isCompiledScope = false;
  if (scopeName !== '_core') {
    const scopeIndexPath = path.join(scopePath, 'index.md');
    if (existsFile(scopeIndexPath)) {
      try {
        const idxContent = fs.readFileSync(scopeIndexPath, 'utf8');
        const stMatch = idxContent.match(/^scope-type:\s*(.+)$/m);
        if (stMatch) {
          const stList = parseScopeTypeField(stMatch[1].trim());
          isCoreTypeNonExempt = isCoreTypeScope(stList, knownScopeTypes);
          isCompiledScope = stList.includes('compiled');
        }
      } catch { /* ignore read errors; will be caught later */ }
    }
  }

  const typeIndexesInScope = [];
  const entries = safeReadDir(scopePath, errors, `read scope directory ${scopeName}`);
  for (const entry of entries) {
    const entryPath = path.join(scopePath, entry.name);
    if (entry.isDirectory()) {
      if (!TYPE_NAMES.has(entry.name)) {
        errors.push(`Unexpected directory under scope ${scopeName}: ${toDisplayPath(entryPath)} [_core-adr-policy-001]`);
        continue;
      }
      lintTypeDirectory(xdrsRoot, scopeName, entry.name, errors, warnings, actualTypeIndexes, externalScopes, isCoreTypeNonExempt, isCompiledScope);
      const typeIndexPath = path.join(entryPath, 'index.md');
      if (existsFile(typeIndexPath)) {
        typeIndexesInScope.push(typeIndexPath);
      }
      continue;
    }

    if (entry.name === 'index.md') {
      continue;
    }

    errors.push(`Unexpected file under scope ${scopeName}: ${toDisplayPath(entryPath)} [_core-adr-policy-001]`);
  }

  const scopeIndexPath = path.join(scopePath, 'index.md');
  if (!existsFile(scopeIndexPath)) {
    errors.push(`Missing required scope index: ${toDisplayPath(scopeIndexPath)} [_core-adr-policy-001]`);
  } else {
    lintScopeIndex(scopeIndexPath, xdrsRoot, scopeName, typeIndexesInScope, errors, externalScopes);
    lintScopeIndexFrontmatter(scopeIndexPath, scopeName, errors, xdrsRoot, knownScopeTypes, extendsRelationships, trackedExternalScopes);
  }
  lintLocalMetaPolicies(xdrsRoot, scopeName, errors, isCompiledScope);
}

function lintLocalMetaPolicies(xdrsRoot, scopeName, errors, isCompiledScope = false) {
  const scopePath = path.join(xdrsRoot, scopeName);
  // Track qualifiers across all type folders: qualifier ('' for primary) -> filePath
  const seenQualifiers = new Map();
  for (const typeName of Object.keys(TYPE_TO_ID)) {
    const principlesDir = path.join(scopePath, typeName, 'principles');
    if (!existsDirectory(principlesDir)) continue;
    let principlesEntries;
    try { principlesEntries = fs.readdirSync(principlesDir, { withFileTypes: true }); } catch { continue; }
    // Collect primary and companions per type folder
    let primaryInFolder = null;
    const companionsInFolder = [];
    for (const entry of principlesEntries) {
      if (!entry.isFile()) continue;
      const m = entry.name.match(NUMBERED_FILE_RE);
      if (!m) continue;
      const title = m[2];
      // Exclude scope-type definition files
      if (title.endsWith('-scope-type')) continue;
      const titleParts = title.split('-');
      if (titleParts[0] !== 'core') continue;
      // Determine qualifier ('') for primary, qualifier string for companions
      const qualifier = titleParts.length === 1 ? '' : titleParts.slice(1).join('-');
      const filePath = path.join(principlesDir, entry.name);
      if (qualifier === '') {
        primaryInFolder = { filePath, qualifier };
      } else {
        companionsInFolder.push({ filePath, qualifier });
      }
    }
    // Error: companion exists without primary in same type folder
    for (const companion of companionsInFolder) {
      if (!primaryInFolder) {
        errors.push(`Local meta-policy companion "${path.basename(companion.filePath)}" requires a primary "NNN-core.md" in the same type folder "${typeName}": ${toDisplayPath(companion.filePath)} [_core-adr-policy-010.15-local-primary-required]`);
      }
    }
    // For compiled scopes: primary meta-policy must include ## Sources, ## Selectors, and ## Sync Settings
    if (isCompiledScope && primaryInFolder) {
      let metaContent;
      try { metaContent = fs.readFileSync(primaryInFolder.filePath, 'utf8'); } catch { /* will be caught elsewhere */ }
      if (metaContent !== undefined) {
        const metaLines = metaContent.split(/\r?\n/);
        const metaIgnored = findIgnoredMarkdownLines(metaLines);
        const metaHeadingLines = findHeadingLines(metaLines, metaIgnored);

        const sourcesHeadingIdx = findHeadingLine(metaLines, metaIgnored, '## Sources');
        if (sourcesHeadingIdx === -1) {
          errors.push(`Compiled scope meta-policy must include a "## Sources" section: ${toDisplayPath(primaryInFolder.filePath)} [_core-adr-policy-019.07-compilation-meta-policy]`);
        } else {
          const [sourcesStart, sourcesEnd] = sectionBodyRange(metaLines, metaHeadingLines, sourcesHeadingIdx);
          for (let i = sourcesStart; i < sourcesEnd; i += 1) {
            if (metaIgnored[i]) continue;
            const trimmed = metaLines[i].trim();
            if (!trimmed.startsWith('-')) continue;
            if (!/^-\s+\[(web|git|local)\]\s+[a-z0-9-]+:\s+.+$/.test(trimmed)) {
              errors.push(`Compiled scope "## Sources" bullet must include a NAME slug in the format "- [web|git|local] name: value": ${toDisplayPath(primaryInFolder.filePath)}:${i + 1} [_core-adr-policy-019.07-compilation-meta-policy]`);
            }
          }
        }

        if (findHeadingLine(metaLines, metaIgnored, '## Selectors') === -1) {
          errors.push(`Compiled scope meta-policy must include a "## Selectors" section: ${toDisplayPath(primaryInFolder.filePath)} [_core-adr-policy-019.07-compilation-meta-policy]`);
        }

        const syncHeadingIdx = findHeadingLine(metaLines, metaIgnored, '## Sync Settings');
        if (syncHeadingIdx === -1) {
          errors.push(`Compiled scope meta-policy must include a "## Sync Settings" section: ${toDisplayPath(primaryInFolder.filePath)} [_core-adr-policy-019.07-compilation-meta-policy]`);
        } else {
          const [syncStart, syncEnd] = sectionBodyRange(metaLines, metaHeadingLines, syncHeadingIdx);
          let hasValidResyncPeriod = false;
          for (let i = syncStart; i < syncEnd; i += 1) {
            if (metaIgnored[i]) continue;
            const trimmed = metaLines[i].trim();
            if (!trimmed.startsWith('-')) continue;
            const periodMatch = trimmed.match(/^-\s+Source re-sync period days:\s*(\d+)\s*$/);
            if (periodMatch) {
              hasValidResyncPeriod = Number(periodMatch[1]) > 0;
              continue;
            }
            const storageMatch = trimmed.match(/^-\s+Source storage:\s*(.+)$/);
            if (storageMatch && storageMatch[1].trim() !== 'temporary') {
              errors.push(`Compiled scope "## Sync Settings" "Source storage" value must be "temporary" if present: ${toDisplayPath(primaryInFolder.filePath)}:${i + 1} [_core-adr-policy-019.07-compilation-meta-policy]`);
            }
          }
          if (!hasValidResyncPeriod) {
            errors.push(`Compiled scope "## Sync Settings" section must include a "Source re-sync period days: N" bullet with a positive integer: ${toDisplayPath(primaryInFolder.filePath)} [_core-adr-policy-019.07-compilation-meta-policy]`);
          }
        }
      }
    }
    // Check qualifier uniqueness across all type folders
    const allInFolder = primaryInFolder ? [primaryInFolder, ...companionsInFolder] : companionsInFolder;
    for (const { filePath, qualifier } of allInFolder) {
      const existing = seenQualifiers.get(qualifier);
      if (existing) {
        const label = qualifier === '' ? 'primary (no qualifier)' : `qualifier "${qualifier}"`;
        errors.push(`Local meta-policy ${label} appears in multiple type folders in scope "${scopeName}": ${toDisplayPath(existing)} and ${toDisplayPath(filePath)} [_core-adr-policy-010.16-local-unique-qualifier]`);
      } else {
        seenQualifiers.set(qualifier, filePath);
      }
      // Validate structured format for all local meta-policy files
      validateStructuredFormat(filePath, errors, '_core-adr-policy-010.19-local-must-be-structured');
    }
  }
}

function lintTypeDirectory(xdrsRoot, scopeName, typeName, errors, warnings, actualTypeIndexes, externalScopes = new Set(), enforceStructured = false, isCompiledScope = false) {
  const typePath = path.join(xdrsRoot, scopeName, typeName);
  const indexPath = path.join(typePath, 'index.md');
  const xdrsNumbers = new Map();
  const artifacts = [];

  if (!existsFile(indexPath)) {
    errors.push(`Missing canonical index: ${toDisplayPath(indexPath)} [_core-adr-policy-001]`);
  } else {
    actualTypeIndexes.push(indexPath);
  }

  const entries = safeReadDir(typePath, errors, `read type directory ${scopeName}/${typeName}`);
  for (const entry of entries) {
    const entryPath = path.join(typePath, entry.name);
    if (entry.isFile()) {
      if (entry.name !== 'index.md') {
        errors.push(`Unexpected file under ${scopeName}/${typeName}: ${toDisplayPath(entryPath)} [_core-adr-policy-001]`);
      }
      continue;
    }

    if (!ALLOWED_SUBJECTS[typeName].has(entry.name)) {
      if (hasAnyNonFrozenPolicy(entryPath)) {
        errors.push(`Invalid subject folder for ${typeName}: ${toDisplayPath(entryPath)} [_core-adr-policy-001]`);
        continue;
      }
      // All policies are frozen: emit a warning and still process for content-level checks.
      warnings.push(`Invalid subject folder for ${typeName}: ${toDisplayPath(entryPath)} [_core-adr-policy-001] [exempt: freeze-reference]`);
    }

    artifacts.push(...lintSubjectDirectory(xdrsRoot, scopeName, typeName, entry.name, xdrsNumbers, errors, warnings, externalScopes, enforceStructured, isCompiledScope));
  }

  if (existsFile(indexPath)) {
    lintTypeIndex(indexPath, xdrsRoot, artifacts, errors, externalScopes);
  }
}

function lintSubjectDirectory(xdrsRoot, scopeName, typeName, subjectName, xdrsNumbers, errors, warnings, externalScopes = new Set(), enforceStructured = false, isCompiledScope = false) {
  const subjectPath = path.join(xdrsRoot, scopeName, typeName, subjectName);
  const artifacts = [];
  const entries = safeReadDir(subjectPath, errors, `read subject directory ${scopeName}/${typeName}/${subjectName}`);

  for (const entry of entries) {
    const entryPath = path.join(subjectPath, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === RESOURCE_DIR_NAME) {
        continue;
      }
      if (entry.name === 'skills') {
        artifacts.push(...lintSkillsDirectory(xdrsRoot, scopeName, entryPath, errors, externalScopes));
        continue;
      }
      if (entry.name === 'articles') {
        artifacts.push(...lintArticlesDirectory(xdrsRoot, scopeName, typeName, subjectName, entryPath, errors, externalScopes));
        continue;
      }
      if (entry.name === 'researches') {
        artifacts.push(...lintResearchDirectory(xdrsRoot, scopeName, typeName, subjectName, entryPath, errors, externalScopes));
        continue;
      }
      if (entry.name === 'initiatives') {
        artifacts.push(...lintInitiativesDirectory(xdrsRoot, scopeName, typeName, subjectName, entryPath, errors, externalScopes));
        continue;
      }

      errors.push(`Unexpected directory under ${scopeName}/${typeName}/${subjectName}: ${toDisplayPath(entryPath)} [_core-adr-policy-001]`);
      continue;
    }

    if (!NUMBERED_FILE_RE.test(entry.name)) {
      errors.push(`Invalid Policy file name: ${toDisplayPath(entryPath)} [_core-adr-policy-001]`);
      continue;
    }

    artifacts.push(entryPath);
    lintXdrsElementFile(xdrsRoot, scopeName, typeName, subjectName, entryPath, xdrsNumbers, errors, warnings, externalScopes, enforceStructured, isCompiledScope);
  }

  const subjectAssetsDir = path.join(subjectPath, RESOURCE_DIR_NAME);
  const xdrsDocsInSubject = artifacts.filter((p) => path.dirname(p) === subjectPath);
  lintOrphanAssets(subjectAssetsDir, xdrsDocsInSubject, xdrsRoot, errors, isCompiledScope);

  return artifacts;
}

function lintXdrsElementFile(xdrsRoot, scopeName, typeName, subjectName, filePath, xdrsNumbers, errors, warnings, externalScopes = new Set(), enforceStructured = false, isCompiledScope = false) {
  const baseName = path.basename(filePath);
  const match = baseName.match(NUMBERED_FILE_RE);
  if (!match) {
    return;
  }

  const number = match[1];
  const previous = xdrsNumbers.get(number);
  if (previous) {
    errors.push(`Duplicate Policy number ${number} in ${scopeName}/${typeName}: ${toDisplayPath(previous)} and ${toDisplayPath(filePath)} [_core-adr-policy-002]`);
  } else {
    xdrsNumbers.set(number, filePath);
  }

  if (baseName !== baseName.toLowerCase()) {
    errors.push(`Policy file name must be lowercase: ${toDisplayPath(filePath)} [_core-adr-policy-002]`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  lintPolicyNumberRange(number, subjectName, content, filePath, errors, warnings);
  const { freezeReference } = extractFrontmatter(content);
  const expectedHeader = `# ${scopeName}-${TYPE_TO_ID[typeName]}-${number}:`;
  const firstLine = firstNonEmptyLine(stripFrontmatter(content));
  if (!freezeReference && !firstLine.startsWith(expectedHeader)) {
    errors.push(`Policy title must start with "${expectedHeader}": ${toDisplayPath(filePath)} [_core-adr-policy-002]`);
  } else if (freezeReference && !firstLine.startsWith(expectedHeader)) {
    warnings.push(`Policy title must start with "${expectedHeader}": ${toDisplayPath(filePath)} [_core-adr-policy-002] [exempt: freeze-reference]`);
  }

  // Enforce 'core' word reservation: only allowed as first word of filename title in principles/
  const titleParts = match[2].split('-');
  if (titleParts.includes('core') && !(subjectName === 'principles' && titleParts[0] === 'core')) {
    const msg = `Policy filename must not use "core" as a name word unless it is a local meta-policy in "principles/" starting with "core" (e.g., "NNN-core.md" or "NNN-core-{qualifier}.md"): ${toDisplayPath(filePath)} [_core-adr-policy-010.13-local-naming]`;
    if (freezeReference) { warnings.push(`${msg} [exempt: freeze-reference]`); } else { errors.push(msg); }
  }

  const expectedName = extractExpectedXdrsNameFromHeading(firstLine)
    || `${scopeName}-${TYPE_TO_ID[typeName]}-${number}-${match[2]}`;
  lintXdrsElementFrontmatter(content, expectedName, filePath, errors, warnings, freezeReference);
  if (enforceStructured) {
    validateStructuredFormatContent(content, filePath, errors, '_core-adr-policy-010.12-def-core-scope-policies-must-be-structured');
  } else if (isCompiledScope) {
    validateStructuredFormatContent(content, filePath, errors, '_core-adr-policy-019.04-structured-format-required');
  } else {
    lintStructuredRuleBlocks(content, filePath, errors);
  }
  const isLocalMetaPolicy = subjectName === 'principles' && titleParts[0] === 'core';
  if (isCompiledScope && !isLocalMetaPolicy) {
    lintCompiledPolicySourceSection(content, filePath, errors);
  }
  lintRequiredSections(content, filePath, XDRS_REQUIRED_SECTIONS, 'Policy', errors);
  lintNoEmojis(content, filePath, 'Policy', errors);
  lintWordCount(content, filePath, 'Policy', POLICY_MAX_WORDS, errors);
  lintDocumentLinks(filePath, xdrsRoot, scopeName, errors, externalScopes);
}

function extractExpectedXdrsNameFromHeading(headingLine) {
  const match = headingLine.match(/^#\s+([a-z0-9_]+-(?:adr-policy|bdr-policy|edr-policy)-\d{3,}):\s+(.+?)\s*$/);
  if (!match) {
    return null;
  }

  const identifier = match[1];
  const titleSlug = slugifyTitle(match[2]);
  if (!titleSlug) {
    return null;
  }

  return `${identifier}-${titleSlug}`;
}

function slugifyTitle(title) {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-');
}

function lintXdrsElementFrontmatter(content, expectedName, filePath, errors, warnings, freezeReference = false) {
  const fm = extractFrontmatter(content);
  if (!fm.present) {
    errors.push(`Policy must start with a YAML frontmatter block: ${toDisplayPath(filePath)} [_core-adr-policy-002]`);
    return;
  }
  if (!fm.name) {
    errors.push(`Policy frontmatter must include a non-empty name field: ${toDisplayPath(filePath)} [_core-adr-policy-002]`);
  } else {
    if (fm.name !== expectedName) {
      const msg = `Policy frontmatter name must be "${expectedName}": ${toDisplayPath(filePath)} [_core-adr-policy-002]`;
      if (freezeReference) { warnings.push(`${msg} [exempt: freeze-reference]`); } else { errors.push(msg); }
    }
    if (fm.name.endsWith('-')) {
      errors.push(`Policy frontmatter name must not end with a hyphen: ${toDisplayPath(filePath)} [_core-adr-policy-002]`);
    }
    if (fm.name.length > 64) {
      errors.push(`Policy frontmatter name must be 64 characters or fewer: ${toDisplayPath(filePath)} [_core-adr-policy-002]`);
    }
  }
  if (!fm.description) {
    errors.push(`Policy frontmatter must include a non-empty description field: ${toDisplayPath(filePath)} [_core-adr-policy-002]`);
  } else if (fm.descriptionText && fm.descriptionText.length > 1024) {
    errors.push(`Policy frontmatter description must be 1024 characters or fewer: ${toDisplayPath(filePath)} [_core-adr-policy-002]`);
  }
  if (!fm.validFrom) {
    errors.push(`Policy frontmatter must include a valid-from field: ${toDisplayPath(filePath)} [_core-adr-policy-002]`);
  } else if (!isIsoDate(fm.validFrom)) {
    errors.push(`Policy frontmatter valid-from must be a valid ISO date YYYY-MM-DD: ${toDisplayPath(filePath)} [_core-adr-policy-002]`);
  }
  if (!fm.appliedTo) {
    errors.push(`Policy frontmatter must include an apply-to field: ${toDisplayPath(filePath)} [_core-adr-policy-002]`);
  } else {
    const words = countWords(fm.appliedTo);
    if (words === 0) {
      errors.push(`Policy frontmatter apply-to must not be empty: ${toDisplayPath(filePath)} [_core-adr-policy-002]`);
    } else if (words >= 40) {
      errors.push(`Policy frontmatter apply-to must be under 40 words: ${toDisplayPath(filePath)} [_core-adr-policy-002]`);
    }
  }
  for (const key of fm.topLevelKeys) {
    if (!POLICY_ALLOWED_FRONTMATTER_KEYS.has(key)) {
      errors.push(`Policy frontmatter has unknown field "${key}": ${toDisplayPath(filePath)} [_core-adr-policy-002]`);
    }
  }
}

function lintSkillsDirectory(xdrsRoot, scopeName, skillsPath, errors, externalScopes = new Set()) {
  const artifacts = [];
  const entries = safeReadDir(skillsPath, errors, `read skills directory ${toDisplayPath(skillsPath)}`);

  for (const entry of entries) {
    const entryPath = path.join(skillsPath, entry.name);
    if (!entry.isDirectory()) {
      errors.push(`Unexpected file in skills directory: ${toDisplayPath(entryPath)} [_core-adr-policy-003]`);
      continue;
    }

    // .assets is allowed as a shared resources directory within skills/
    if (entry.name === RESOURCE_DIR_NAME) {
      continue;
    }

    if (!SKILL_DIR_RE.test(entry.name)) {
      errors.push(`Invalid skill package name: ${toDisplayPath(entryPath)} [_core-adr-policy-003]`);
      continue;
    }

    if (entry.name !== entry.name.toLowerCase()) {
      errors.push(`Skill package name must be lowercase: ${toDisplayPath(entryPath)} [_core-adr-policy-003]`);
    }

    const skillFilePath = path.join(entryPath, 'SKILL.md');
    const packageEntries = safeReadDir(entryPath, errors, `read skill package ${toDisplayPath(entryPath)}`);

    for (const packageEntry of packageEntries) {
      const packageEntryPath = path.join(entryPath, packageEntry.name);

      if (packageEntry.isFile() && packageEntry.name === 'Makefile') {
        lintSkillBundlingMakefile(packageEntryPath, entryPath, xdrsRoot, errors);
      }

      if (!packageEntry.isDirectory()) {
        continue;
      }

      if (packageEntry.name === 'references') {
        const referenceEntries = safeReadDir(packageEntryPath, errors, `read references directory ${toDisplayPath(packageEntryPath)}`);
        for (const referenceEntry of referenceEntries) {
          if (referenceEntry.isDirectory() || !referenceEntry.name.endsWith('.md')) {
            continue;
          }
          const referencePath = path.join(packageEntryPath, referenceEntry.name);
          const referenceContent = fs.readFileSync(referencePath, 'utf8');
          lintWordCount(referenceContent, referencePath, 'Reference', REFERENCE_MAX_WORDS, errors);
        }
      }

      if (packageEntry.name === 'scripts') {
        lintSkillScriptHeaders(packageEntryPath, errors);
      }

      if (SKILL_PACKAGE_OPTIONAL_DIRS.has(packageEntry.name)) {
        continue;
      }

      errors.push(`Unexpected directory in skill package: ${toDisplayPath(packageEntryPath)} [_core-adr-policy-003]`);
    }

    if (!existsFile(skillFilePath)) {
      errors.push(`Missing SKILL.md in skill package: ${toDisplayPath(entryPath)} [_core-adr-policy-003]`);
      continue;
    }

    artifacts.push(skillFilePath);

    const skillContent = fs.readFileSync(skillFilePath, 'utf8');
    lintRequiredSections(skillContent, skillFilePath, SKILL_REQUIRED_SECTIONS, 'Skill', errors);
    lintSkillAntiPatternsCount(skillContent, skillFilePath, errors);
    lintSkillNestedSubsections(skillContent, skillFilePath, errors);
    lintSkillItemListWordCounts(skillContent, skillFilePath, errors);
    lintSkillTopLevelSectionOrder(skillContent, skillFilePath, errors);
    lintSkillOverviewSubsections(skillContent, skillFilePath, errors);
    const skillFm = extractFrontmatter(skillContent);
    if (!skillFm.present) {
      errors.push(`SKILL.md must start with a YAML frontmatter block: ${toDisplayPath(skillFilePath)} [_core-adr-policy-003]`);
    } else {
      if (!skillFm.name) {
        errors.push(`SKILL.md frontmatter must include a non-empty name field: ${toDisplayPath(skillFilePath)} [_core-adr-policy-003]`);
      } else {
        if (skillFm.name !== entry.name) {
          errors.push(`Skill frontmatter name must be "${entry.name}": ${toDisplayPath(skillFilePath)} [_core-adr-policy-003]`);
        }
        if (skillFm.name.length > 64) {
          errors.push(`SKILL.md frontmatter name must be 64 characters or fewer: ${toDisplayPath(skillFilePath)} [_core-adr-policy-003]`);
        }
      }
      if (!skillFm.description) {
        errors.push(`SKILL.md frontmatter must include a non-empty description field: ${toDisplayPath(skillFilePath)} [_core-adr-policy-003]`);
      } else if (skillFm.descriptionText && skillFm.descriptionText.length > 1024) {
        errors.push(`SKILL.md frontmatter description must be 1024 characters or fewer: ${toDisplayPath(skillFilePath)} [_core-adr-policy-003]`);
      }
      for (const key of skillFm.topLevelKeys) {
        if (!SKILL_ALLOWED_FRONTMATTER_KEYS.has(key)) {
          errors.push(`SKILL.md frontmatter has unknown field "${key}": ${toDisplayPath(skillFilePath)} [_core-adr-policy-003]`);
        }
      }
      lintSkillMetadata(skillFm.metadata, skillFilePath, errors);
    }

    lintNoEmojis(skillContent, skillFilePath, 'Skill', errors);
    lintWordCount(skillContent, skillFilePath, 'Skill', SKILL_MAX_WORDS, errors);
    lintDocumentLinks(skillFilePath, xdrsRoot, scopeName, errors, externalScopes);
    lintOrphanAssets(path.join(entryPath, RESOURCE_DIR_NAME), [skillFilePath], xdrsRoot, errors);
  }

  return artifacts;
}

/**
 * Validates the required `metadata` block of a SKILL.md frontmatter per _core-adr-policy-003:
 * version, author, and updated are all required fields.
 */
function lintSkillMetadata(metadata, skillFilePath, errors) {
  if (!metadata || !metadata.present) {
    errors.push(`SKILL.md frontmatter must include a metadata block: ${toDisplayPath(skillFilePath)} [_core-adr-policy-003]`);
    return;
  }

  const fields = metadata.fields;

  if (!fields.version) {
    errors.push(`SKILL.md frontmatter metadata must include a non-empty version field: ${toDisplayPath(skillFilePath)} [_core-adr-policy-003]`);
  } else if (!SEMVER_RE.test(fields.version)) {
    errors.push(`SKILL.md frontmatter metadata.version must use full semantic versioning (MAJOR.MINOR.PATCH): ${toDisplayPath(skillFilePath)} [_core-adr-policy-003]`);
  }

  if (!fields.author) {
    errors.push(`SKILL.md frontmatter metadata must include a non-empty author field: ${toDisplayPath(skillFilePath)} [_core-adr-policy-003]`);
  }

  if (!fields.updated) {
    errors.push(`SKILL.md frontmatter metadata must include a non-empty updated field: ${toDisplayPath(skillFilePath)} [_core-adr-policy-003]`);
  } else if (!isIsoDate(fields.updated)) {
    errors.push(`SKILL.md frontmatter metadata.updated must be a valid ISO date YYYY-MM-DD: ${toDisplayPath(skillFilePath)} [_core-adr-policy-003]`);
  }
}

/**
 * Returns the [start, end) body line range for a top-level "##" section given its heading
 * line index and the file's full list of "##" heading line indices.
 */
function sectionBodyRange(lines, headingLines, headingIndex) {
  const nextHeadingIndex = headingLines.find((index) => index > headingIndex);
  return [headingIndex + 1, nextHeadingIndex === undefined ? lines.length : nextHeadingIndex];
}

/**
 * Finds the first line within [start, end) whose trimmed text exactly matches headingText.
 */
function findHeadingLineInRange(lines, ignoredLines, headingText, start, end) {
  for (let index = start; index < end; index += 1) {
    if (ignoredLines[index]) continue;
    if (lines[index].trim() === headingText) {
      return index;
    }
  }
  return -1;
}

/**
 * Finds all "###"-prefixed heading line indices within [start, end).
 */
function findSubHeadingLines(lines, ignoredLines, start, end) {
  const result = [];
  for (let index = start; index < end; index += 1) {
    if (ignoredLines[index]) continue;
    if (/^###\s+/.test(lines[index].trim())) {
      result.push(index);
    }
  }
  return result;
}

/**
 * Finds all "####"-prefixed heading line indices within [start, end).
 */
function findSubSubHeadingLines(lines, ignoredLines, start, end) {
  const result = [];
  for (let index = start; index < end; index += 1) {
    if (ignoredLines[index]) continue;
    if (/^####\s+/.test(lines[index].trim())) {
      result.push(index);
    }
  }
  return result;
}

/**
 * Validates that "### Inputs" contains "#### Required" then "#### Optional", and that
 * "### Outputs" contains "#### Contents" then "#### Changes", per _core-adr-policy-003. Both
 * parents are nested inside "## Overview". Skips silently when "## Overview" or a parent
 * subsection itself is missing (already reported elsewhere).
 */
function lintSkillNestedSubsections(content, filePath, errors) {
  const lines = content.split(/\r?\n/);
  const ignoredLines = findIgnoredMarkdownLines(lines);
  const headingLines = findHeadingLines(lines, ignoredLines);

  const overviewIndex = findHeadingLine(lines, ignoredLines, '## Overview');
  if (overviewIndex === -1) return;
  const [overviewStart, overviewEnd] = sectionBodyRange(lines, headingLines, overviewIndex);
  const subHeadingLines = findSubHeadingLines(lines, ignoredLines, overviewStart, overviewEnd);

  function checkPair(parentHeadingText, firstSub, secondSub) {
    const parentIndex = findHeadingLineInRange(lines, ignoredLines, parentHeadingText, overviewStart, overviewEnd);
    if (parentIndex === -1) return;

    const nextParent = subHeadingLines.find((index) => index > parentIndex);
    const parentEnd = nextParent === undefined ? overviewEnd : nextParent;
    const firstIndex = findHeadingLineInRange(lines, ignoredLines, firstSub, parentIndex + 1, parentEnd);
    const secondIndex = findHeadingLineInRange(lines, ignoredLines, secondSub, parentIndex + 1, parentEnd);

    if (firstIndex === -1) {
      errors.push(`Skill "${parentHeadingText}" section is missing "${firstSub}": ${toDisplayPath(filePath)} [_core-adr-policy-003]`);
    }
    if (secondIndex === -1) {
      errors.push(`Skill "${parentHeadingText}" section is missing "${secondSub}": ${toDisplayPath(filePath)} [_core-adr-policy-003]`);
    }
    if (firstIndex !== -1 && secondIndex !== -1 && secondIndex < firstIndex) {
      errors.push(`Skill "${parentHeadingText}" subsections must appear in order (${firstSub}, ${secondSub}): ${toDisplayPath(filePath)} [_core-adr-policy-003]`);
    }
  }

  checkPair('### Inputs', '#### Required', '#### Optional');
  checkPair('### Outputs', '#### Contents', '#### Changes');
}

/**
 * Validates a bullet-list section's item shape: either a single "None" bullet, or one-or-more
 * bullets each under 10 words, per _core-adr-policy-003. No-op when the range has no bullets
 * at all (an empty required section is reported by other checks).
 */
function lintBulletWordCountSection(lines, ignoredLines, start, end, label, filePath, errors) {
  const bullets = [];
  for (let i = start; i < end; i += 1) {
    if (ignoredLines[i]) continue;
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    const bulletMatch = trimmed.match(/^-\s+(.*)$/);
    if (bulletMatch) {
      bullets.push(bulletMatch[1].trim());
    }
  }

  if (bullets.length === 0) {
    return;
  }

  if (bullets.length === 1 && bullets[0].toLowerCase() === 'none') {
    return;
  }

  for (const bullet of bullets) {
    const wordCount = countWords(bullet);
    if (wordCount >= 10) {
      errors.push(`${label} bullet must be under 10 words or a single "None" (found ${wordCount}): ${toDisplayPath(filePath)} [_core-adr-policy-003]`);
    }
  }
}

/**
 * Validates the item word-count rule (single "None" bullet, or one-or-more sub-10-word
 * bullets) across "### Inputs" -> "#### Required"/"#### Optional", "### Outputs" ->
 * "#### Contents"/"#### Changes", "### Halt Conditions", and "### User Interaction" (only
 * when present, since it is optional). All 4 subsections live inside "## Overview", per
 * _core-adr-policy-003.
 */
function lintSkillItemListWordCounts(content, filePath, errors) {
  const lines = content.split(/\r?\n/);
  const ignoredLines = findIgnoredMarkdownLines(lines);
  const headingLines = findHeadingLines(lines, ignoredLines);

  const overviewIndex = findHeadingLine(lines, ignoredLines, '## Overview');
  if (overviewIndex === -1) return;
  const [overviewStart, overviewEnd] = sectionBodyRange(lines, headingLines, overviewIndex);
  const subHeadingLines = findSubHeadingLines(lines, ignoredLines, overviewStart, overviewEnd);

  function subsectionRange(headingText) {
    const index = findHeadingLineInRange(lines, ignoredLines, headingText, overviewStart, overviewEnd);
    if (index === -1) return null;
    const next = subHeadingLines.find((i) => i > index);
    return [index + 1, next === undefined ? overviewEnd : next];
  }

  function subSubsectionRange(parentHeadingText, subHeadingText) {
    const parentRange = subsectionRange(parentHeadingText);
    if (!parentRange) return null;
    const [parentStart, parentEnd] = parentRange;
    const subIndex = findHeadingLineInRange(lines, ignoredLines, subHeadingText, parentStart, parentEnd);
    if (subIndex === -1) return null;
    const subSubHeadingLines = findSubSubHeadingLines(lines, ignoredLines, parentStart, parentEnd);
    const nextSub = subSubHeadingLines.find((index) => index > subIndex);
    return [subIndex + 1, nextSub === undefined ? parentEnd : nextSub];
  }

  const subsectionTargets = [
    { range: subSubsectionRange('### Inputs', '#### Required'), label: 'Skill "### Inputs" -> "#### Required"' },
    { range: subSubsectionRange('### Inputs', '#### Optional'), label: 'Skill "### Inputs" -> "#### Optional"' },
    { range: subSubsectionRange('### Outputs', '#### Contents'), label: 'Skill "### Outputs" -> "#### Contents"' },
    { range: subSubsectionRange('### Outputs', '#### Changes'), label: 'Skill "### Outputs" -> "#### Changes"' },
  ];

  for (const target of subsectionTargets) {
    if (!target.range) continue; // missing heading already reported elsewhere
    lintBulletWordCountSection(lines, ignoredLines, target.range[0], target.range[1], target.label, filePath, errors);
  }

  const haltRange = subsectionRange('### Halt Conditions');
  if (haltRange) {
    lintBulletWordCountSection(lines, ignoredLines, haltRange[0], haltRange[1], 'Skill "### Halt Conditions"', filePath, errors);
  }

  const interactionRange = subsectionRange(SKILL_OPTIONAL_USER_INTERACTION_SECTION);
  if (interactionRange) {
    lintBulletWordCountSection(lines, ignoredLines, interactionRange[0], interactionRange[1], 'Skill "### User Interaction"', filePath, errors);
  }
}

/**
 * Validates that all recognized top-level "##" sections present in the file appear in the
 * template order defined by _core-adr-policy-003. Missing sections are not an error here
 * (see lintRequiredSections and lintSkillOverviewSubsections for presence checks).
 */
function lintSkillTopLevelSectionOrder(content, filePath, errors) {
  const lines = content.split(/\r?\n/);
  const ignoredLines = findIgnoredMarkdownLines(lines);
  const headingLines = findHeadingLines(lines, ignoredLines);

  const presentKnownHeadings = headingLines
    .map((index) => lines[index].trim())
    .filter((headingText) => SKILL_TEMPLATE_SECTION_ORDER.includes(headingText));

  for (let i = 1; i < presentKnownHeadings.length; i += 1) {
    const prevOrder = SKILL_TEMPLATE_SECTION_ORDER.indexOf(presentKnownHeadings[i - 1]);
    const currOrder = SKILL_TEMPLATE_SECTION_ORDER.indexOf(presentKnownHeadings[i]);
    if (currOrder < prevOrder) {
      errors.push(`Skill sections must appear in template order (${SKILL_TEMPLATE_SECTION_ORDER.join(', ')}): ${toDisplayPath(filePath)} [_core-adr-policy-003]`);
      break;
    }
  }
}

/**
 * Validates the "## Overview" section's nested subsections per _core-adr-policy-003:
 * "### Inputs", "### Outputs", and "### Halt Conditions" are required; "### User
 * Interaction" and "### Runtime Requirements" are optional but, when present, must be
 * non-empty. All recognized subsections found must appear in template order. No-op when
 * "## Overview" itself is missing (already reported by lintRequiredSections).
 */
function lintSkillOverviewSubsections(content, filePath, errors) {
  const lines = content.split(/\r?\n/);
  const ignoredLines = findIgnoredMarkdownLines(lines);
  const headingLines = findHeadingLines(lines, ignoredLines);

  const overviewIndex = findHeadingLine(lines, ignoredLines, '## Overview');
  if (overviewIndex === -1) return;

  const [overviewStart, overviewEnd] = sectionBodyRange(lines, headingLines, overviewIndex);
  const subHeadingLines = findSubHeadingLines(lines, ignoredLines, overviewStart, overviewEnd);
  const presentSubsections = subHeadingLines
    .map((index) => lines[index].trim())
    .filter((headingText) => SKILL_OVERVIEW_SUBSECTION_ORDER.includes(headingText));

  for (const required of SKILL_OVERVIEW_REQUIRED_SUBSECTIONS) {
    if (!presentSubsections.includes(required)) {
      errors.push(`Skill "## Overview" is missing required subsection "${required}": ${toDisplayPath(filePath)} [_core-adr-policy-003]`);
    }
  }

  for (const section of [SKILL_OPTIONAL_USER_INTERACTION_SECTION, SKILL_OPTIONAL_RUNTIME_SECTION]) {
    const headingIndex = findHeadingLineInRange(lines, ignoredLines, section, overviewStart, overviewEnd);
    if (headingIndex === -1) continue;

    const nextSub = subHeadingLines.find((index) => index > headingIndex);
    const bodyEnd = nextSub === undefined ? overviewEnd : nextSub;
    const hasContent = lines
      .slice(headingIndex + 1, bodyEnd)
      .some((line, offset) => !ignoredLines[headingIndex + 1 + offset] && line.trim().length > 0);
    if (!hasContent) {
      errors.push(`Skill section "${section}" must not be empty: ${toDisplayPath(filePath)} [_core-adr-policy-003]`);
    }
  }

  for (let i = 1; i < presentSubsections.length; i += 1) {
    const prevOrder = SKILL_OVERVIEW_SUBSECTION_ORDER.indexOf(presentSubsections[i - 1]);
    const currOrder = SKILL_OVERVIEW_SUBSECTION_ORDER.indexOf(presentSubsections[i]);
    if (currOrder < prevOrder) {
      errors.push(`Skill "## Overview" subsections must appear in order (${SKILL_OVERVIEW_SUBSECTION_ORDER.join(', ')}): ${toDisplayPath(filePath)} [_core-adr-policy-003]`);
      break;
    }
  }
}

/**
 * Validates the SKILL.md "## Anti-Patterns" section has at least the minimum number of
 * "- **Mistake:**" entries required by _core-adr-policy-003.
 */
function lintSkillAntiPatternsCount(content, filePath, errors) {
  const lines = content.split(/\r?\n/);
  const ignoredLines = findIgnoredMarkdownLines(lines);
  const headingIndex = findHeadingLine(lines, ignoredLines, '## Anti-Patterns');
  if (headingIndex === -1) {
    return; // Missing section is already reported by lintRequiredSections.
  }

  const headingLines = findHeadingLines(lines, ignoredLines);
  const nextHeadingIndex = headingLines.find((index) => index > headingIndex);
  const sectionEnd = nextHeadingIndex === undefined ? lines.length : nextHeadingIndex;

  let mistakeCount = 0;
  for (let i = headingIndex + 1; i < sectionEnd; i += 1) {
    if (!ignoredLines[i] && /^-\s+\*\*Mistake:\*\*/.test(lines[i].trim())) {
      mistakeCount += 1;
    }
  }

  if (mistakeCount < SKILL_ANTI_PATTERNS_MIN_ENTRIES) {
    errors.push(`Skill "## Anti-Patterns" section must include at least ${SKILL_ANTI_PATTERNS_MIN_ENTRIES} entries (found ${mistakeCount}): ${toDisplayPath(filePath)} [_core-adr-policy-003]`);
  }
}

/**
 * Validates that each file inside a skill's scripts/ directory declares its runtime or
 * interpreter at the top (shebang or header comment) per _core-adr-policy-003.
 */
function lintSkillScriptHeaders(scriptsPath, errors) {
  const entries = safeReadDir(scriptsPath, errors, `read scripts directory ${toDisplayPath(scriptsPath)}`);
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const scriptPath = path.join(scriptsPath, entry.name);
    const content = fs.readFileSync(scriptPath, 'utf8');
    if (!SCRIPT_HEADER_RE.test(firstNonEmptyLine(content))) {
      errors.push(`Script must declare its runtime/interpreter at the top (shebang or header comment): ${toDisplayPath(scriptPath)} [_core-adr-policy-003]`);
    }
  }
}

/**
 * Validates an optional skill bundling Makefile per _core-adr-policy-021: it must expose
 * build/test/clean targets, and its dist/ output must be covered by a .gitignore.
 */
function lintSkillBundlingMakefile(makefilePath, skillPackagePath, xdrsRoot, errors) {
  const content = fs.readFileSync(makefilePath, 'utf8');
  for (const target of SKILL_BUNDLING_MAKEFILE_TARGETS) {
    const targetRe = new RegExp(`^${target}\\s*:`, 'm');
    if (!targetRe.test(content)) {
      errors.push(`Skill bundling Makefile is missing required "${target}" target: ${toDisplayPath(makefilePath)} [_core-adr-policy-021.09-standard-targets]`);
    }
  }

  const buildTargetMatch = content.match(/^build\s*:(.*)$/m);
  if (buildTargetMatch && !buildTargetMatch[1].trim().split(/\s+/).includes('clean')) {
    errors.push(`Skill bundling Makefile's "build" target must depend on "clean" (e.g. "build: clean"): ${toDisplayPath(makefilePath)} [_core-adr-policy-021.11-build-depends-on-clean]`);
  }

  if (!isDistGitignoredForSkill(skillPackagePath, xdrsRoot)) {
    errors.push(`Skill bundling Makefile's "dist" output is not covered by any .gitignore (cover it in the repository root .gitignore or in a local .gitignore inside the skill package): ${toDisplayPath(makefilePath)} [_core-adr-policy-021.02-dist-output-location]`);
  }
}

function gitignoreCoversDistAnyDepth(content) {
  return content.split(/\r?\n/).some((line) => {
    const trimmed = line.trim().replace(/\/$/, '');
    return trimmed === 'dist' || trimmed === '**/dist';
  });
}

function isDistGitignoredForSkill(skillPackagePath, xdrsRoot) {
  const localGitignorePath = path.join(skillPackagePath, '.gitignore');
  if (existsFile(localGitignorePath) && gitignoreCoversDistAnyDepth(fs.readFileSync(localGitignorePath, 'utf8'))) {
    return true;
  }

  const rootGitignorePath = path.join(path.dirname(xdrsRoot), '.gitignore');
  if (existsFile(rootGitignorePath) && gitignoreCoversDistAnyDepth(fs.readFileSync(rootGitignorePath, 'utf8'))) {
    return true;
  }

  return false;
}

function lintArticlesDirectory(xdrsRoot, scopeName, typeName, subjectName, articlesPath, errors, externalScopes = new Set()) {
  const artifacts = [];
  const articleNumbers = new Map();
  const entries = safeReadDir(articlesPath, errors, `read articles directory ${scopeName}/${typeName}/${subjectName}/articles`);

  for (const entry of entries) {
    const entryPath = path.join(articlesPath, entry.name);
    if (entry.isDirectory() && entry.name === RESOURCE_DIR_NAME) {
      continue;
    }

    if (!entry.isFile()) {
      errors.push(`Unexpected directory in articles folder: ${toDisplayPath(entryPath)} [_core-adr-policy-004]`);
      continue;
    }

    const match = entry.name.match(NUMBERED_FILE_RE);
    if (!match) {
      errors.push(`Invalid article file name: ${toDisplayPath(entryPath)} [_core-adr-policy-004]`);
      continue;
    }

    artifacts.push(entryPath);

    const number = match[1];
    const previous = articleNumbers.get(number);
    if (previous) {
      errors.push(`Duplicate article number ${number} in ${scopeName}/${typeName}/${subjectName}/articles: ${toDisplayPath(previous)} and ${toDisplayPath(entryPath)} [_core-adr-policy-004]`);
    } else {
      articleNumbers.set(number, entryPath);
    }

    if (entry.name !== entry.name.toLowerCase()) {
      errors.push(`Article file name must be lowercase: ${toDisplayPath(entryPath)} [_core-adr-policy-004]`);
    }

    const content = fs.readFileSync(entryPath, 'utf8');
    const typeId = TYPE_TO_ID[typeName].split('-')[0]; // 'adr', 'bdr', or 'edr'
    const expectedHeader = `# ${scopeName}-${typeId}-article-${number}:`;
    const firstLine = firstNonEmptyLine(content);
    if (!firstLine.startsWith(expectedHeader)) {
      errors.push(`Article title must start with "${expectedHeader}": ${toDisplayPath(entryPath)} [_core-adr-policy-004]`);
    }

    lintRequiredSections(content, entryPath, ARTICLE_REQUIRED_SECTIONS, 'Article', errors);
    lintNoEmojis(content, entryPath, 'Article', errors);
    lintWordCount(content, entryPath, 'Article', ARTICLE_MAX_WORDS, errors);
    lintDocumentLinks(entryPath, xdrsRoot, scopeName, errors, externalScopes);
  }

  lintOrphanAssets(path.join(articlesPath, RESOURCE_DIR_NAME), artifacts, xdrsRoot, errors);

  return artifacts;
}

function lintResearchDirectory(xdrsRoot, scopeName, typeName, subjectName, researchPath, errors, externalScopes = new Set()) {
  const artifacts = [];
  const researchNumbers = new Map();
  const entries = safeReadDir(researchPath, errors, `read research directory ${scopeName}/${typeName}/${subjectName}/researches`);

  for (const entry of entries) {
    const entryPath = path.join(researchPath, entry.name);
    if (entry.isDirectory() && entry.name === RESOURCE_DIR_NAME) {
      continue;
    }

    if (!entry.isFile()) {
      errors.push(`Unexpected directory in researches folder: ${toDisplayPath(entryPath)} [_core-adr-policy-006]`);
      continue;
    }

    const match = entry.name.match(NUMBERED_FILE_RE);
    if (!match) {
      errors.push(`Invalid research file name: ${toDisplayPath(entryPath)} [_core-adr-policy-006]`);
      continue;
    }

    artifacts.push(entryPath);

    const number = match[1];
    const previous = researchNumbers.get(number);
    if (previous) {
      errors.push(`Duplicate research number ${number} in ${scopeName}/${typeName}/${subjectName}/researches: ${toDisplayPath(previous)} and ${toDisplayPath(entryPath)} [_core-adr-policy-006]`);
    } else {
      researchNumbers.set(number, entryPath);
    }

    if (entry.name !== entry.name.toLowerCase()) {
      errors.push(`Research file name must be lowercase: ${toDisplayPath(entryPath)} [_core-adr-policy-006]`);
    }

    const content = fs.readFileSync(entryPath, 'utf8');
    const typeId = TYPE_TO_ID[typeName].split('-')[0]; // 'adr', 'bdr', or 'edr'
    const expectedHeader = `# ${scopeName}-${typeId}-research-${number}:`;
    const firstLine = firstNonEmptyLine(content);
    if (!firstLine.startsWith(expectedHeader)) {
      errors.push(`Research title must start with "${expectedHeader}": ${toDisplayPath(entryPath)} [_core-adr-policy-006]`);
    }

    lintRequiredSections(content, entryPath, RESEARCH_REQUIRED_SECTIONS, 'Research', errors);
    lintResearchIntroductionQuestion(content, entryPath, errors);
    lintResearchSectionWordLimits(content, entryPath, errors);
    lintNoEmojis(content, entryPath, 'Research', errors);
    lintWordCount(content, entryPath, 'Research', RESEARCH_MAX_WORDS, errors);
    lintDocumentLinks(entryPath, xdrsRoot, scopeName, errors, externalScopes);
  }

  lintOrphanAssets(path.join(researchPath, RESOURCE_DIR_NAME), artifacts, xdrsRoot, errors);

  return artifacts;
}

function lintInitiativesDirectory(xdrsRoot, scopeName, typeName, subjectName, initiativesPath, errors, externalScopes = new Set()) {
  const artifacts = [];
  const initiativeNumbers = new Map();
  const entries = safeReadDir(initiativesPath, errors, `read initiatives directory ${scopeName}/${typeName}/${subjectName}/initiatives`);

  for (const entry of entries) {
    const entryPath = path.join(initiativesPath, entry.name);
    if (entry.isDirectory() && entry.name === RESOURCE_DIR_NAME) {
      continue;
    }

    if (!entry.isFile()) {
      errors.push(`Unexpected directory in initiatives folder: ${toDisplayPath(entryPath)} [_core-adr-policy-007]`);
      continue;
    }

    const match = entry.name.match(NUMBERED_FILE_RE);
    if (!match) {
      errors.push(`Invalid initiative file name: ${toDisplayPath(entryPath)} [_core-adr-policy-007]`);
      continue;
    }

    artifacts.push(entryPath);

    const number = match[1];
    const previous = initiativeNumbers.get(number);
    if (previous) {
      errors.push(`Duplicate initiative number ${number} in ${scopeName}/${typeName}/${subjectName}/initiatives: ${toDisplayPath(previous)} and ${toDisplayPath(entryPath)} [_core-adr-policy-007]`);
    } else {
      initiativeNumbers.set(number, entryPath);
    }

    if (entry.name !== entry.name.toLowerCase()) {
      errors.push(`Initiative file name must be lowercase: ${toDisplayPath(entryPath)} [_core-adr-policy-007]`);
    }

    const content = fs.readFileSync(entryPath, 'utf8');
    const typeId = TYPE_TO_ID[typeName].split('-')[0]; // 'adr', 'bdr', or 'edr'
    const expectedHeader = `# ${scopeName}-${typeId}-initiative-${number}:`;
    const firstLine = firstNonEmptyLine(content);
    if (!firstLine.startsWith(expectedHeader)) {
      errors.push(`Initiative title must start with "${expectedHeader}": ${toDisplayPath(entryPath)} [_core-adr-policy-007]`);
    }

    lintRequiredSections(content, entryPath, INITIATIVE_REQUIRED_SECTIONS, 'Initiative', errors);
    lintInitiativeExpectedEndDate(content, entryPath, errors);
    lintNoEmojis(content, entryPath, 'Initiative', errors);
    lintDocumentLinks(entryPath, xdrsRoot, scopeName, errors, externalScopes);
  }

  lintOrphanAssets(path.join(initiativesPath, RESOURCE_DIR_NAME), artifacts, xdrsRoot, errors);

  return artifacts;
}

/**
 * Returns true when at least one policy file in dirPath does NOT have freeze-reference: true.
 * Used to decide whether an invalid-subject-folder error should be reported.
 */
function hasAnyNonFrozenPolicy(dirPath) {
  let entries;
  try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); } catch { return false; }
  for (const entry of entries) {
    if (!entry.isFile() || !NUMBERED_FILE_RE.test(entry.name)) continue;
    let content;
    try { content = fs.readFileSync(path.join(dirPath, entry.name), 'utf8'); } catch { return true; }
    const fm = extractFrontmatter(content);
    if (!fm.freezeReference) return true;
  }
  return false;
}

function lintPolicyNumberRange(number, subjectName, content, filePath, errors, warnings) {
  const fm = extractFrontmatter(content);
  const num = parseInt(number, 10);
  if (num >= RESERVED_NUMBER_RANGE_MIN && num <= RESERVED_NUMBER_RANGE_MAX) {
    const msg = `Policy number ${number} is in the reserved range (801–900) which MUST NOT be assigned: ${toDisplayPath(filePath)} [_core-adr-policy-017.05-reserved-gap-must-not-be-assigned]`;
    if (fm.freezeReference) { warnings.push(`${msg} [exempt: freeze-reference]`); } else { errors.push(msg); }
    return;
  }
  if (num < OVERFLOW_RANGE_MIN) {
    const range = SUBJECT_NUMBER_RANGES[subjectName];
    if (range && (num < range[0] || num > range[1])) {
      const msg = `Policy number ${number} is outside the ${range[0]}–${range[1]} block reserved for subject "${subjectName}": ${toDisplayPath(filePath)} [_core-adr-policy-017.01-numbering-blocks-per-subject]`;
      if (fm.freezeReference) { warnings.push(`${msg} [exempt: freeze-reference]`); } else { errors.push(msg); }
    }
  }
}

function lintNoEmojis(content, filePath, docType, errors) {
  const lines = content.split(/\r?\n/);
  const ignoredLines = findIgnoredMarkdownLines(lines);
  for (let i = 0; i < lines.length; i++) {
    if (ignoredLines[i]) continue;
    if (EMOJI_RE.test(lines[i])) {
      errors.push(`${docType} must not contain emojis: ${toDisplayPath(filePath)}:${i + 1} ${DOC_TYPE_POLICY_REF[docType] || ''}`);
    }
  }
}

function lintWordCount(content, filePath, docType, maxWords, errors) {
  const body = stripFrontmatter(content);
  const wordCount = countWords(body);
  if (wordCount > maxWords) {
    errors.push(`${docType} exceeds maximum word count of ${maxWords} (${wordCount} words): ${toDisplayPath(filePath)} ${DOC_TYPE_POLICY_REF[docType] || ''}`);
  }
}

function lintResearchIntroductionQuestion(content, filePath, errors) {
  const lines = content.split(/\r?\n/);
  const ignoredLines = findIgnoredMarkdownLines(lines);
  const introStart = findHeadingLine(lines, ignoredLines, '## Introduction');
  if (introStart === -1) return; // Already caught by lintRequiredSections

  let introEnd = lines.length;
  for (let i = introStart + 1; i < lines.length; i++) {
    if (!ignoredLines[i] && /^## /.test(lines[i].trim())) {
      introEnd = i;
      break;
    }
  }

  let hasQuestion = false;
  for (let i = introStart + 1; i < introEnd; i++) {
    if (!ignoredLines[i] && lines[i].trim().startsWith('Question:')) {
      hasQuestion = true;
      break;
    }
  }

  if (!hasQuestion) {
    errors.push(`Research ## Introduction must contain a "Question:" line: ${toDisplayPath(filePath)} [_core-adr-policy-006]`);
  }
}

const XDRS_REQUIRED_SECTIONS = ['## Context and Problem Statement', '## Decision Outcome'];
const ARTICLE_REQUIRED_SECTIONS = ['## Overview', '## Content', '## References'];
const RESEARCH_REQUIRED_SECTIONS = ['## Abstract', '## Introduction', '## Methods', '## Results', '## Discussion', '## Conclusion', '## References'];
const INITIATIVE_REQUIRED_SECTIONS = ['## Executive Summary', '## Context and Problem Statement', '## Proposed Solution'];
const SKILL_REQUIRED_SECTIONS = ['## Overview', '## Instructions', '## Anti-Patterns'];
const SKILL_TEMPLATE_SECTION_ORDER = [
  '## Overview',
  '## Instructions',
  '## Examples',
  '## Edge Cases',
  '## Anti-Patterns',
  '## References',
];
const SKILL_OVERVIEW_REQUIRED_SUBSECTIONS = ['### Inputs', '### Outputs', '### Halt Conditions'];
const SKILL_OVERVIEW_SUBSECTION_ORDER = [
  '### Inputs',
  '### Outputs',
  '### Halt Conditions',
  '### User Interaction',
  '### Runtime Requirements',
];

function lintRequiredSections(content, filePath, requiredSections, docType, errors) {
  const lines = content.split(/\r?\n/);
  const ignoredLines = findIgnoredMarkdownLines(lines);
  for (const section of requiredSections) {
    if (findHeadingLine(lines, ignoredLines, section) === -1) {
      errors.push(`${docType} is missing required section "${section}": ${toDisplayPath(filePath)} ${DOC_TYPE_POLICY_REF[docType] || ''}`);
    }
  }
}

function lintInitiativeExpectedEndDate(content, filePath, errors) {
  const lines = content.split(/\r?\n/);
  const ignoredLines = findIgnoredMarkdownLines(lines);
  const expectedEndDateLines = findFieldLines(lines, ignoredLines, 'Expected end date:');

  if (expectedEndDateLines.length === 0) {
    errors.push(`Initiative must include an Expected end date: field: ${toDisplayPath(filePath)} [_core-adr-policy-007]`);
    return;
  }

  if (expectedEndDateLines.length > 1) {
    errors.push(`Initiative must not repeat Expected end date: ${toDisplayPath(filePath)} [_core-adr-policy-007]`);
  }

  const sectionStart = findHeadingLine(lines, ignoredLines, '## Proposed Solution');
  const sectionEnd = sectionStart === -1
    ? -1
    : (findHeadingLines(lines, ignoredLines).find((index) => index > sectionStart) ?? lines.length);
  if (expectedEndDateLines.some((index) => index <= sectionStart || index >= sectionEnd)) {
    errors.push(`Initiative Expected end date: field must be inside the "## Proposed Solution" section: ${toDisplayPath(filePath)} [_core-adr-policy-007]`);
  }

  const value = lines[expectedEndDateLines[0]].slice('Expected end date:'.length).trim().replace(/\.$/, '');
  if (!isIsoDate(value)) {
    errors.push(`Initiative Expected end date: must be a valid ISO date in YYYY-MM-DD format: ${toDisplayPath(filePath)} [_core-adr-policy-007]`);
  }
}

function lintTypeIndex(indexPath, xdrsRoot, artifacts, errors, externalScopes = new Set()) {
  const content = fs.readFileSync(indexPath, 'utf8');
  const repoRoot = path.dirname(xdrsRoot);
  const localLinks = parseLocalLinks(content, path.dirname(indexPath), repoRoot);
  const linkedSet = new Set();
  const scopeName = path.relative(xdrsRoot, indexPath).split(path.sep)[0];
  const localScopePath = normalizePath(path.join(xdrsRoot, '_local'));

  for (const linkPath of localLinks) {
    if (!fs.existsSync(linkPath)) {
      if (isExternalScopeLink(linkPath, xdrsRoot, externalScopes)) continue;
      errors.push(`Broken link in canonical index ${toDisplayPath(indexPath)}: ${displayPath(indexPath, linkPath)} [_core-adr-policy-001]`);
      continue;
    }

    if (scopeName !== '_local' && (isPathInside(localScopePath, linkPath) || normalizePath(linkPath) === localScopePath)) {
      errors.push(`Non-_local document must not link into _local scope: ${displayPath(indexPath, linkPath)} [_core-adr-policy-001]`);
    }

    linkedSet.add(normalizePath(linkPath));
  }

  for (const artifactPath of artifacts) {
    if (!linkedSet.has(normalizePath(artifactPath))) {
      errors.push(`Canonical index ${toDisplayPath(indexPath)} is missing an entry for ${toDisplayPath(artifactPath)} [_core-adr-policy-001]`);
    }
  }
}

function lintOrphanAssets(assetsDir, documentPaths, xdrsRoot, errors, isCompiledScope = false) {
  if (!existsDirectory(assetsDir)) {
    return;
  }

  const sourcesDir = path.join(assetsDir, SOURCE_SNAPSHOT_DIR_NAME);
  if (isCompiledScope) {
    lintSourceSnapshotTracking(sourcesDir, errors);
  }

  const assetTree = collectAssetTree(assetsDir, errors);
  if (assetTree.files.length === 0 && assetTree.directories.length === 0) {
    return;
  }

  const repoRoot = path.dirname(xdrsRoot);
  const referencedAssets = new Set();

  for (const docPath of documentPaths) {
    if (!existsFile(docPath)) {
      continue;
    }
    const content = fs.readFileSync(docPath, 'utf8');
    const docDir = path.dirname(docPath);
    const links = parseLocalLinks(content, docDir, repoRoot);
    for (const linkPath of links) {
      referencedAssets.add(normalizePath(linkPath));
    }
  }

  for (const assetPath of assetTree.files) {
    if (isCompiledScope && isPathInside(sourcesDir, assetPath)) {
      continue;
    }
    if (!referencedAssets.has(assetPath)) {
      errors.push(`Orphan asset file not referenced by any document: ${toDisplayPath(assetPath)} [_core-adr-policy-001]`);
    }
  }

  // Lint slide/presentation files inside .assets
  for (const assetPath of assetTree.files) {
    if (isCompiledScope && isPathInside(sourcesDir, assetPath)) {
      continue;
    }
    const fileName = path.basename(assetPath);
    if (SLIDE_FILE_RE.test(fileName)) {
      lintSlideFile(assetPath, documentPaths, xdrsRoot, errors);
    }
  }
}

function lintSourceSnapshotTracking(sourcesDir, errors) {
  if (!existsDirectory(sourcesDir)) {
    return;
  }

  const entries = safeReadDir(sourcesDir, errors, `read source snapshot directory ${toDisplayPath(sourcesDir)}`);
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const trackingFilePath = path.join(sourcesDir, entry.name, SOURCE_TRACKING_FILE_NAME);
    if (!existsFile(trackingFilePath)) {
      errors.push(`Compiled source snapshot folder must contain a "${SOURCE_TRACKING_FILE_NAME}" tracking file: ${toDisplayPath(trackingFilePath)} [_core-adr-policy-019.12-source-storage-and-tracking]`);
      continue;
    }
    validateSourceTrackingFile(trackingFilePath, errors);
  }
}

function validateSourceTrackingFile(filePath, errors) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  if (firstNonEmptyLine(content) !== '# Source') {
    errors.push(`Source tracking file must start with a "# Source" heading: ${toDisplayPath(filePath)} [_core-adr-policy-019.12-source-storage-and-tracking]`);
  }

  const timestampRe = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
  for (const field of ['last-fetch-timestamp', 'last-compilation-timestamp']) {
    const fieldLine = lines.find((line) => line.trim().startsWith(`${field}:`));
    if (!fieldLine) {
      errors.push(`Source tracking file must include a "${field}:" line: ${toDisplayPath(filePath)} [_core-adr-policy-019.12-source-storage-and-tracking]`);
      continue;
    }
    const value = fieldLine.trim().slice(`${field}:`.length).trim();
    if (!timestampRe.test(value)) {
      errors.push(`Source tracking file "${field}" must match "YYYY-MM-DD HH:MM:SS": ${toDisplayPath(filePath)} [_core-adr-policy-019.12-source-storage-and-tracking]`);
    }
  }
}

function lintSlideFile(filePath, documentPaths, xdrsRoot, errors) {
  const fileName = path.basename(filePath);

  if (fileName !== fileName.toLowerCase()) {
    errors.push(`Slide file name must be lowercase: ${toDisplayPath(filePath)} [_core-adr-policy-009]`);
  }

  if (fileName.length > SLIDE_MAX_NAME_LENGTH) {
    errors.push(`Slide file name must be ${SLIDE_MAX_NAME_LENGTH} characters or fewer: ${toDisplayPath(filePath)} [_core-adr-policy-009]`);
  }

  const content = fs.readFileSync(filePath, 'utf8');

  const fm = extractFrontmatter(content);
  if (!fm.present) {
    errors.push(`Slide file must start with a YAML frontmatter block containing marp: true: ${toDisplayPath(filePath)} [_core-adr-policy-009]`);
  } else {
    const frontmatterBody = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1];
    const firstKey = frontmatterBody.trimStart().split(/\r?\n/)[0];
    if (!/^marp:\s*true$/.test(firstKey)) {
      errors.push(`Slide frontmatter must include marp: true as the first key: ${toDisplayPath(filePath)} [_core-adr-policy-009]`);
    }
  }

  lintNoEmojis(content, filePath, 'Slide', errors);

  // Check that the slide links back to at least one parent document
  const repoRoot = path.dirname(xdrsRoot);
  const slideDir = path.dirname(filePath);
  const slideLinks = parseLocalLinks(content, slideDir, repoRoot);
  const slideLinkSet = new Set(slideLinks.map(normalizePath));

  const linksToParent = documentPaths.some((docPath) => slideLinkSet.has(normalizePath(docPath)));
  if (!linksToParent) {
    errors.push(`Slide file must contain a link back to its parent document: ${toDisplayPath(filePath)} [_core-adr-policy-009]`);
  }

  // Check that at least one parent document links to this slide file
  const parentLinksToSlide = documentPaths.some((docPath) => {
    if (!existsFile(docPath)) return false;
    const docContent = fs.readFileSync(docPath, 'utf8');
    const docLinks = parseLocalLinks(docContent, path.dirname(docPath), repoRoot);
    return docLinks.some((l) => normalizePath(l) === normalizePath(filePath));
  });
  if (!parentLinksToSlide) {
    errors.push(`Parent document must contain a link to its slide file: ${toDisplayPath(filePath)} [_core-adr-policy-009]`);
  }
}

function collectAssetTree(dirPath, errors) {
  const files = [];
  const directories = [];
  const entries = safeReadDir(dirPath, errors, `read assets directory ${toDisplayPath(dirPath)}`);

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      directories.push(normalizePath(entryPath));
      const nestedTree = collectAssetTree(entryPath, errors);
      directories.push(...nestedTree.directories);
      files.push(...nestedTree.files);
      continue;
    }

    if (entry.isFile()) {
      files.push(normalizePath(entryPath));
    }
  }

  return { files, directories };
}

function lintDocumentLinks(documentPath, xdrsRoot, scopeName, errors, externalScopes = new Set()) {
  const lines = fs.readFileSync(documentPath, 'utf8').split(/\r?\n/);
  const ignoredLines = findIgnoredMarkdownLines(lines);
  const documentDir = path.dirname(documentPath);
  const resourceDir = path.join(documentDir, RESOURCE_DIR_NAME);
  const localScopePath = normalizePath(path.join(xdrsRoot, '_local'));
  const repoRoot = path.dirname(xdrsRoot);

  for (let index = 0; index < lines.length; index += 1) {
    if (ignoredLines[index]) {
      continue;
    }

    for (const link of parseLocalLinkTargets(lines[index], documentDir, repoRoot)) {
      const isResourceLink = shouldValidateResourceLink(link.rawTarget);

      if (!isResourceLink && link.isAbsolutePath) {
        errors.push(`Absolute path links are not allowed; use relative paths in ${toDisplayPath(documentPath)}:${index + 1}: ${link.rawTarget} [_core-adr-policy-001]`);
      }

      if (!fs.existsSync(link.resolvedPath)) {
        if (isExternalScopeLink(link.resolvedPath, xdrsRoot, externalScopes)) continue;
        if (isResourceLink) {
          errors.push(`Broken asset link in ${toDisplayPath(documentPath)}: ${link.rawTarget} [_core-adr-policy-001]`);
        } else {
          errors.push(`Broken local link in ${toDisplayPath(documentPath)}:${index + 1}: ${link.rawTarget} [_core-adr-policy-001]`);
        }
        continue;
      }

      if (scopeName !== '_local' && (isPathInside(localScopePath, link.resolvedPath) || normalizePath(link.resolvedPath) === localScopePath)) {
        errors.push(`Non-_local document must not link into _local scope in ${toDisplayPath(documentPath)}:${index + 1}: ${link.rawTarget} [_core-adr-policy-001]`);
      }

      if (isResourceLink && !isPathInside(resourceDir, link.resolvedPath)) {
        errors.push(`Asset links in ${toDisplayPath(documentPath)} must point to ${toDisplayPath(resourceDir)}: ${link.rawTarget} [_core-adr-policy-001]`);
      }

      if (isSourceSnapshotPath(link.resolvedPath)) {
        errors.push(`Document must not link directly to compiled-source snapshot content, which is not authoritative (see _core-adr-policy-019 rule 14) in ${toDisplayPath(documentPath)}:${index + 1}: ${link.rawTarget} [_core-adr-policy-019.14-source-documents-not-authoritative]`);
      }
    }
  }
}

function parseLocalLinks(markdown, baseDir, repoRoot) {
  return parseLocalLinkTargets(markdown, baseDir, repoRoot).map((link) => link.resolvedPath);
}

function parseLocalLinkTargets(markdown, baseDir, repoRoot) {
  const links = [];
  const linkRe = /!?\[[^\]]+\]\(([^)]+)\)/g;
  let match = linkRe.exec(markdown);
  while (match) {
    const rawTarget = match[1].trim();
    const normalizedTarget = normalizeLocalLinkTarget(rawTarget);
    if (normalizedTarget) {
      const isAbsolutePath = normalizedTarget.startsWith('/');
      links.push({
        rawTarget,
        resolvedPath: isAbsolutePath && repoRoot
          ? path.join(repoRoot, normalizedTarget)
          : path.resolve(baseDir, normalizedTarget),
        isAbsolutePath
      });
    }
    match = linkRe.exec(markdown);
  }
  return links;
}

function normalizeLocalLinkTarget(target) {
  if (!isLocalLink(target)) {
    return null;
  }

  const bracketWrappedTarget = target.match(/^<(.+)>$/);
  const cleanedTarget = bracketWrappedTarget ? bracketWrappedTarget[1] : target;

  return cleanedTarget.split('#')[0].split('?')[0] || null;
}

function isLocalLink(target) {
  return target !== ''
    && !target.startsWith('#')
    && !target.startsWith('http://')
    && !target.startsWith('https://')
    && !target.startsWith('mailto:');
}

function isCanonicalTypeIndex(filePath, xdrsRoot) {
  const relative = relativeFrom(xdrsRoot, filePath).split(path.sep);
  return relative.length === 3 && TYPE_NAMES.has(relative[1]) && relative[2] === 'index.md';
}

function isScopeIndex(filePath, xdrsRoot) {
  const relative = relativeFrom(xdrsRoot, filePath).split(path.sep);
  return relative.length === 2 && relative[1] === 'index.md';
}

function isExternalScopeLink(resolvedPath, xdrsRoot, externalScopes) {
  if (!isPathInside(xdrsRoot, resolvedPath)) return false;
  const relative = path.relative(xdrsRoot, resolvedPath);
  const parts = relative.split(path.sep);
  if (parts.length === 0 || !parts[0]) return false;
  const scopeName = parts[0];

  // Treat as external if explicitly listed via .filedist.lock OR if the scope directory
  // doesn't exist locally (e.g. hasn't been extracted from an external package yet)
  return externalScopes.has(scopeName) || !existsDirectory(path.join(xdrsRoot, scopeName));
}

function shouldValidateResourceLink(rawTarget) {
  const normalizedTargetPath = normalizeLocalLinkTarget(rawTarget);
  if (!normalizedTargetPath) {
    return false;
  }

  const normalizedTarget = normalizedTargetPath.replace(/\\/g, '/');
  const extension = path.extname(normalizedTargetPath).toLowerCase();

  return normalizedTarget === RESOURCE_DIR_NAME
    || normalizedTarget.startsWith(`${RESOURCE_DIR_NAME}/`)
    || normalizedTarget.includes(`/${RESOURCE_DIR_NAME}/`)
    || IMAGE_EXTENSIONS.has(extension);
}

function isSourceSnapshotPath(resolvedPath) {
  const normalized = normalizePath(resolvedPath).split(path.sep).join('/');
  return normalized.includes(`/${RESOURCE_DIR_NAME}/${SOURCE_SNAPSHOT_DIR_NAME}/`);
}

function extractDescriptionText(block) {
  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^description:\s*(.*)$/);
    if (!m) continue;
    const inlineValue = m[1].trim();
    if (inlineValue && inlineValue !== '>' && inlineValue !== '|') {
      return inlineValue;
    }
    // Block scalar: collect following indented lines
    const bodyLines = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j] === '' || /^\s+/.test(lines[j])) {
        bodyLines.push(lines[j].trim());
      } else {
        break;
      }
    }
    return bodyLines.join(' ').trim() || null;
  }
  return null;
}

function extractFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
  if (!match) {
    return { present: false, name: null, description: false, descriptionText: null, validFrom: undefined, appliedTo: undefined, topLevelKeys: [], metadata: { present: false, fields: {} } };
  }
  const block = match[1];
  const nameMatch = block.match(/^name:\s*(.+)$/m);
  const validFromMatch = block.match(/^valid-from:\s*(.+)$/m);
  const appliedToMatch = block.match(/^apply-to:\s*(.+)$/m);
  const topLevelKeys = [];
  for (const line of block.split('\n')) {
    const keyMatch = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*):\s*/);
    if (keyMatch) topLevelKeys.push(keyMatch[1]);
  }
  const freezeReferenceMatch = block.match(/^freeze-reference:\s*(.+)$/m);
  const descriptionText = extractDescriptionText(block);
  const metadata = extractMetadataBlock(block);
  return {
    present: true,
    name: nameMatch ? nameMatch[1].trim() || null : null,
    description: /^description:\s*\S/m.test(block),
    descriptionText,
    validFrom: validFromMatch ? validFromMatch[1].trim() : undefined,
    appliedTo: appliedToMatch ? appliedToMatch[1].trim() : undefined,
    freezeReference: freezeReferenceMatch ? freezeReferenceMatch[1].trim() === 'true' : false,
    metadata,
    topLevelKeys,
  };
}

/**
 * Parses the nested `metadata:` block within a frontmatter YAML block, if present.
 * Supports scalar values, quoted strings, inline arrays (`tags: [a, b]`), and
 * block-style lists (`tags:` followed by `  - a` / `  - b` lines).
 */
function extractMetadataBlock(block) {
  const lines = block.split('\n');
  const metadataIndex = lines.findIndex((line) => /^metadata:\s*$/.test(line));
  if (metadataIndex === -1) {
    return { present: false, fields: {} };
  }

  const fields = {};
  let i = metadataIndex + 1;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }
    if (!/^\s+\S/.test(line)) break; // back to a top-level (unindented) key: stop

    const kvMatch = line.match(/^\s+([a-zA-Z][a-zA-Z0-9_-]*):\s*(.*)$/);
    if (!kvMatch) { i++; continue; }

    const key = kvMatch[1];
    let rawValue = kvMatch[2].trim();

    if (rawValue === '') {
      // Possible block-style list on the following, more-indented lines.
      const listValues = [];
      let j = i + 1;
      while (j < lines.length) {
        const listMatch = lines[j].match(/^\s+-\s*(.+)$/);
        if (!listMatch) break;
        listValues.push(listMatch[1].trim().replace(/^["']|["']$/g, ''));
        j++;
      }
      if (listValues.length > 0) {
        fields[key] = listValues;
        i = j;
        continue;
      }
      fields[key] = '';
      i++;
      continue;
    }

    rawValue = rawValue.replace(/^["']|["']$/g, '');
    if (/^\[.*\]$/.test(rawValue)) {
      const inner = rawValue.slice(1, -1).trim();
      fields[key] = inner === '' ? [] : inner.split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      fields[key] = rawValue;
    }
    i++;
  }

  return { present: true, fields };
}

function stripFrontmatter(content) {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  return match ? content.slice(match[0].length) : content;
}

/**
 * Validate that a policy file follows the structured format defined in policy-008:
 * must have a "### Details" section and at least one "#### NN-rulename" rule block.
 */
function validateStructuredFormat(filePath, errors, errorCode) {
  let content;
  try { content = fs.readFileSync(filePath, 'utf8'); } catch { return; }
  validateStructuredFormatContent(content, filePath, errors, errorCode);
}

function validateStructuredFormatContent(content, filePath, errors, errorCode) {
  const body = stripFrontmatter(content);
  if (!/^### Details\s*$/m.test(body)) {
    errors.push(`Policy must have a "### Details" section: ${toDisplayPath(filePath)} [${errorCode}]`);
    return;
  }
  if (!/^#### \d{2}-[a-z][a-z0-9-]*$/m.test(body)) {
    errors.push(`Policy must have at least one structured rule block (#### NN-rulename) in ### Details: ${toDisplayPath(filePath)} [${errorCode}]`);
    return;
  }
  lintStructuredRuleBlocks(content, filePath, errors);
}

function lintCompiledPolicySourceSection(content, filePath, errors) {
  const lines = content.split(/\r?\n/);
  const ignoredLines = findIgnoredMarkdownLines(lines);
  const sourceStart = findHeadingLine(lines, ignoredLines, '## Source');
  if (sourceStart === -1) {
    errors.push(`Compiled policy must include a "## Source" section: ${toDisplayPath(filePath)} [_core-adr-policy-019.10-source-section]`);
    return;
  }
  // Find end of ## Source section (next ## heading or EOF)
  let sourceEnd = lines.length;
  for (let i = sourceStart + 1; i < lines.length; i++) {
    if (!ignoredLines[i] && /^## /.test(lines[i])) {
      sourceEnd = i;
      break;
    }
  }
  // Paths in ## Source MUST NOT be written as markdown links
  const MD_LINK_RE = /\[.+?\]\(.+?\)/;
  for (let i = sourceStart + 1; i < sourceEnd; i++) {
    if (!ignoredLines[i] && MD_LINK_RE.test(lines[i])) {
      errors.push(`Compiled policy "## Source" section must not use markdown links (use plain text paths): ${toDisplayPath(filePath)}:${i + 1} [_core-adr-policy-019.10-source-section]`);
      break;
    }
  }
}

function findIgnoredMarkdownLines(lines) {
  const ignored = [];
  let inCodeFence = false;
  let activeFence = null;

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      ignored[index] = true;
      if (activeFence === fenceMatch[1][0]) {
        activeFence = null;
        inCodeFence = false;
      } else if (activeFence === null) {
        activeFence = fenceMatch[1][0];
        inCodeFence = true;
      }
      continue;
    }

    ignored[index] = inCodeFence;
  }

  return ignored;
}

function findHeadingLine(lines, ignoredLines, headingText) {
  for (let index = 0; index < lines.length; index += 1) {
    if (ignoredLines[index]) {
      continue;
    }
    if (lines[index].trim() === headingText) {
      return index;
    }
  }
  return -1;
}

function findHeadingLines(lines, ignoredLines) {
  const result = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (ignoredLines[index]) {
      continue;
    }
    if (/^##\s+/.test(lines[index].trim())) {
      result.push(index);
    }
  }
  return result;
}

function findFieldLines(lines, ignoredLines, prefix) {
  const result = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (ignoredLines[index]) {
      continue;
    }
    if (lines[index].trim().startsWith(prefix)) {
      result.push(index);
    }
  }
  return result;
}

function isLineInsideRange(lineIndex, range) {
  return lineIndex >= range.start && lineIndex <= range.end;
}

function countWords(value) {
  return value.split(/\s+/).filter(Boolean).length;
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function firstNonEmptyLine(content) {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (line.trim() !== '') {
      return line.trim();
    }
  }
  return '';
}

function safeReadDir(dirPath, errors, operation) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (error) {
    errors.push(`Failed to ${operation}: ${toDisplayPath(dirPath)} (${error.message})`);
    return [];
  }
}

function isValidScopeName(scopeName) {
  if (RESERVED_SCOPES.has(scopeName)) {
    return true;
  }
  return /^[a-z0-9][a-z0-9-]*$/.test(scopeName);
}

function existsDirectory(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function existsFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function loadFiledist(repoRoot) {
  const filedistPath = path.join(repoRoot, '.filedist.lock');
  if (!existsFile(filedistPath)) {
    return new Set();
  }
  const content = fs.readFileSync(filedistPath, 'utf8');
  const paths = new Set();
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const parts = trimmed.split('|');
    if (parts.length >= 2) {
      paths.add(normalizePath(path.join(repoRoot, parts[0])));
    }
  }
  return paths;
}

function getExternalScopes(filedistPaths, xdrsRoot) {
  const externalScopes = new Set();
  for (const filePath of filedistPaths) {
    const relative = path.relative(xdrsRoot, filePath);
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
      const parts = relative.split(path.sep);
      if (parts.length >= 1 && parts[0]) {
        externalScopes.add(parts[0]);
      }
    }
  }
  return externalScopes;
}

function displayPath(indexPath, targetPath) {
  return `${toDisplayPath(indexPath)} -> ${toDisplayPath(targetPath)}`;
}

function toDisplayPath(targetPath) {
  return relativeFrom(process.cwd(), targetPath);
}

function relativeFrom(basePath, targetPath) {
  return path.relative(basePath, targetPath) || '.';
}

function normalizePath(filePath) {
  return path.normalize(filePath);
}

function isPathInside(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function lintStructuredRuleBlocks(content, filePath, errors) {
  const body = stripFrontmatter(content);
  const lines = body.split(/\r?\n/);
  const ignoredLines = findIgnoredMarkdownLines(lines);

  const ruleNumbers = new Map(); // number -> line index
  const ruleEntries = [];

  for (let i = 0; i < lines.length; i++) {
    if (ignoredLines[i]) continue;
    const m = lines[i].match(/^#### (\d+)-(.*)$/);
    if (!m) continue;
    const number = m[1];
    const title = m[2].trim();
    ruleEntries.push({ lineIndex: i, number, title });
  }

  for (let r = 0; r < ruleEntries.length; r++) {
    const { lineIndex, number, title } = ruleEntries[r];

    if (!/^\d{2}$/.test(number)) {
      errors.push(`Policy structured rule number must be exactly two digits ("${number}" in "${lines[lineIndex].trim()}"): ${toDisplayPath(filePath)} [_core-adr-policy-008.08-rule-block-must-use-standard-syntax]`);
    }

    if (title.length === 0 || !/^[a-z][a-z0-9-]*$/.test(title)) {
      if (/[A-Z]/.test(title)) {
        errors.push(`Policy structured rule title must be all lowercase ("${title}"): ${toDisplayPath(filePath)} [_core-adr-policy-008.05-rule-title-must-be-all-lowercase]`);
      } else {
        errors.push(`Policy structured rule title must be in kebab-case ("${title}"): ${toDisplayPath(filePath)} [_core-adr-policy-008.08-rule-block-must-use-standard-syntax]`);
      }
    }

    const wordCount = title.split('-').filter(Boolean).length;
    if (wordCount > 12) {
      errors.push(`Policy structured rule title must be 12 words or fewer ("${title}"): ${toDisplayPath(filePath)} [_core-adr-policy-008.08-rule-block-must-use-standard-syntax]`);
    }

    if (ruleNumbers.has(number)) {
      errors.push(`Duplicate structured rule number "${number}" in Policy: ${toDisplayPath(filePath)} [_core-adr-policy-008.02-rule-numbering-must-be-stable]`);
    } else {
      ruleNumbers.set(number, lineIndex);
    }

    const bodyStart = lineIndex + 1;
    let bodyEnd = lines.length;
    for (let i = bodyStart; i < lines.length; i++) {
      if (!ignoredLines[i] && /^#{1,4}/.test(lines[i])) {
        bodyEnd = i;
        break;
      }
    }
    const ruleBodyText = lines.slice(bodyStart, bodyEnd).join('\n');
    const ruleBodyNonCodeLines = lines.slice(bodyStart, bodyEnd).filter((_, idx) => !ignoredLines[bodyStart + idx]);
    const ruleBodyTextForEmphasis = ruleBodyNonCodeLines.join('\n');

    if (!NORMATIVE_KEYWORDS_RE.test(ruleBodyTextForEmphasis)) {
      errors.push(`Policy structured rule body must contain normative language (MUST/SHOULD/MAY) in "${number}-${title}": ${toDisplayPath(filePath)} [_core-adr-policy-008.03-rule-body-must-use-normative-language]`);
    }

    if (NORMATIVE_EMPHASIS_RE.test(ruleBodyTextForEmphasis)) {
      errors.push(`Policy structured rule body must not use bold or italic marks around normative keywords in "${number}-${title}": ${toDisplayPath(filePath)} [_core-adr-policy-008.06-normative-keywords-must-not-use-emphasis-marks]`);
    }
  }
}

function lintResearchSectionWordLimits(content, filePath, errors) {
  const lines = content.split(/\r?\n/);
  const ignoredLines = findIgnoredMarkdownLines(lines);

  const sectionStarts = {};
  for (let i = 0; i < lines.length; i++) {
    if (ignoredLines[i]) continue;
    const trimmed = lines[i].trim();
    for (const sectionName of Object.keys(RESEARCH_SECTION_LIMITS)) {
      if (trimmed === sectionName) {
        sectionStarts[sectionName] = i;
      }
    }
  }

  for (const sectionName of Object.keys(RESEARCH_SECTION_LIMITS)) {
    const startLine = sectionStarts[sectionName];
    if (startLine === undefined) continue;

    let endLine = lines.length;
    for (let i = startLine + 1; i < lines.length; i++) {
      if (!ignoredLines[i] && /^## /.test(lines[i].trim())) {
        endLine = i;
        break;
      }
    }

    const sectionText = lines.slice(startLine + 1, endLine).join(' ');
    const wordCount = countWords(sectionText);
    const limit = RESEARCH_SECTION_LIMITS[sectionName];

    if (wordCount > limit) {
      errors.push(`Research ${sectionName} section exceeds ${limit} words (${wordCount} words): ${toDisplayPath(filePath)} [_core-adr-policy-006]`);
    }
  }
}

module.exports = {
  runLintCli,
  lintWorkspace
};

if (require.main === module) {
  process.exitCode = runLintCli(process.argv.slice(2));
}