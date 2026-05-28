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

test('reports broken local document links in XDRS element files', () => {
  const workspaceRoot = createWorkspace('broken-xdrs-element-link', {
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

test('skips external scopes by default and checks them when ignoreExternal is false', () => {
  const workspaceRoot = createWorkspace('external-default-skip', {
    '.xdrs/index.md': rootIndex(['[extscope](extscope/index.md)']),
    '.xdrs/extscope/index.md': '# extscope Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/extscope/adrs/index.md': [
      '# extscope ADR Index',
      '',
      'Test.',
      '',
      '## principles',
      '',
      '- [001-ext](principles/001-ext.md) - Ext decision',
      ''
    ].join('\n'),
    '.xdrs/extscope/adrs/principles/001-ext.md': [
      '---',
      'name: extscope-adr-policy-001-ext',
      'description: External test XDRS element',
      '---',
      '',
      '# extscope-adr-policy-001: Ext decision',
      '',
      '## Context and Problem Statement',
      '',
      'See [Missing](002-missing.md).',
      ''
    ].join('\n'),
    '.filedist.lock': '.xdrs/extscope/adrs/principles/001-ext.md|some-package|1.0.0\n',
  });

  const defaultResult = lintWorkspace(workspaceRoot);
  const allResult = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(defaultResult.errors.join('\n')).not.toContain('Broken local link in');
  expect(allResult.errors.join('\n')).toContain('Broken local link in');
});

test('skips broken links to missing scope directories when ignoring external scopes', () => {
  // Simulates a source workspace where _core scope hasn't been extracted yet
  const workspaceRoot = createWorkspace('missing-scope-dir-skip', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': xdrDocument(
      'See [core doc](../../../_core/adrs/principles/001-xdrs-core.md).'
    ),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).not.toContain('Broken local link in');
  expect(result.errors.join('\n')).not.toContain('_core');
});

test('skips entire external scope when only some of its files are in filedist', () => {
  const workspaceRoot = createWorkspace('external-scope-partial-filedist', {
    '.xdrs/index.md': rootIndex(['[extscope](extscope/index.md)']),
    '.xdrs/extscope/index.md': '# extscope Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/extscope/adrs/index.md': [
      '# extscope ADR Index',
      '',
      'Test.',
      '',
      '## principles',
      '',
      '- [001-ext](principles/001-ext.md) - Ext decision',
      '- [002-local](principles/002-local.md) - Local decision',
      ''
    ].join('\n'),
    '.xdrs/extscope/adrs/principles/001-ext.md': [
      '---',
      'name: extscope-adr-policy-001-ext',
      'description: External test XDRS element',
      '---',
      '',
      '# extscope-adr-policy-001: Ext decision',
      '',
      '## Context and Problem Statement',
      '',
      'External body.',
      ''
    ].join('\n'),
    '.xdrs/extscope/adrs/principles/002-local.md': [
      '---',
      'name: extscope-adr-policy-002-local',
      'description: Second XDRS element in external scope',
      '---',
      '',
      '# extscope-adr-policy-002: Local decision',
      '',
      '## Context and Problem Statement',
      '',
      'See [Missing](003-missing.md).',
      ''
    ].join('\n'),
    '.filedist.lock': '.xdrs/extscope/adrs/principles/001-ext.md|some-package|1.0.0\n',
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).not.toContain('Broken local link in');
});

test('reports unknown frontmatter fields in XDRS element documents', () => {
  const workspaceRoot = createWorkspace('xdrs-element-unknown-frontmatter', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': [
      '---',
      'name: _local-adr-policy-001-main',
      'description: Test XDRS element',
      'unknown-field: some value',
      '---',
      '',
      '# _local-adr-policy-001: Main decision',
      '',
      '## Context and Problem Statement',
      '',
      'Test body.',
      '',
      '## Decision Outcome',
      '',
      'Test decision outcome.',
      ''
    ].join('\n'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('Policy frontmatter has unknown field "unknown-field"');
});

test('accepts all known frontmatter fields in XDRS element documents', () => {
  const workspaceRoot = createWorkspace('xdrs-element-known-frontmatter', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': [
      '---',
      'name: _local-adr-policy-001-main',
      'description: Test XDRS element',
      'apply-to: All projects',
      'valid-from: 2026-01-01',
      'license: MIT',
      'metadata:',
      '  author: test',
      '---',
      '',
      '# _local-adr-policy-001: Main decision',
      '',
      '## Context and Problem Statement',
      '',
      'Test body.',
      '',
      '## Decision Outcome',
      '',
      'Test decision outcome.',
      ''
    ].join('\n'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).not.toContain('unknown field');
});

test('reports missing apply-to field in Policy frontmatter', () => {
  const workspaceRoot = createWorkspace('xdrs-element-missing-apply-to', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': [
      '---',
      'name: _local-adr-policy-001-main',
      'description: Test XDRS element',
      'valid-from: 2026-01-01',
      '---',
      '',
      '# _local-adr-policy-001: Main decision',
      '',
      '## Context and Problem Statement',
      '',
      'Test body.',
      '',
      '## Decision Outcome',
      '',
      'Test decision outcome.',
      ''
    ].join('\n'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('Policy frontmatter must include an apply-to field');
});

test('reports missing valid-from field in Policy frontmatter', () => {
  const workspaceRoot = createWorkspace('xdrs-element-missing-valid-from', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': [
      '---',
      'name: _local-adr-policy-001-main',
      'description: Test XDRS element',
      'apply-to: All scopes',
      '---',
      '',
      '# _local-adr-policy-001: Main decision',
      '',
      '## Context and Problem Statement',
      '',
      'Test body.',
      '',
      '## Decision Outcome',
      '',
      'Test decision outcome.',
      ''
    ].join('\n'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('Policy frontmatter must include a valid-from field');
});

test('reports unknown frontmatter fields in SKILL.md files', () => {
  const workspaceRoot = createWorkspace('skill-unknown-frontmatter', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-check-links](principles/skills/001-check-links/SKILL.md) - Check links'
    ]),
    '.xdrs/_local/adrs/principles/skills/001-check-links/SKILL.md': [
      '---',
      'name: _local-adr-skill-001-check-links',
      'description: Test skill document',
      'unknown-field: some value',
      '---',
      '',
      '## Overview',
      '',
      'Test skill overview.',
      '',
      '## Instructions',
      '',
      'Test instructions.',
      ''
    ].join('\n'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('SKILL.md frontmatter has unknown field "unknown-field"');
});

test('accepts all known frontmatter fields in SKILL.md files', () => {
  const workspaceRoot = createWorkspace('skill-known-frontmatter', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-check-links](principles/skills/001-check-links/SKILL.md) - Check links'
    ]),
    '.xdrs/_local/adrs/principles/skills/001-check-links/SKILL.md': [
      '---',
      'name: _local-adr-skill-001-check-links',
      'description: Test skill document',
      'license: MIT',
      'metadata:',
      '  version: "1.0"',
      'compatibility: node >= 18',
      'allowed-tools: read_file grep_search',
      '---',
      '',
      '## Overview',
      '',
      'Test skill overview.',
      '',
      '## Instructions',
      '',
      'Test instructions.',
      ''
    ].join('\n'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).not.toContain('unknown field');
});

test('derives expected frontmatter name from the markdown heading title', () => {
  const workspaceRoot = createWorkspace('heading-name-match', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [002-scope-guidelines](principles/002-xdrs-scope-guidelines.md) - Scope guidelines'
    ]),
    '.xdrs/_local/adrs/principles/002-xdrs-scope-guidelines.md': [
      '---',
      'name: _local-adr-policy-002-xdrs-scope-guidelines-for-agentme',
      'description: Test XDRS element',
      '---',
      '',
      '# _local-adr-policy-002: XDRS scope guidelines for agentme',
      '',
      '## Context and Problem Statement',
      '',
      'Test body.',
      ''
    ].join('\n'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).not.toContain('Policy frontmatter name must be');
});

test('reports non-_local XDRS element linking to _local scope document', () => {
  const workspaceRoot = createWorkspace('non-local-links-to-local-xdrs-element', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': xdrDocument('Local decision.'),
    '.xdrs/myteam/index.md': '# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex([
      '- [001-team](principles/001-team.md) - Team decision'
    ]),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument(
      'See [local doc](../../../_local/adrs/principles/001-main.md).'
    ),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('Non-_local document must not link into _local scope');
});

test('allows _local XDRS element linking to another _local scope document', () => {
  const workspaceRoot = createWorkspace('local-links-to-local', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision',
      '- [002-second](principles/002-second.md) - Second decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': [
      '---',
      'name: _local-adr-policy-001-main',
      'description: Test XDRS element',
      '---',
      '',
      '# _local-adr-policy-001: Main decision',
      '',
      '## Context and Problem Statement',
      '',
      'See [second](002-second.md).',
      ''
    ].join('\n'),
    '.xdrs/_local/adrs/principles/002-second.md': [
      '---',
      'name: _local-adr-policy-002-second',
      'description: Second test XDRS element',
      '---',
      '',
      '# _local-adr-policy-002: Second decision',
      '',
      '## Context and Problem Statement',
      '',
      'Second body.',
      ''
    ].join('\n'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).not.toContain('Non-_local document must not link into _local scope');
  expect(result.errors.join('\n')).not.toContain('Broken local link');
});

test('reports non-_local canonical index linking to _local scope document', () => {
  const workspaceRoot = createWorkspace('non-local-type-index-links-to-local', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': xdrDocument('Local decision.'),
    '.xdrs/myteam/index.md': '# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex([
      '- [_local 001](../../_local/adrs/principles/001-main.md) - Cross-scope link'
    ]),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('Non-_local document must not link into _local scope');
});

test('allows relative parent directory links but reports broken ones in XDRS element documents', () => {
  const workspaceRoot = createWorkspace('parent-dir-relative-link-in-xdrs-element', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': xdrDocument('See [other](../other.md).'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).not.toContain('Relative links to parent directories must use absolute paths');
  expect(result.errors.join('\n')).toContain('Broken local link');
  expect(result.errors.join('\n')).toContain('../other.md');
});

test('allows child directory relative non-asset links in XDRS element documents', () => {
  const workspaceRoot = createWorkspace('child-dir-relative-link-in-xdrs-element', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': xdrDocument('See [skill](skills/001-review/SKILL.md).'),
  });
  const skillDir = path.join(workspaceRoot, '.xdrs/_local/adrs/principles/skills/001-review');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: _local-adr-skill-001-review\ndescription: test skill\n---\n# Skill');

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).not.toContain('Relative links to parent directories');
  expect(result.errors.join('\n')).not.toContain('Broken local link');
});

test('allows same-directory relative non-asset links in XDRS element documents', () => {
  const workspaceRoot = createWorkspace('same-dir-relative-link-in-xdrs-element', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision',
      '- [002-other](principles/002-other.md) - Other decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': xdrDocument('See [other](002-other.md).'),
    '.xdrs/_local/adrs/principles/002-other.md': xdrDocument('Other body.').replace('_local-adr-policy-001-main', '_local-adr-policy-002-other').replace('# _local-adr-policy-001: Main decision', '# _local-adr-policy-002: Other decision'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).not.toContain('absolute paths');
  expect(result.errors.join('\n')).not.toContain('Broken local link');
});

test('allows relative asset links in XDRS element documents', () => {
  const workspaceRoot = createWorkspace('relative-asset-link', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': xdrDocument('See ![diagram](.assets/diagram.png).'),
  });
  const assetsDir = path.join(workspaceRoot, '.xdrs/_local/adrs/principles/.assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(path.join(assetsDir, 'diagram.png'), Buffer.alloc(0));

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).not.toContain('Non-asset links must use absolute paths');
  expect(result.errors.join('\n')).not.toContain('Broken asset link');
});

test('reports absolute path link as error', () => {
  const workspaceRoot = createWorkspace('broken-absolute-link', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': xdrDocument('See [missing](/.xdrs/_local/adrs/principles/999-nonexistent.md).'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('Absolute path links are not allowed');
  expect(result.errors.join('\n')).toContain('999-nonexistent.md');
});

test('reports non-_local XDRS element linking to _local scope via absolute path', () => {
  const workspaceRoot = createWorkspace('abs-non-local-links-to-local', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': xdrDocument('Local decision.'),
    '.xdrs/myteam/index.md': '# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex([
      '- [001-team](principles/001-team.md) - Team decision'
    ]),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument(
      'See [local doc](../../../_local/adrs/principles/001-main.md).'
    ),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('Non-_local document must not link into _local scope');
});

test('allows index.md at scope level', () => {
  const workspaceRoot = createWorkspace('scope-index-allowed', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/index.md': '# _local Scope Overview\n\nOverview of local scope.\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': xdrDocument('Test body.'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).not.toContain('Unexpected file under scope');
});

test('reports scope index missing link to type index', () => {
  const workspaceRoot = createWorkspace('scope-index-missing-type-link', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/myteam/index.md': '# myteam Scope Overview\n\nNo type links here.\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex([
      '- [001-team](principles/001-team.md) - Team decision'
    ]),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('Scope index');
  expect(result.errors.join('\n')).toContain('is missing link to type index');
  expect(result.errors.join('\n')).toContain('adrs/index.md');
});

test('passes when scope index links to all type indexes', () => {
  const workspaceRoot = createWorkspace('scope-index-links-all-types', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/myteam/index.md': '# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex([
      '- [001-team](principles/001-team.md) - Team decision'
    ]),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).not.toContain('is missing link to type index');
});

