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
  adrs: new Set(['principles', 'application', 'data', 'integration', 'platform', 'controls', 'operations']),
  bdrs: new Set(['principles', 'marketing', 'product', 'controls', 'operations', 'organization', 'finance', 'sustainability']),
  edrs: new Set(['principles', 'application', 'infra', 'observability', 'devops', 'governance'])
};

const TYPE_NAMES = new Set(Object.keys(TYPE_TO_ID));
const RESERVED_SCOPES = new Set(['_core', '_local']);
const SCOPE_TYPE_NAMES = new Set(['core', 'reference', 'platform', 'domain', '_local']);
const NUMBERED_FILE_RE = /^(\d{3,})-([a-z0-9-]+)\.md$/;
const NUMBERED_DIR_RE = /^(\d{3,})-([a-z0-9-]+)$/;
const REQUIRED_ROOT_INDEX_TEXT = 'XDRS scopes listed last override the ones listed first';
const SUBJECT_ARTIFACT_DIRS = new Set(['skills', 'articles', 'researches', 'plans']);
const RESOURCE_DIR_NAME = '.assets';
const SKILL_PACKAGE_OPTIONAL_DIRS = new Set(['scripts', 'references', RESOURCE_DIR_NAME]);

const POLICY_ALLOWED_FRONTMATTER_KEYS = new Set(['name', 'description', 'apply-to', 'valid-from', 'license', 'metadata']);
const SKILL_ALLOWED_FRONTMATTER_KEYS = new Set(['name', 'description', 'license', 'metadata', 'compatibility', 'allowed-tools']);
const SCOPE_INDEX_ALLOWED_FRONTMATTER_KEYS = new Set(['scope-type', 'name', 'description', 'apply-to', 'valid-from', 'license', 'metadata', 'follows']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp']);
const SLIDE_FILE_RE = /^.+-slides(?:-[a-z0-9-]+)?\.md$/;
const SLIDE_MAX_NAME_LENGTH = 64;
const EMOJI_RE = /\p{Extended_Pictographic}/u;
const POLICY_MAX_WORDS = 2600;
const ARTICLE_MAX_WORDS = 8000;
const RESEARCH_MAX_WORDS = 5000;
const SKILL_MAX_WORDS = 6500;

function runLintCli(args) {
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return 0;
  }

  const all = args.includes('--all');
  const pathArgs = args.filter((a) => !a.startsWith('--'));
  const targetPath = pathArgs[0] || '.';
  const result = lintWorkspace(targetPath, { ignoreExternal: !all });

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

  if (!existsDirectory(xdrsRoot)) {
    errors.push(`Missing XDRS root directory: ${toDisplayPath(xdrsRoot)}`);
    return { xdrsRoot, errors };
  }

  const repoRoot = path.dirname(xdrsRoot);
  const filedistPaths = loadFiledist(repoRoot);
  const externalScopes = getExternalScopes(filedistPaths, xdrsRoot);
  const effectiveExternalScopes = ignoreExternal ? externalScopes : new Set();

  const actualTypeIndexes = [];
  const rootEntries = safeReadDir(xdrsRoot, errors, 'read XDRS root directory');
  const scopeEntries = rootEntries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'));

  for (const entry of rootEntries) {
    if (entry.isFile() && entry.name !== 'index.md') {
      errors.push(`Unexpected file at .xdrs root: ${entry.name}`);
    }
  }

  for (const scopeEntry of scopeEntries) {
    lintScopeDirectory(xdrsRoot, scopeEntry.name, errors, actualTypeIndexes, ignoreExternal, effectiveExternalScopes);
  }

  const rootIndexPath = path.join(xdrsRoot, 'index.md');
  if (!existsFile(rootIndexPath)) {
    errors.push('Missing required root index: .xdrs/index.md');
  } else {
    lintRootIndex(rootIndexPath, xdrsRoot, actualTypeIndexes, errors, effectiveExternalScopes);
  }

  return { xdrsRoot, errors };
}

