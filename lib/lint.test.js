'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { lintWorkspace } = require('./lint');

let tmpRoot;

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xdrs-core-lint-'));
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test('reports broken local document links in XDR files', () => {
  const workspaceRoot = createWorkspace('broken-xdr-link', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': xdrDocument(`See [Missing](002-missing.md).`),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('Broken local link in');
  expect(result.errors.join('\n')).toContain('002-missing.md');
});

test('ignores local links inside fenced code blocks', () => {
  const workspaceRoot = createWorkspace('ignore-code-fence', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': xdrDocument([
      '```markdown',
      '[Missing](002-missing.md)',
      '```'
    ].join('\n')),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).not.toContain('Broken local link in');
});

test('reports broken local document links in skill files', () => {
  const workspaceRoot = createWorkspace('broken-skill-link', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-check-links](principles/skills/001-check-links/SKILL.md) - Check local links'
    ]),
    '.xdrs/_local/adrs/principles/skills/001-check-links/SKILL.md': skillDocument('See [Missing](missing.md).'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('Broken local link in');
  expect(result.errors.join('\n')).toContain('missing.md');
});

test('skips read-only files by default and checks them when ignoreReadOnly is false', () => {
  const workspaceRoot = createWorkspace('readonly-default-skip', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': xdrDocument('See [Missing](002-missing.md).'),
  });
  const filePath = path.join(workspaceRoot, '.xdrs/_local/adrs/principles/001-main.md');
  fs.chmodSync(filePath, 0o444);

  const defaultResult = lintWorkspace(workspaceRoot);
  const allResult = lintWorkspace(workspaceRoot, { ignoreReadOnly: false });

  expect(defaultResult.errors.join('\n')).not.toContain('Broken local link in');
  expect(allResult.errors.join('\n')).toContain('Broken local link in');
});

test('derives expected frontmatter name from the markdown heading title', () => {
  const workspaceRoot = createWorkspace('heading-name-match', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [002-scope-guidelines](principles/002-xdr-scope-guidelines.md) - Scope guidelines'
    ]),
    '.xdrs/_local/adrs/principles/002-xdr-scope-guidelines.md': [
      '---',
      'name: _local-adr-002-xdr-scope-guidelines-for-agentme',
      'description: Test XDR document',
      '---',
      '',
      '# _local-adr-002: XDR scope guidelines for agentme',
      '',
      '## Context and Problem Statement',
      '',
      'Test body.',
      ''
    ].join('\n'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreReadOnly: false });

  expect(result.errors.join('\n')).not.toContain('XDR frontmatter name must be');
});

function createWorkspace(name, files) {
  const workspaceRoot = path.join(tmpRoot, name);
  fs.mkdirSync(workspaceRoot, { recursive: true });

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(workspaceRoot, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
  }

  return workspaceRoot;
}

function rootIndex() {
  return [
    '# XDR Standards Index',
    '',
    '## Scope Indexes',
    '',
    'XDRs in scopes listed last override the ones listed first',
    '',
    '### _local (reserved)',
    '',
    'Project-local XDRs stay in the workspace tree only.',
  ].join('\n');
}

function localAdrIndex(entries) {
  return [
    '# _local ADR Index',
    '',
    'Local ADRs for tests.',
    '',
    '## principles',
    '',
    ...entries,
    ''
  ].join('\n');
}

function xdrDocument(body) {
  return [
    '---',
    'name: _local-adr-001-main',
    'description: Test XDR document',
    '---',
    '',
    '# _local-adr-001: Main decision',
    '',
    '## Context and Problem Statement',
    '',
    body,
    ''
  ].join('\n');
}

function skillDocument(body) {
  return [
    '---',
    'name: 001-check-links',
    'description: Test skill document',
    '---',
    '',
    '# Test skill',
    '',
    body,
    ''
  ].join('\n');
}