test('reports broken link in scope index', () => {
  const workspaceRoot = createWorkspace('scope-index-broken-link', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/myteam/index.md': '# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n[Missing](missing/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex([
      '- [001-team](principles/001-team.md) - Team decision'
    ]),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('Broken link in scope index');
  expect(result.errors.join('\n')).toContain('missing/index.md');
});

test('reports missing scope index', () => {
  const workspaceRoot = createWorkspace('missing-scope-index', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': xdrDocument('Test body.'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('Missing required scope index');
  expect(result.errors.join('\n')).toContain('_local/index.md');
});

test('reports orphan asset files not referenced by any document', () => {
  const workspaceRoot = createWorkspace('orphan-asset', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': xdrDocument('See ![used](.assets/used.png).'),
    '.xdrs/_local/adrs/principles/.assets/used.png': Buffer.alloc(0),
    '.xdrs/_local/adrs/principles/.assets/orphan.png': Buffer.alloc(0),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('Orphan asset file');
  expect(result.errors.join('\n')).toContain('orphan.png');
  expect(result.errors.join('\n')).not.toContain('used.png');
});

test('does not report asset files that are referenced', () => {
  const workspaceRoot = createWorkspace('no-orphan-asset', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': xdrDocument('See ![img](.assets/diagram.png).'),
    '.xdrs/_local/adrs/principles/.assets/diagram.png': Buffer.alloc(0),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).not.toContain('Orphan asset file');
});

test('reports orphan asset in articles .assets directory', () => {
  const workspaceRoot = createWorkspace('orphan-article-asset', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-guide](principles/articles/001-guide.md) - Guide article'
    ]),
    '.xdrs/_local/adrs/principles/articles/001-guide.md': [
      '# _local-adr-article-001: Guide',
      '',
      'See ![used](.assets/used.png).',
      ''
    ].join('\n'),
    '.xdrs/_local/adrs/principles/articles/.assets/used.png': Buffer.alloc(0),
    '.xdrs/_local/adrs/principles/articles/.assets/unused.jpg': Buffer.alloc(0),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('Orphan asset file');
  expect(result.errors.join('\n')).toContain('unused.jpg');
  expect(result.errors.join('\n')).not.toContain('used.png');
});