function lintRootIndex(rootIndexPath, xdrsRoot, actualTypeIndexes, errors, externalScopes = new Set()) {
  const content = fs.readFileSync(rootIndexPath, 'utf8');
  const repoRoot = path.dirname(xdrsRoot);

  if (!content.includes(REQUIRED_ROOT_INDEX_TEXT)) {
    errors.push(`Root index is missing required override text: ${toDisplayPath(rootIndexPath)}`);
  }

  const links = parseLocalLinks(content, path.dirname(rootIndexPath), repoRoot);
  for (const linkPath of links) {
    if (!fs.existsSync(linkPath)) {
      if (isExternalScopeLink(linkPath, xdrsRoot, externalScopes)) continue;
      errors.push(`Broken link in root index: ${displayPath(rootIndexPath, linkPath)}`);
    }
  }

  const linkedScopeIndexes = links.filter((linkPath) => isScopeIndex(linkPath, xdrsRoot));
  const linkedSet = new Set(linkedScopeIndexes.map(normalizePath));
  const localScopePath = normalizePath(path.join(xdrsRoot, '_local'));

  for (const linkPath of links) {
    if (isPathInside(localScopePath, linkPath) || normalizePath(linkPath) === localScopePath) {
      errors.push(`Root index must not link into _local scope: ${displayPath(rootIndexPath, linkPath)}`);
    }
  }

  // Collect non-_local scopes that have type indexes and check their scope index is linked
  const scopesWithTypeIndexes = new Set();
  for (const indexPath of actualTypeIndexes) {
    const scopeName = path.basename(path.dirname(path.dirname(indexPath)));
    if (scopeName !== '_local') {
      scopesWithTypeIndexes.add(scopeName);
    }
  }

  for (const scopeName of scopesWithTypeIndexes) {
    const scopeIndexPath = normalizePath(path.join(xdrsRoot, scopeName, 'index.md'));
    if (!linkedSet.has(scopeIndexPath)) {
      errors.push(`Root index is missing scope index link: ${toDisplayPath(path.join(xdrsRoot, scopeName, 'index.md'))}`);
    }
  }
}

function lintScopeIndex(scopeIndexPath, xdrsRoot, scopeName, typeIndexesInScope, errors, externalScopes = new Set()) {
  const content = fs.readFileSync(scopeIndexPath, 'utf8');
  const repoRoot = path.dirname(xdrsRoot);
  const links = parseLocalLinks(content, path.dirname(scopeIndexPath), repoRoot);
  const linkedSet = new Set(links.map(normalizePath));

  for (const linkPath of links) {
    if (!fs.existsSync(linkPath)) {
      if (isExternalScopeLink(linkPath, xdrsRoot, externalScopes)) continue;
      errors.push(`Broken link in scope index: ${displayPath(scopeIndexPath, linkPath)}`);
    }
  }

  for (const typeIndexPath of typeIndexesInScope) {
    if (!linkedSet.has(normalizePath(typeIndexPath))) {
      errors.push(`Scope index ${toDisplayPath(scopeIndexPath)} is missing link to type index: ${toDisplayPath(typeIndexPath)}`);
    }
  }
}