test('reports unexpected directories inside a skill package', () => {
  const workspaceRoot = createWorkspace('unexpected-skill-package-directory', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/index.md': '# _local Scope Overview\n\nOverview.\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-check-links](principles/skills/001-check-links/SKILL.md) - Check local links'
    ]),
    '.xdrs/_local/adrs/principles/skills/001-check-links/SKILL.md': skillDocument('Skill body.'),
    '.xdrs/_local/adrs/principles/skills/001-check-links/extras/note.txt': 'unexpected',
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('Unexpected directory in skill package');
  expect(result.errors.join('\n')).toContain('extras');
});

test('reports nested directories in .assets when it has 10 files or fewer', () => {
  const workspaceRoot = createWorkspace('asset-subdir-too-small', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/index.md': '# _local Scope Overview\n\nOverview.\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': [
      '---',
      'name: _local-adr-policy-001-main-decision',
      'description: Test XDRS element',
      '---',
      '',
      '# _local-adr-policy-001: Main decision',
      '',
      '## Context and Problem Statement',
      '',
      'See ![img](.assets/used.png).',
      '',
      '## Decision Outcome',
      '',
      'Test decision outcome.',
      ''
    ].join('\n'),
    '.xdrs/_local/adrs/principles/.assets/used.png': Buffer.alloc(0),
    '.xdrs/_local/adrs/principles/.assets/grouped/extra.png': Buffer.alloc(0),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('.assets directory must be flat unless it already contains more than 10 files');
  expect(result.errors.join('\n')).toContain('.assets/grouped');
});