function lintScopeIndexFrontmatter(scopeIndexPath, scopeName, errors, xdrsRoot) {
  const content = fs.readFileSync(scopeIndexPath, 'utf8');
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!fmMatch) {
    errors.push(`Scope index must start with a YAML frontmatter block: ${toDisplayPath(scopeIndexPath)}`);
    return;
  }
  const block = fmMatch[1];
  const fm = extractFrontmatter(content);

  for (const key of fm.topLevelKeys) {
    if (!SCOPE_INDEX_ALLOWED_FRONTMATTER_KEYS.has(key)) {
      errors.push(`Scope index frontmatter has unknown field "${key}": ${toDisplayPath(scopeIndexPath)}`);
    }
  }

  const scopeTypeMatch = block.match(/^scope-type:\s*(.+)$/m);
  const scopeType = scopeTypeMatch ? scopeTypeMatch[1].trim() : null;
  if (!scopeType) {
    errors.push(`Scope index frontmatter must include a scope-type field: ${toDisplayPath(scopeIndexPath)}`);
    return;
  }
  if (!SCOPE_TYPE_NAMES.has(scopeType)) {
    errors.push(`Scope index scope-type must be one of [${[...SCOPE_TYPE_NAMES].join(', ')}]: ${toDisplayPath(scopeIndexPath)}`);
    return;
  }
  if (scopeName === '_core' && scopeType !== 'core') {
    errors.push(`Scope "_core" must have scope-type "core": ${toDisplayPath(scopeIndexPath)}`);
  }
  if (scopeName === '_local' && scopeType !== '_local') {
    errors.push(`Scope "_local" must have scope-type "_local": ${toDisplayPath(scopeIndexPath)}`);
  }
  if (scopeType === 'core' && !scopeName.includes('core')) {
    errors.push(`Scope with type "core" must have "core" in its name: ${toDisplayPath(scopeIndexPath)}`);
  }
  if (scopeType === '_local' && scopeName !== '_local') {
    errors.push(`Scope type "_local" is reserved for the "_local" scope: ${toDisplayPath(scopeIndexPath)}`);
  }
  if (scopeType === 'reference' && !scopeName.includes('reference')) {
    errors.push(`Scope with type "reference" must have "reference" in its name: ${toDisplayPath(scopeIndexPath)}`);
  }
  if (scopeType === 'platform' && !scopeName.includes('platform')) {
    errors.push(`Scope with type "platform" must have "platform" in its name: ${toDisplayPath(scopeIndexPath)}`);
  }

  if (!fm.name) {
    errors.push(`Scope index frontmatter must include a non-empty name field: ${toDisplayPath(scopeIndexPath)}`);
  } else if (fm.name !== scopeName) {
    errors.push(`Scope index frontmatter name must match scope directory name "${scopeName}": ${toDisplayPath(scopeIndexPath)}`);
  }

  if (!fm.description) {
    errors.push(`Scope index frontmatter must include a non-empty description field: ${toDisplayPath(scopeIndexPath)}`);
  } else if (fm.descriptionText && fm.descriptionText.length > 1024) {
    errors.push(`Scope index frontmatter description must be 1024 characters or fewer: ${toDisplayPath(scopeIndexPath)}`);
  }

  if (!fm.appliedTo) {
    errors.push(`Scope index frontmatter must include an apply-to field: ${toDisplayPath(scopeIndexPath)}`);
  } else {
    const words = countWords(fm.appliedTo);
    if (words === 0) {
      errors.push(`Scope index frontmatter apply-to must not be empty: ${toDisplayPath(scopeIndexPath)}`);
    } else if (words >= 40) {
      errors.push(`Scope index frontmatter apply-to must be under 40 words: ${toDisplayPath(scopeIndexPath)}`);
    }
  }

  if (!fm.validFrom) {
    errors.push(`Scope index frontmatter must include a valid-from field: ${toDisplayPath(scopeIndexPath)}`);
  } else if (!isIsoDate(fm.validFrom)) {
    errors.push(`Scope index frontmatter valid-from must be a valid ISO date YYYY-MM-DD: ${toDisplayPath(scopeIndexPath)}`);
  }

  const followsLineMatch = block.match(/^follows:[ \t]*(.*)/m);
  if (followsLineMatch !== null) {
    const followsValue = followsLineMatch[1].trim();
    const scopeNamePattern = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
    if (followsValue) {
      if (!scopeNamePattern.test(followsValue)) {
        errors.push(`Scope index frontmatter follows must be a core scope name or list of core scope names: ${toDisplayPath(scopeIndexPath)}`);
      }
    } else {
      const followsStart = block.indexOf(followsLineMatch[0]) + followsLineMatch[0].length;
      const listItems = [];
      let hasInvalidEntry = false;
      for (const line of block.slice(followsStart).split('\n')) {
        const itemMatch = line.match(/^\s+-\s*(\S.*)?$/);
        if (itemMatch) {
          const item = (itemMatch[1] || '').trim();
          if (!item || !scopeNamePattern.test(item)) {
            errors.push(`Scope index frontmatter follows entries must be non-empty scope names: ${toDisplayPath(scopeIndexPath)}`);
            hasInvalidEntry = true;
            break;
          }
          listItems.push(item);
        } else if (line.trim() && !/^\s/.test(line)) {
          break;
        }
      }
      if (!hasInvalidEntry && listItems.length === 0) {
        errors.push(`Scope index frontmatter follows must be a core scope name or list of core scope names: ${toDisplayPath(scopeIndexPath)}`);
      }
    }
    if (xdrsRoot) {
      const entries = followsValue ? [followsValue] : (() => {
        const items = [];
        const followsStart = block.indexOf(followsLineMatch[0]) + followsLineMatch[0].length;
        for (const line of block.slice(followsStart).split('\n')) {
          const itemMatch = line.match(/^\s+-\s*(\S.*)?$/);
          if (itemMatch && itemMatch[1]) items.push(itemMatch[1].trim());
          else if (line.trim() && !/^\s/.test(line)) break;
        }
        return items;
      })();
      for (const entry of entries) {
        if (/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(entry) && !existsFile(path.join(xdrsRoot, entry, 'index.md'))) {
          errors.push(`Scope index frontmatter follows references scope "${entry}" which does not exist in the workspace: ${toDisplayPath(scopeIndexPath)}`);
        }
      }
    }
  }
}

function lintScopeDirectory(xdrsRoot, scopeName, errors, actualTypeIndexes, ignoreExternal, externalScopes) {
  const scopePath = path.join(xdrsRoot, scopeName);

  if (ignoreExternal && externalScopes.has(scopeName)) {
    return;
  }

  if (!isValidScopeName(scopeName)) {
    errors.push(`Invalid scope name: ${toDisplayPath(scopePath)}`);
  }

  const typeIndexesInScope = [];
  const entries = safeReadDir(scopePath, errors, `read scope directory ${scopeName}`);
  for (const entry of entries) {
    const entryPath = path.join(scopePath, entry.name);
    if (entry.isDirectory()) {
      if (!TYPE_NAMES.has(entry.name)) {
        errors.push(`Unexpected directory under scope ${scopeName}: ${toDisplayPath(entryPath)}`);
        continue;
      }
      lintTypeDirectory(xdrsRoot, scopeName, entry.name, errors, actualTypeIndexes, externalScopes);
      const typeIndexPath = path.join(entryPath, 'index.md');
      if (existsFile(typeIndexPath)) {
        typeIndexesInScope.push(typeIndexPath);
      }
      continue;
    }

    if (entry.name === 'index.md') {
      continue;
    }

    errors.push(`Unexpected file under scope ${scopeName}: ${toDisplayPath(entryPath)}`);
  }

  const scopeIndexPath = path.join(scopePath, 'index.md');
  if (!existsFile(scopeIndexPath)) {
    errors.push(`Missing required scope index: ${toDisplayPath(scopeIndexPath)}`);
  } else {
    lintScopeIndex(scopeIndexPath, xdrsRoot, scopeName, typeIndexesInScope, errors, externalScopes);
    lintScopeIndexFrontmatter(scopeIndexPath, scopeName, errors, xdrsRoot);
  }
}