test('allows nested directories in .assets when it has more than 10 files', () => {
  const workspaceRoot = createWorkspace('asset-subdir-large-enough', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/index.md': '# _local Scope Overview\n\nOverview.\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': [
      '---',
      'name: _local-adr-policy-001-main-decision',
      'description: Test XDRS element',
      '---',
      '',
      '# _local-adr-policy-001: Main decision',
      '',
      '## Context and Problem Statement',
      '',
      'See ![img](.assets/used.png).',
      '',
      '## Decision Outcome',
      '',
      'Test decision outcome.',
      ''
    ].join('\n'),
    '.xdrs/_local/adrs/principles/.assets/used.png': Buffer.alloc(0),
    '.xdrs/_local/adrs/principles/.assets/01.png': Buffer.alloc(0),
    '.xdrs/_local/adrs/principles/.assets/02.png': Buffer.alloc(0),
    '.xdrs/_local/adrs/principles/.assets/03.png': Buffer.alloc(0),
    '.xdrs/_local/adrs/principles/.assets/04.png': Buffer.alloc(0),
    '.xdrs/_local/adrs/principles/.assets/05.png': Buffer.alloc(0),
    '.xdrs/_local/adrs/principles/.assets/06.png': Buffer.alloc(0),
    '.xdrs/_local/adrs/principles/.assets/07.png': Buffer.alloc(0),
    '.xdrs/_local/adrs/principles/.assets/08.png': Buffer.alloc(0),
    '.xdrs/_local/adrs/principles/.assets/09.png': Buffer.alloc(0),
    '.xdrs/_local/adrs/principles/.assets/10.png': Buffer.alloc(0),
    '.xdrs/_local/adrs/principles/.assets/grouped/11.png': Buffer.alloc(0),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).not.toContain('.assets directory must be flat unless it already contains more than 10 files');
});