function lintTypeDirectory(xdrsRoot, scopeName, typeName, errors, actualTypeIndexes, externalScopes = new Set()) {
  const typePath = path.join(xdrsRoot, scopeName, typeName);
  const indexPath = path.join(typePath, 'index.md');
  const xdrsNumbers = new Map();
  const artifacts = [];

  if (!existsFile(indexPath)) {
    errors.push(`Missing canonical index: ${toDisplayPath(indexPath)}`);
  } else {
    actualTypeIndexes.push(indexPath);
  }

  const entries = safeReadDir(typePath, errors, `read type directory ${scopeName}/${typeName}`);
  for (const entry of entries) {
    const entryPath = path.join(typePath, entry.name);
    if (entry.isFile()) {
      if (entry.name !== 'index.md') {
        errors.push(`Unexpected file under ${scopeName}/${typeName}: ${toDisplayPath(entryPath)}`);
      }
      continue;
    }

    if (!ALLOWED_SUBJECTS[typeName].has(entry.name)) {
      errors.push(`Invalid subject folder for ${typeName}: ${toDisplayPath(entryPath)}`);
      continue;
    }

    artifacts.push(...lintSubjectDirectory(xdrsRoot, scopeName, typeName, entry.name, xdrsNumbers, errors, externalScopes));
  }

  if (existsFile(indexPath)) {
    lintTypeIndex(indexPath, xdrsRoot, artifacts, errors, externalScopes);
  }
}

function lintSubjectDirectory(xdrsRoot, scopeName, typeName, subjectName, xdrsNumbers, errors, externalScopes = new Set()) {
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
        artifacts.push(...lintSkillsDirectory(xdrsRoot, scopeName, typeName, subjectName, entryPath, errors, externalScopes));
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
      if (entry.name === 'plans') {
        artifacts.push(...lintPlansDirectory(xdrsRoot, scopeName, typeName, subjectName, entryPath, errors, externalScopes));
        continue;
      }

      errors.push(`Unexpected directory under ${scopeName}/${typeName}/${subjectName}: ${toDisplayPath(entryPath)}`);
      continue;
    }

    if (!NUMBERED_FILE_RE.test(entry.name)) {
      errors.push(`Invalid Policy file name: ${toDisplayPath(entryPath)}`);
      continue;
    }

    artifacts.push(entryPath);
    lintXdrsElementFile(xdrsRoot, scopeName, typeName, entryPath, xdrsNumbers, errors, externalScopes);
  }

  const subjectAssetsDir = path.join(subjectPath, RESOURCE_DIR_NAME);
  const xdrsDocsInSubject = artifacts.filter((p) => path.dirname(p) === subjectPath);
  lintOrphanAssets(subjectAssetsDir, xdrsDocsInSubject, xdrsRoot, errors);

  return artifacts;
}