function teamAdrIndex(entries) {
  return [
    '# myteam ADR Index',
    '',
    'Team ADRs for tests.',
    '',
    '## principles',
    '',
    ...entries,
    ''
  ].join('\n');
}

function teamXdrDocument(body) {
  return [
    '---',
    'name: myteam-adr-policy-001-team',
    'description: Team test XDRS element',
    '---',
    '',
    '# myteam-adr-policy-001: Team decision',
    '',
    '## Context and Problem Statement',
    '',
    body,
    '',
    '## Decision Outcome',
    '',
    'Test decision outcome.',
    ''
  ].join('\n');
}

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

function rootIndex(extraScopeLinks) {
  const lines = [
    '# XDRS Index',
    '',
    '## Scope Indexes',
    '',
    'XDRS scopes listed last override the ones listed first',
    '',
  ];
  if (extraScopeLinks) {
    lines.push(...extraScopeLinks, '');
  }
  lines.push(
    '### _local (reserved)',
    '',
    'Read _local scope index at `_local/index.md` when it exists.',
  );
  return lines.join('\n');
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
    'name: _local-adr-policy-001-main',
    'description: Test XDRS element',
    'apply-to: All scopes',
    'valid-from: 2026-01-01',
    '---',
    '',
    '# _local-adr-policy-001: Main decision',
    '',
    '## Context and Problem Statement',
    '',
    body,
    '',
    '## Decision Outcome',
    '',
    'Test decision outcome.',
    ''
  ].join('\n');
}

function skillDocument(body) {
  return [
    '---',
    'name: _local-adr-skill-001-check-links',
    'description: Test skill document',
    '---',
    '',
    '# Test skill',
    '',
    '## Overview',
    '',
    'Test skill overview.',
    '',
    '## Instructions',
    '',
    body,
    ''
  ].join('\n');
}

test('accepts a custom root folder name as the XDRS root when it contains index.md', () => {
  const doc = [
    '---',
    'name: _local-adr-policy-001-main-decision',
    'description: Test XDRS element',
    'apply-to: All scopes',
    'valid-from: 2026-01-01',
    '---',
    '',
    '# _local-adr-policy-001: Main decision',
    '',
    '## Context and Problem Statement',
    '',
    'Custom root body.',
    '',
    '## Decision Outcome',
    '',
    'Test decision outcome.',
    ''
  ].join('\n');
  const workspaceRoot = createWorkspace('custom-root-folder', {
    'my-decisions/index.md': rootIndex(),
    'my-decisions/_local/index.md': '# _local Scope Overview\n\nOverview.\n\n[ADRs](adrs/index.md)\n',
    'my-decisions/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    'my-decisions/_local/adrs/principles/001-main.md': doc,
  });

  const result = lintWorkspace(path.join(workspaceRoot, 'my-decisions'));

  expect(result.errors).toHaveLength(0);
  expect(result.xdrsRoot).toBe(path.join(workspaceRoot, 'my-decisions'));
});

test('falls back to .xdrs subdirectory when given path has no index.md', () => {
  const doc = [
    '---',
    'name: _local-adr-policy-001-main-decision',
    'description: Test XDRS element',
    'apply-to: All scopes',
    'valid-from: 2026-01-01',
    '---',
    '',
    '# _local-adr-policy-001: Main decision',
    '',
    '## Context and Problem Statement',
    '',
    'Fallback body.',
    '',
    '## Decision Outcome',
    '',
    'Test decision outcome.',
    ''
  ].join('\n');
  const workspaceRoot = createWorkspace('fallback-to-xdrs', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/index.md': '# _local Scope Overview\n\nOverview.\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': doc,
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors).toHaveLength(0);
  expect(result.xdrsRoot).toBe(path.join(workspaceRoot, '.xdrs'));
});

// ─── Emoji checks ─────────────────────────────────────────────────────────────

test('reports emoji in XDRS element body', () => {
  const workspaceRoot = createWorkspace('xdrs-element-emoji-body', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': xdrDocument('This is great \uD83C\uDF89'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('Policy must not contain emojis');
});

test('does not report emoji inside a code block in XDRS element documents', () => {
  const workspaceRoot = createWorkspace('xdrs-element-emoji-in-code-block', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': xdrDocument('```\necho "hello \uD83C\uDF89"\n```'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).not.toContain('must not contain emojis');
});

test('reports emoji in SKILL.md', () => {
  const workspaceRoot = createWorkspace('skill-emoji', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-check-links](principles/skills/001-check-links/SKILL.md) - Check links'
    ]),
    '.xdrs/_local/adrs/principles/skills/001-check-links/SKILL.md': skillDocument('Step 1: do something \u2705'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('Skill must not contain emojis');
});

test('reports emoji in article document', () => {
  const workspaceRoot = createWorkspace('article-emoji', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-guide](principles/articles/001-guide.md) - Guide'
    ]),
    '.xdrs/_local/adrs/principles/articles/001-guide.md': articleDocument('Nice overview \uD83D\uDE80'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('Article must not contain emojis');
});

test('reports emoji in research document', () => {
  const workspaceRoot = createWorkspace('research-emoji', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-study](principles/researches/001-study.md) - Study'
    ]),
    '.xdrs/_local/adrs/principles/researches/001-study.md': researchDocument('Some finding \uD83D\uDD2C', 'Question: Is this right?'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('Research must not contain emojis');
});

test('reports emoji in plan document', () => {
  const workspaceRoot = createWorkspace('plan-emoji', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-myplan](principles/plans/001-myplan.md) - My plan'
    ]),
    '.xdrs/_local/adrs/principles/plans/001-myplan.md': planDocument('Great plan \uD83C\uDFAF'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('Plan must not contain emojis');
});

// ─── Name / description length ────────────────────────────────────────────────

test('reports XDRS element frontmatter name exceeding 64 characters', () => {
  const longName = '_local-adr-policy-001-' + 'a'.repeat(50);
  const workspaceRoot = createWorkspace('xdrs-element-name-too-long', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': [
      '---',
      `name: ${longName}`,
      'description: Test XDRS element',
      '---',
      '',
      '# _local-adr-policy-001: Main decision',
      '',
      '## Context and Problem Statement',
      '',
      'Test body.',
      '',
      '## Decision Outcome',
      '',
      'Test decision outcome.',
      ''
    ].join('\n'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('Policy frontmatter name must be 64 characters or fewer');
});

test('reports XDRS element frontmatter description exceeding 1024 characters', () => {
  const workspaceRoot = createWorkspace('xdrs-element-description-too-long', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': [
      '---',
      'name: _local-adr-policy-001-main',
      `description: ${'x'.repeat(1025)}`,
      '---',
      '',
      '# _local-adr-policy-001: Main decision',
      '',
      '## Context and Problem Statement',
      '',
      'Test body.',
      '',
      '## Decision Outcome',
      '',
      'Test decision outcome.',
      ''
    ].join('\n'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('Policy frontmatter description must be 1024 characters or fewer');
});

test('reports SKILL.md frontmatter name exceeding 64 characters', () => {
  const longName = '001-check-links-' + 'a'.repeat(50);
  const workspaceRoot = createWorkspace('skill-name-too-long', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-check-links](principles/skills/001-check-links/SKILL.md) - Check links'
    ]),
    '.xdrs/_local/adrs/principles/skills/001-check-links/SKILL.md': [
      '---',
      `name: ${longName}`,
      'description: Test skill document',
      '---',
      '',
      '## Overview',
      '',
      'Overview.',
      '',
      '## Instructions',
      '',
      'Instructions.',
      ''
    ].join('\n'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('SKILL.md frontmatter name must be 64 characters or fewer');
});

test('reports SKILL.md frontmatter description exceeding 1024 characters', () => {
  const workspaceRoot = createWorkspace('skill-description-too-long', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-check-links](principles/skills/001-check-links/SKILL.md) - Check links'
    ]),
    '.xdrs/_local/adrs/principles/skills/001-check-links/SKILL.md': [
      '---',
      'name: 001-check-links',
      `description: ${'x'.repeat(1025)}`,
      '---',
      '',
      '## Overview',
      '',
      'Overview.',
      '',
      '## Instructions',
      '',
      'Instructions.',
      ''
    ].join('\n'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('SKILL.md frontmatter description must be 1024 characters or fewer');
});