function lintXdrsElementFile(xdrsRoot, scopeName, typeName, filePath, xdrsNumbers, errors, externalScopes = new Set()) {
  const baseName = path.basename(filePath);
  const match = baseName.match(NUMBERED_FILE_RE);
  if (!match) {
    return;
  }

  const number = match[1];
  const previous = xdrsNumbers.get(number);
  if (previous) {
    errors.push(`Duplicate Policy number ${number} in ${scopeName}/${typeName}: ${toDisplayPath(previous)} and ${toDisplayPath(filePath)}`);
  } else {
    xdrsNumbers.set(number, filePath);
  }

  if (baseName !== baseName.toLowerCase()) {
    errors.push(`Policy file name must be lowercase: ${toDisplayPath(filePath)}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const expectedHeader = `# ${scopeName}-${TYPE_TO_ID[typeName]}-${number}:`;
  const firstLine = firstNonEmptyLine(stripFrontmatter(content));
  if (!firstLine.startsWith(expectedHeader)) {
    errors.push(`Policy title must start with "${expectedHeader}": ${toDisplayPath(filePath)}`);
  }

  const expectedName = extractExpectedXdrsNameFromHeading(firstLine)
    || `${scopeName}-${TYPE_TO_ID[typeName]}-${number}-${match[2]}`;
  lintXdrsElementFrontmatter(content, expectedName, filePath, errors);
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

function lintXdrsElementFrontmatter(content, expectedName, filePath, errors) {
  const fm = extractFrontmatter(content);
  if (!fm.present) {
    errors.push(`Policy must start with a YAML frontmatter block: ${toDisplayPath(filePath)}`);
    return;
  }
  if (!fm.name) {
    errors.push(`Policy frontmatter must include a non-empty name field: ${toDisplayPath(filePath)}`);
  } else {
    if (fm.name !== expectedName) {
      errors.push(`Policy frontmatter name must be "${expectedName}": ${toDisplayPath(filePath)}`);
    }
    if (fm.name.length > 64) {
      errors.push(`Policy frontmatter name must be 64 characters or fewer: ${toDisplayPath(filePath)}`);
    }
  }
  if (!fm.description) {
    errors.push(`Policy frontmatter must include a non-empty description field: ${toDisplayPath(filePath)}`);
  } else if (fm.descriptionText && fm.descriptionText.length > 1024) {
    errors.push(`Policy frontmatter description must be 1024 characters or fewer: ${toDisplayPath(filePath)}`);
  }
  if (!fm.validFrom) {
    errors.push(`Policy frontmatter must include a valid-from field: ${toDisplayPath(filePath)}`);
  } else if (!isIsoDate(fm.validFrom)) {
    errors.push(`Policy frontmatter valid-from must be a valid ISO date YYYY-MM-DD: ${toDisplayPath(filePath)}`);
  }
  if (!fm.appliedTo) {
    errors.push(`Policy frontmatter must include an apply-to field: ${toDisplayPath(filePath)}`);
  } else {
    const words = countWords(fm.appliedTo);
    if (words === 0) {
      errors.push(`Policy frontmatter apply-to must not be empty: ${toDisplayPath(filePath)}`);
    } else if (words >= 40) {
      errors.push(`Policy frontmatter apply-to must be under 40 words: ${toDisplayPath(filePath)}`);
    }
  }
  for (const key of fm.topLevelKeys) {
    if (!POLICY_ALLOWED_FRONTMATTER_KEYS.has(key)) {
      errors.push(`Policy frontmatter has unknown field "${key}": ${toDisplayPath(filePath)}`);
    }
  }
}

function lintSkillsDirectory(xdrsRoot, scopeName, typeName, subjectName, skillsPath, errors, externalScopes = new Set()) {
  const artifacts = [];
  const skillNumbers = new Map();
  const entries = safeReadDir(skillsPath, errors, `read skills directory ${scopeName}/${typeName}/${subjectName}/skills`);

  for (const entry of entries) {
    const entryPath = path.join(skillsPath, entry.name);
    if (!entry.isDirectory()) {
      errors.push(`Unexpected file in skills directory: ${toDisplayPath(entryPath)}`);
      continue;
    }

    const match = entry.name.match(NUMBERED_DIR_RE);
    if (!match) {
      errors.push(`Invalid skill package name: ${toDisplayPath(entryPath)}`);
      continue;
    }

    const number = match[1];
    const previous = skillNumbers.get(number);
    if (previous) {
      errors.push(`Duplicate skill number ${number} in ${scopeName}/${typeName}/${subjectName}/skills: ${toDisplayPath(previous)} and ${toDisplayPath(entryPath)}`);
    } else {
      skillNumbers.set(number, entryPath);
    }

    if (entry.name !== entry.name.toLowerCase()) {
      errors.push(`Skill package name must be lowercase: ${toDisplayPath(entryPath)}`);
    }

    const skillFilePath = path.join(entryPath, 'SKILL.md');
    const packageEntries = safeReadDir(entryPath, errors, `read skill package ${toDisplayPath(entryPath)}`);

    for (const packageEntry of packageEntries) {
      const packageEntryPath = path.join(entryPath, packageEntry.name);

      if (!packageEntry.isDirectory()) {
        continue;
      }

      if (SKILL_PACKAGE_OPTIONAL_DIRS.has(packageEntry.name)) {
        continue;
      }

      errors.push(`Unexpected directory in skill package: ${toDisplayPath(packageEntryPath)}`);
    }

    if (!existsFile(skillFilePath)) {
      errors.push(`Missing SKILL.md in skill package: ${toDisplayPath(entryPath)}`);
      continue;
    }

    artifacts.push(skillFilePath);

    const skillContent = fs.readFileSync(skillFilePath, 'utf8');
    lintRequiredSections(skillContent, skillFilePath, SKILL_REQUIRED_SECTIONS, 'Skill', errors);
    const skillFm = extractFrontmatter(skillContent);
    if (!skillFm.present) {
      errors.push(`SKILL.md must start with a YAML frontmatter block: ${toDisplayPath(skillFilePath)}`);
    } else {
      if (!skillFm.name) {
        errors.push(`SKILL.md frontmatter must include a non-empty name field: ${toDisplayPath(skillFilePath)}`);
      } else {
        const expectedSkillName = `${number}-${match[2]}`;
        if (skillFm.name !== expectedSkillName) {
          errors.push(`Skill frontmatter name must be "${expectedSkillName}": ${toDisplayPath(skillFilePath)}`);
        }
        if (skillFm.name.length > 64) {
          errors.push(`SKILL.md frontmatter name must be 64 characters or fewer: ${toDisplayPath(skillFilePath)}`);
        }
      }
      if (!skillFm.description) {
        errors.push(`SKILL.md frontmatter must include a non-empty description field: ${toDisplayPath(skillFilePath)}`);
      } else if (skillFm.descriptionText && skillFm.descriptionText.length > 1024) {
        errors.push(`SKILL.md frontmatter description must be 1024 characters or fewer: ${toDisplayPath(skillFilePath)}`);
      }
      for (const key of skillFm.topLevelKeys) {
        if (!SKILL_ALLOWED_FRONTMATTER_KEYS.has(key)) {
          errors.push(`SKILL.md frontmatter has unknown field "${key}": ${toDisplayPath(skillFilePath)}`);
        }
      }
    }

    lintNoEmojis(skillContent, skillFilePath, 'Skill', errors);
    lintWordCount(skillContent, skillFilePath, 'Skill', SKILL_MAX_WORDS, errors);
    lintDocumentLinks(skillFilePath, xdrsRoot, scopeName, errors, externalScopes);
    lintOrphanAssets(path.join(entryPath, RESOURCE_DIR_NAME), [skillFilePath], xdrsRoot, errors);
  }

  return artifacts;
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
      errors.push(`Unexpected directory in articles folder: ${toDisplayPath(entryPath)}`);
      continue;
    }

    const match = entry.name.match(NUMBERED_FILE_RE);
    if (!match) {
      errors.push(`Invalid article file name: ${toDisplayPath(entryPath)}`);
      continue;
    }

    artifacts.push(entryPath);

    const number = match[1];
    const previous = articleNumbers.get(number);
    if (previous) {
      errors.push(`Duplicate article number ${number} in ${scopeName}/${typeName}/${subjectName}/articles: ${toDisplayPath(previous)} and ${toDisplayPath(entryPath)}`);
    } else {
      articleNumbers.set(number, entryPath);
    }

    if (entry.name !== entry.name.toLowerCase()) {
      errors.push(`Article file name must be lowercase: ${toDisplayPath(entryPath)}`);
    }

    const content = fs.readFileSync(entryPath, 'utf8');
    const typeId = TYPE_TO_ID[typeName].split('-')[0]; // 'adr', 'bdr', or 'edr'
    const expectedHeader = `# ${scopeName}-${typeId}-article-${number}:`;
    const firstLine = firstNonEmptyLine(content);
    if (!firstLine.startsWith(expectedHeader)) {
      errors.push(`Article title must start with "${expectedHeader}": ${toDisplayPath(entryPath)}`);
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
      errors.push(`Unexpected directory in researches folder: ${toDisplayPath(entryPath)}`);
      continue;
    }

    const match = entry.name.match(NUMBERED_FILE_RE);
    if (!match) {
      errors.push(`Invalid research file name: ${toDisplayPath(entryPath)}`);
      continue;
    }

    artifacts.push(entryPath);

    const number = match[1];
    const previous = researchNumbers.get(number);
    if (previous) {
      errors.push(`Duplicate research number ${number} in ${scopeName}/${typeName}/${subjectName}/researches: ${toDisplayPath(previous)} and ${toDisplayPath(entryPath)}`);
    } else {
      researchNumbers.set(number, entryPath);
    }

    if (entry.name !== entry.name.toLowerCase()) {
      errors.push(`Research file name must be lowercase: ${toDisplayPath(entryPath)}`);
    }

    const content = fs.readFileSync(entryPath, 'utf8');
    const typeId = TYPE_TO_ID[typeName].split('-')[0]; // 'adr', 'bdr', or 'edr'
    const expectedHeader = `# ${scopeName}-${typeId}-research-${number}:`;
    const firstLine = firstNonEmptyLine(content);
    if (!firstLine.startsWith(expectedHeader)) {
      errors.push(`Research title must start with "${expectedHeader}": ${toDisplayPath(entryPath)}`);
    }

    lintRequiredSections(content, entryPath, RESEARCH_REQUIRED_SECTIONS, 'Research', errors);
    lintResearchIntroductionQuestion(content, entryPath, errors);
    lintNoEmojis(content, entryPath, 'Research', errors);
    lintWordCount(content, entryPath, 'Research', RESEARCH_MAX_WORDS, errors);
    lintDocumentLinks(entryPath, xdrsRoot, scopeName, errors, externalScopes);
  }

  lintOrphanAssets(path.join(researchPath, RESOURCE_DIR_NAME), artifacts, xdrsRoot, errors);

  return artifacts;
}

function lintPlansDirectory(xdrsRoot, scopeName, typeName, subjectName, plansPath, errors, externalScopes = new Set()) {
  const artifacts = [];
  const planNumbers = new Map();
  const entries = safeReadDir(plansPath, errors, `read plans directory ${scopeName}/${typeName}/${subjectName}/plans`);

  for (const entry of entries) {
    const entryPath = path.join(plansPath, entry.name);
    if (entry.isDirectory() && entry.name === RESOURCE_DIR_NAME) {
      continue;
    }

    if (!entry.isFile()) {
      errors.push(`Unexpected directory in plans folder: ${toDisplayPath(entryPath)}`);
      continue;
    }

    const match = entry.name.match(NUMBERED_FILE_RE);
    if (!match) {
      errors.push(`Invalid plan file name: ${toDisplayPath(entryPath)}`);
      continue;
    }

    artifacts.push(entryPath);

    const number = match[1];
    const previous = planNumbers.get(number);
    if (previous) {
      errors.push(`Duplicate plan number ${number} in ${scopeName}/${typeName}/${subjectName}/plans: ${toDisplayPath(previous)} and ${toDisplayPath(entryPath)}`);
    } else {
      planNumbers.set(number, entryPath);
    }

    if (entry.name !== entry.name.toLowerCase()) {
      errors.push(`Plan file name must be lowercase: ${toDisplayPath(entryPath)}`);
    }

    const content = fs.readFileSync(entryPath, 'utf8');
    const typeId = TYPE_TO_ID[typeName].split('-')[0]; // 'adr', 'bdr', or 'edr'
    const expectedHeader = `# ${scopeName}-${typeId}-plan-${number}:`;
    const firstLine = firstNonEmptyLine(content);
    if (!firstLine.startsWith(expectedHeader)) {
      errors.push(`Plan title must start with "${expectedHeader}": ${toDisplayPath(entryPath)}`);
    }

    lintRequiredSections(content, entryPath, PLAN_REQUIRED_SECTIONS, 'Plan', errors);
    lintPlanExpectedEndDate(content, entryPath, errors);
    lintNoEmojis(content, entryPath, 'Plan', errors);
    lintDocumentLinks(entryPath, xdrsRoot, scopeName, errors, externalScopes);
  }

  lintOrphanAssets(path.join(plansPath, RESOURCE_DIR_NAME), artifacts, xdrsRoot, errors);

  return artifacts;
}

function lintNoEmojis(content, filePath, docType, errors) {
  const lines = content.split(/\r?\n/);
  const ignoredLines = findIgnoredMarkdownLines(lines);
  for (let i = 0; i < lines.length; i++) {
    if (ignoredLines[i]) continue;
    if (EMOJI_RE.test(lines[i])) {
      errors.push(`${docType} must not contain emojis: ${toDisplayPath(filePath)}:${i + 1}`);
    }
  }
}

function lintWordCount(content, filePath, docType, maxWords, errors) {
  const body = stripFrontmatter(content);
  const wordCount = countWords(body);
  if (wordCount > maxWords) {
    errors.push(`${docType} exceeds maximum word count of ${maxWords} (${wordCount} words): ${toDisplayPath(filePath)}`);
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
    errors.push(`Research ## Introduction must contain a "Question:" line: ${toDisplayPath(filePath)}`);
  }
}

const XDRS_REQUIRED_SECTIONS = ['## Context and Problem Statement', '## Decision Outcome'];
const ARTICLE_REQUIRED_SECTIONS = ['## Overview', '## Content', '## References'];
const RESEARCH_REQUIRED_SECTIONS = ['## Abstract', '## Introduction', '## Methods', '## Results', '## Discussion', '## Conclusion', '## References'];
const PLAN_REQUIRED_SECTIONS = ['## Executive Summary', '## Context and Problem Statement', '## Proposed Solution'];
const SKILL_REQUIRED_SECTIONS = ['## Overview', '## Instructions'];

function lintRequiredSections(content, filePath, requiredSections, docType, errors) {
  const lines = content.split(/\r?\n/);
  const ignoredLines = findIgnoredMarkdownLines(lines);
  for (const section of requiredSections) {
    if (findHeadingLine(lines, ignoredLines, section) === -1) {
      errors.push(`${docType} is missing required section "${section}": ${toDisplayPath(filePath)}`);
    }
  }
}

function lintPlanExpectedEndDate(content, filePath, errors) {
  const lines = content.split(/\r?\n/);
  const ignoredLines = findIgnoredMarkdownLines(lines);
  const expectedEndDateLines = findFieldLines(lines, ignoredLines, 'Expected end date:');

  if (expectedEndDateLines.length === 0) {
    errors.push(`Plan must include an Expected end date: field: ${toDisplayPath(filePath)}`);
    return;
  }

  if (expectedEndDateLines.length > 1) {
    errors.push(`Plan must not repeat Expected end date: ${toDisplayPath(filePath)}`);
  }

  const value = lines[expectedEndDateLines[0]].slice('Expected end date:'.length).trim().replace(/\.$/, '');
  if (!isIsoDate(value)) {
    errors.push(`Plan Expected end date: must be a valid ISO date in YYYY-MM-DD format: ${toDisplayPath(filePath)}`);
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
      errors.push(`Broken link in canonical index ${toDisplayPath(indexPath)}: ${displayPath(indexPath, linkPath)}`);
      continue;
    }

    if (scopeName !== '_local' && (isPathInside(localScopePath, linkPath) || normalizePath(linkPath) === localScopePath)) {
      errors.push(`Non-_local document must not link into _local scope: ${displayPath(indexPath, linkPath)}`);
    }

    linkedSet.add(normalizePath(linkPath));
  }

  for (const artifactPath of artifacts) {
    if (!linkedSet.has(normalizePath(artifactPath))) {
      errors.push(`Canonical index ${toDisplayPath(indexPath)} is missing an entry for ${toDisplayPath(artifactPath)}`);
    }
  }
}