// ─── Word count ───────────────────────────────────────────────────────────────

test('reports XDRS element document exceeding 2600 word limit', () => {
  const longBody = ('word '.repeat(2601)).trimEnd();
  const workspaceRoot = createWorkspace('xdrs-element-too-many-words', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': xdrDocument(longBody),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('Policy exceeds maximum word count of 2600');
});

test('reports article exceeding 8000 word limit', () => {
  const longBody = ('word '.repeat(8001)).trimEnd();
  const workspaceRoot = createWorkspace('article-too-many-words', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-guide](principles/articles/001-guide.md) - Guide'
    ]),
    '.xdrs/_local/adrs/principles/articles/001-guide.md': articleDocument(longBody),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('Article exceeds maximum word count of 8000');
});

test('reports research exceeding 5000 word limit', () => {
  const longBody = ('word '.repeat(5001)).trimEnd();
  const workspaceRoot = createWorkspace('research-too-many-words', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-study](principles/researches/001-study.md) - Study'
    ]),
    '.xdrs/_local/adrs/principles/researches/001-study.md': researchDocument(longBody, 'Question: What is the answer?'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('Research exceeds maximum word count of 5000');
});

test('reports SKILL.md exceeding 6500 word limit', () => {
  const longBody = ('word '.repeat(6501)).trimEnd();
  const workspaceRoot = createWorkspace('skill-too-many-words', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-check-links](principles/skills/001-check-links/SKILL.md) - Check links'
    ]),
    '.xdrs/_local/adrs/principles/skills/001-check-links/SKILL.md': skillDocument(longBody),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('Skill exceeds maximum word count of 6500');
});

// ─── Files outside .assets in skill package root ────────────────────────────

test('passes when extra files exist at skill package root', () => {
  const workspaceRoot = createWorkspace('extra-skill-file', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-check-links](principles/skills/001-check-links/SKILL.md) - Check links'
    ]),
    '.xdrs/_local/adrs/principles/skills/001-check-links/SKILL.md': skillDocument('Body.'),
    '.xdrs/_local/adrs/principles/skills/001-check-links/extra.md': 'Allowed extra file',
    '.xdrs/_local/adrs/principles/skills/001-check-links/schema.json': '{"type":"object"}',
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).not.toContain('extra.md');
  expect(result.errors.join('\n')).not.toContain('schema.json');
});

// ─── Research Question: in Introduction ──────────────────────────────────────

test('reports research ## Introduction missing Question: line', () => {
  const workspaceRoot = createWorkspace('research-no-question', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-study](principles/researches/001-study.md) - Study'
    ]),
    '.xdrs/_local/adrs/principles/researches/001-study.md': researchDocument('No question here.', null),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('Research ## Introduction must contain a "Question:" line');
});

test('passes when research ## Introduction contains Question: line', () => {
  const workspaceRoot = createWorkspace('research-with-question', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-study](principles/researches/001-study.md) - Study'
    ]),
    '.xdrs/_local/adrs/principles/researches/001-study.md': researchDocument('Some context.', 'Question: Is this the right approach?'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).not.toContain('Research ## Introduction must contain');
});

// ─── Slide / Presentation checks ─────────────────────────────────────────────

test('passes for valid slide file in .assets with marp frontmatter and backlink', () => {
  const workspaceRoot = createWorkspace('marp-valid', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/index.md': '# _local Scope Overview\n\n## Content\n\nLocal scope.\n\n- [ADRs](adrs/index.md)\n',
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': xdrDocument('Body.\n\n[Slides](.assets/001-main-slides.md)'),
    '.xdrs/_local/adrs/principles/.assets/001-main-slides.md': slideDocument('[Parent](../001-main.md)'),
  });

  const result = lintWorkspace(workspaceRoot);

  const slideErrors = result.errors.filter((e) => /\bSlide\b/.test(e) || /\bSlide\b/i.test(e) && e.includes('slides'));
  expect(slideErrors).toHaveLength(0);
});