function lintOrphanAssets(assetsDir, documentPaths, xdrsRoot, errors) {
  if (!existsDirectory(assetsDir)) {
    return;
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
    if (!referencedAssets.has(assetPath)) {
      errors.push(`Orphan asset file not referenced by any document: ${toDisplayPath(assetPath)}`);
    }
  }

  // Lint slide/presentation files inside .assets
  for (const assetPath of assetTree.files) {
    const fileName = path.basename(assetPath);
    if (SLIDE_FILE_RE.test(fileName)) {
      lintSlideFile(assetPath, documentPaths, xdrsRoot, errors);
    }
  }
}

function lintSlideFile(filePath, documentPaths, xdrsRoot, errors) {
  const fileName = path.basename(filePath);

  if (fileName !== fileName.toLowerCase()) {
    errors.push(`Slide file name must be lowercase: ${toDisplayPath(filePath)}`);
  }

  if (fileName.length > SLIDE_MAX_NAME_LENGTH) {
    errors.push(`Slide file name must be ${SLIDE_MAX_NAME_LENGTH} characters or fewer: ${toDisplayPath(filePath)}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');

  const fm = extractFrontmatter(content);
  if (!fm.present) {
    errors.push(`Slide file must start with a YAML frontmatter block containing marp: true: ${toDisplayPath(filePath)}`);
  } else {
    const frontmatterBody = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1];
    const firstKey = frontmatterBody.trimStart().split(/\r?\n/)[0];
    if (!/^marp:\s*true$/.test(firstKey)) {
      errors.push(`Slide frontmatter must include marp: true as the first key: ${toDisplayPath(filePath)}`);
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
    errors.push(`Slide file must contain a link back to its parent document: ${toDisplayPath(filePath)}`);
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
        errors.push(`Absolute path links are not allowed; use relative paths in ${toDisplayPath(documentPath)}:${index + 1}: ${link.rawTarget}`);
      }

      if (!fs.existsSync(link.resolvedPath)) {
        if (isExternalScopeLink(link.resolvedPath, xdrsRoot, externalScopes)) continue;
        if (isResourceLink) {
          errors.push(`Broken asset link in ${toDisplayPath(documentPath)}: ${link.rawTarget}`);
        } else {
          errors.push(`Broken local link in ${toDisplayPath(documentPath)}:${index + 1}: ${link.rawTarget}`);
        }
        continue;
      }

      if (scopeName !== '_local' && (isPathInside(localScopePath, link.resolvedPath) || normalizePath(link.resolvedPath) === localScopePath)) {
        errors.push(`Non-_local document must not link into _local scope in ${toDisplayPath(documentPath)}:${index + 1}: ${link.rawTarget}`);
      }

      if (isResourceLink && !isPathInside(resourceDir, link.resolvedPath)) {
        errors.push(`Asset links in ${toDisplayPath(documentPath)} must point to ${toDisplayPath(resourceDir)}: ${link.rawTarget}`);
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
    return { present: false, name: null, description: false, descriptionText: null, validFrom: undefined, appliedTo: undefined, topLevelKeys: [] };
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
  const descriptionText = extractDescriptionText(block);
  return {
    present: true,
    name: nameMatch ? nameMatch[1].trim() || null : null,
    description: /^description:\s*\S/m.test(block),
    descriptionText,
    validFrom: validFromMatch ? validFromMatch[1].trim() : undefined,
    appliedTo: appliedToMatch ? appliedToMatch[1].trim() : undefined,
    topLevelKeys,
  };
}

function stripFrontmatter(content) {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  return match ? content.slice(match[0].length) : content;
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

module.exports = {
  runLintCli,
  lintWorkspace
};

if (require.main === module) {
  process.exitCode = runLintCli(process.argv.slice(2));
}