test('reports slide file missing marp: true in frontmatter', () => {
  const workspaceRoot = createWorkspace('slide-no-marp', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': xdrDocument('Body.\n\n[Slides](.assets/001-main-slides.md)'),
    '.xdrs/_local/adrs/principles/.assets/001-main-slides.md': [
      '---',
      'theme: default',
      '---',
      '',
      '# Slides',
      '',
      '[Parent](../001-main.md)',
      ''
    ].join('\n'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('Slide frontmatter must include marp: true');
});

test('reports slide file without any frontmatter', () => {
  const workspaceRoot = createWorkspace('slide-no-frontmatter', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': xdrDocument('Body.\n\n[Slides](.assets/001-main-slides.md)'),
    '.xdrs/_local/adrs/principles/.assets/001-main-slides.md': '# Slides\n\n[Parent](../001-main.md)\n',
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('Slide file must start with a YAML frontmatter block containing marp: true');
});

test('reports slide file missing backlink to parent document', () => {
  const workspaceRoot = createWorkspace('slide-no-backlink', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': xdrDocument('Body.\n\n[Slides](.assets/001-main-slides.md)'),
    '.xdrs/_local/adrs/principles/.assets/001-main-slides.md': slideDocument('No link back here.'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('Slide file must contain a link back to its parent document');
});

test('reports slide file name exceeding 64 characters', () => {
  const longName = '001-main-slides-' + 'a'.repeat(46) + '.md'; // > 64 chars
  const workspaceRoot = createWorkspace('slide-name-too-long', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': xdrDocument(`Body.\n\n[Slides](.assets/${longName})`),
    [`.xdrs/_local/adrs/principles/.assets/${longName}`]: slideDocument('[Parent](../001-main.md)'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('Slide file name must be 64 characters or fewer');
});

test('reports emojis in slide files', () => {
  const workspaceRoot = createWorkspace('slide-emoji', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': xdrDocument('Body.\n\n[Slides](.assets/001-main-slides.md)'),
    '.xdrs/_local/adrs/principles/.assets/001-main-slides.md': slideDocument('Great stuff! \u{1F680}\n\n[Parent](../001-main.md)'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('Slide must not contain emojis');
});

test('does not lint non-slide files in .assets as slides', () => {
  const workspaceRoot = createWorkspace('non-slide-asset', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': xdrDocument('Body.\n\n[Schema](.assets/schema.json)'),
    '.xdrs/_local/adrs/principles/.assets/schema.json': '{"type":"object"}',
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).not.toContain('Slide');
  expect(result.errors.join('\n')).not.toContain('marp');
});

test('passes for slide file in article .assets with backlink', () => {
  const workspaceRoot = createWorkspace('marp-article-valid', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/index.md': '# _local Scope Overview\n\n## Content\n\nLocal scope.\n\n- [ADRs](adrs/index.md)\n',
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-guide](principles/articles/001-guide.md) - Guide'
    ]),
    '.xdrs/_local/adrs/principles/articles/001-guide.md': articleDocument('Body.\n\n[Slides](.assets/001-guide-slides.md)'),
    '.xdrs/_local/adrs/principles/articles/.assets/001-guide-slides.md': slideDocument('[Parent](../001-guide.md)'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).not.toContain('Slide');
  expect(result.errors.join('\n')).not.toContain('marp');
});

// ─── New helpers ──────────────────────────────────────────────────────────────

function slideDocument(body) {
  return [
    '---',
    'marp: true',
    '---',
    '',
    '# Presentation',
    '',
    body,
    ''
  ].join('\n');
}

function articleDocument(body) {
  return [
    '# _local-adr-article-001: Guide',
    '',
    '## Overview',
    '',
    'Overview text.',
    '',
    '## Content',
    '',
    body,
    '',
    '## References',
    '',
    '- No references.',
    ''
  ].join('\n');
}

function researchDocument(introBody, questionLine) {
  const introSection = questionLine
    ? `${introBody}\n\n${questionLine}`
    : introBody;
  return [
    '# _local-adr-research-001: Study',
    '',
    '## Abstract',
    '',
    'Single paragraph abstract.',
    '',
    '## Introduction',
    '',
    introSection,
    '',
    '## Methods',
    '',
    'Study methods.',
    '',
    '## Results',
    '',
    'Study results.',
    '',
    '## Discussion',
    '',
    'Discussion.',
    '',
    '## Conclusion',
    '',
    'Conclusion.',
    '',
    '## References',
    '',
    '- No references.',
    ''
  ].join('\n');
}

function planDocument(body) {
  return [
    '# _local-adr-plan-001: My plan',
    '',
    '## Executive Summary',
    '',
    'Summary.',
    '',
    '## Context and Problem Statement',
    '',
    body,
    '',
    '## Proposed Solution',
    '',
    'We will fix it.',
    '',
    'Expected end date: 2026-12-31',
    ''
  ].join('\n');
}