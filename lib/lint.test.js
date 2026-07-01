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
      'name: 001-check-links',
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
      'name: 001-check-links',
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
    '.xdrs/myteam/index.md': teamScopeIndex(),
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
    '.xdrs/myteam/index.md': teamScopeIndex(),
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
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: 001-review\ndescription: test skill\n---\n# Skill');

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
    '.xdrs/myteam/index.md': teamScopeIndex(),
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
    '.xdrs/_local/index.md': localScopeIndex(),
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
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: myteam\ndescription: Team scope for tests.\napply-to: Test team only\nvalid-from: 2026-01-01\n---\n\n# myteam Scope Overview\n\nNo type links here.\n',
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
    '.xdrs/myteam/index.md': teamScopeIndex(),
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
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: myteam\ndescription: Team scope for tests.\napply-to: Test team only\nvalid-from: 2026-01-01\n---\n\n# myteam Scope Overview\n\nTeam scope for tests.\n\n[ADRs](adrs/index.md)\n[Missing](missing/index.md)\n',
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

// ─── Scope type checks ────────────────────────────────────────────────────────

test('reports missing scope-type frontmatter in scope index', () => {
  const workspaceRoot = createWorkspace('scope-type-missing-frontmatter', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/myteam/index.md': '# myteam Scope Overview\n\nNo frontmatter here.\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex([
      '- [001-team](principles/001-team.md) - Team decision'
    ]),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('Scope index must start with a YAML frontmatter block');
  expect(result.errors.join('\n')).toContain('myteam/index.md');
});

test('reports missing scope-type field in scope index frontmatter', () => {
  const workspaceRoot = createWorkspace('scope-type-missing-field', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/myteam/index.md': '---\nsome-field: value\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex([
      '- [001-team](principles/001-team.md) - Team decision'
    ]),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('Scope index frontmatter must include a scope-type field');
});

test('reports invalid scope-type value in scope index frontmatter', () => {
  const workspaceRoot = createWorkspace('scope-type-invalid-value', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)', '[_core](_core/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: invalid-type\nname: myteam\ndescription: Team scope for tests.\napply-to: Test team only\nvalid-from: 2026-01-01\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex([
      '- [001-team](principles/001-team.md) - Team decision'
    ]),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
    // _core with only 'core' scope-type — no invalid-type-scope-type policy
    ...coreWithScopeTypes([]),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('has no corresponding invalid-type-scope-type policy');
  expect(result.errors.join('\n')).toContain('myteam/index.md');
});

test('accepts all valid scope-type values', () => {
  const workspaceRoot = createWorkspace('valid-standard-type-check', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/myteam/index.md': teamScopeIndex(),
    '.xdrs/myteam/adrs/index.md': teamAdrIndex([
      '- [001-team](principles/001-team.md) - Team decision'
    ]),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).not.toContain('has no corresponding');
  expect(result.errors.join('\n')).not.toContain('Scope index frontmatter must include');
  expect(result.errors.join('\n')).not.toContain('Scope index must start with');
});

test('accepts scope-type reference when scope name contains reference', () => {
  const workspaceRoot = createWorkspace('valid-reference-type', {
    '.xdrs/index.md': rootIndex(['[security-reference-baseline](security-reference-baseline/index.md)']),
    '.xdrs/security-reference-baseline/index.md': '---\nscope-type: reference\nname: security-reference-baseline\ndescription: Security reference architecture baseline for all teams.\napply-to: All teams following security reference patterns\nvalid-from: 2026-01-01\n---\n\n# security-reference-baseline Scope Overview\n\nSecurity reference.\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/security-reference-baseline/adrs/index.md': [
      '# security-reference-baseline ADR Index', '', 'Security reference ADRs.', '', '## principles', '',
      '- [001-baseline](principles/001-baseline.md) - Security baseline', ''
    ].join('\n'),
    '.xdrs/security-reference-baseline/adrs/principles/001-baseline.md': [
      '---', 'name: security-reference-baseline-adr-policy-001-baseline',
      'description: Security baseline policy', 'apply-to: All scopes', 'valid-from: 2026-01-01', '---', '',
      '# security-reference-baseline-adr-policy-001: Security baseline', '',
      '## Context and Problem Statement', '', 'Baseline context.', '',
      '## Decision Outcome', '', 'Baseline outcome.', ''
    ].join('\n'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).not.toContain('has no corresponding');
  expect(result.errors.join('\n')).not.toContain('Scope with type "reference"');
  expect(result.errors.join('\n')).not.toContain('Scope index frontmatter must include');
});

test('reports scope-type reference when scope name does not contain reference', () => {
  const workspaceRoot = createWorkspace('scope-type-reference-invalid-name', {
    '.xdrs/index.md': rootIndex(['[security-baseline](security-baseline/index.md)']),
    '.xdrs/security-baseline/index.md': '---\nscope-type: reference\nname: security-baseline\ndescription: Security baseline policy decisions.\napply-to: All teams following security patterns\nvalid-from: 2026-01-01\n---\n\n# security-baseline Scope Overview\n\nSecurity baseline.\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/security-baseline/adrs/index.md': teamAdrIndex([
      '- [001-team](principles/001-team.md) - Team decision'
    ]),
    '.xdrs/security-baseline/adrs/principles/001-team.md': [
      '---', 'name: security-baseline-adr-policy-001-team',
      'description: Security baseline policy', 'apply-to: All scopes', 'valid-from: 2026-01-01', '---', '',
      '# security-baseline-adr-policy-001: Team decision', '',
      '## Context and Problem Statement', '', 'Body.', '',
      '## Decision Outcome', '', 'Outcome.', ''
    ].join('\n'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('Scope with type "reference" must have "reference" in its name');
});

test('accepts scope-type platform when scope name contains platform', () => {
  const workspaceRoot = createWorkspace('valid-platform-type', {
    '.xdrs/index.md': rootIndex(['[cloud-platform](cloud-platform/index.md)']),
    '.xdrs/cloud-platform/index.md': '---\nscope-type: platform\nname: cloud-platform\ndescription: Cloud platform infrastructure decisions for all teams.\napply-to: All teams using the cloud platform\nvalid-from: 2026-01-01\n---\n\n# cloud-platform Scope Overview\n\nCloud platform.\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/cloud-platform/adrs/index.md': [
      '# cloud-platform ADR Index', '', 'Cloud platform ADRs.', '', '## principles', '',
      '- [001-baseline](principles/001-baseline.md) - Cloud baseline', ''
    ].join('\n'),
    '.xdrs/cloud-platform/adrs/principles/001-baseline.md': [
      '---', 'name: cloud-platform-adr-policy-001-baseline',
      'description: Cloud platform baseline', 'apply-to: All scopes', 'valid-from: 2026-01-01', '---', '',
      '# cloud-platform-adr-policy-001: Cloud baseline', '',
      '## Context and Problem Statement', '', 'Platform context.', '',
      '## Decision Outcome', '', 'Platform outcome.', ''
    ].join('\n'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).not.toContain('has no corresponding');
  expect(result.errors.join('\n')).not.toContain('Scope with type "platform"');
  expect(result.errors.join('\n')).not.toContain('Scope index frontmatter must include');
});

test('reports scope-type platform when scope name does not contain platform', () => {
  const workspaceRoot = createWorkspace('scope-type-platform-invalid-name', {
    '.xdrs/index.md': rootIndex(['[cloud-infra](cloud-infra/index.md)']),
    '.xdrs/cloud-infra/index.md': '---\nscope-type: platform\nname: cloud-infra\ndescription: Cloud infrastructure decisions.\napply-to: All teams using cloud infrastructure\nvalid-from: 2026-01-01\n---\n\n# cloud-infra Scope Overview\n\nCloud infrastructure.\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/cloud-infra/adrs/index.md': [
      '# cloud-infra ADR Index', '', 'Cloud infra ADRs.', '', '## principles', '',
      '- [001-infra](principles/001-infra.md) - Infra', ''
    ].join('\n'),
    '.xdrs/cloud-infra/adrs/principles/001-infra.md': [
      '---', 'name: cloud-infra-adr-policy-001-infra',
      'description: Cloud infra policy', 'apply-to: All scopes', 'valid-from: 2026-01-01', '---', '',
      '# cloud-infra-adr-policy-001: Infra', '',
      '## Context and Problem Statement', '', 'Body.', '',
      '## Decision Outcome', '', 'Outcome.', ''
    ].join('\n'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('Scope with type "platform" must have "platform" in its name');
});

test('reports scope-type core when scope name does not contain core', () => {
  const workspaceRoot = createWorkspace('scope-type-core-invalid-name', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: core\nname: myteam\ndescription: Team scope for tests.\napply-to: Test team only\nvalid-from: 2026-01-01\n---\n\n# myteam Scope Overview\n\nTeam scope for tests.\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex([
      '- [001-team](principles/001-team.md) - Team decision'
    ]),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('Scope with type "core" must have "core" in its name');
});

test('accepts scope-type core when scope name contains core', () => {
  const workspaceRoot = createWorkspace('valid-core-type', {
    '.xdrs/index.md': rootIndex(['[myarea-core](myarea-core/index.md)']),
    '.xdrs/myarea-core/index.md': '---\nscope-type: core\nname: myarea-core\ndescription: Meta-governance scope for the myarea group of scopes.\napply-to: All scopes in the myarea group\nvalid-from: 2026-01-01\n---\n\n# myarea-core Scope Overview\n\nMeta-governance.\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myarea-core/adrs/index.md': teamAdrIndex([
      '- [001-team](principles/001-team.md) - Team decision'
    ]),
    '.xdrs/myarea-core/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).not.toContain('Scope with type "core"');
  expect(result.errors.join('\n')).not.toContain('Scope index frontmatter');
});

test('reports scope-type _local used on non-_local scope', () => {
  const workspaceRoot = createWorkspace('scope-type-local-reserved', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: _local\nname: myteam\ndescription: Team scope for tests.\napply-to: Test team only\nvalid-from: 2026-01-01\n---\n\n# myteam Scope Overview\n\nTeam scope for tests.\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex([
      '- [001-team](principles/001-team.md) - Team decision'
    ]),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('Scope type "_local" is reserved for the "_local" scope');
});

test('reports _local scope with wrong scope-type', () => {
  const workspaceRoot = createWorkspace('scope-type-local-wrong-type', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/index.md': '---\nscope-type: standard\nname: _local\ndescription: Local scope for tests.\napply-to: Test workspace only\nvalid-from: 2026-01-01\n---\n\n# _local Scope Overview\n\nLocal scope for tests.\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': xdrDocument('Test body.'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('Scope "_local" must have scope-type "_local"');
});

test('accepts custom scope-type when policy exists in core-type scope', () => {
  const workspaceRoot = createWorkspace('custom-scope-type-valid', {
    '.xdrs/index.md': rootIndex(['[my-custom](my-custom/index.md)']),
    '.xdrs/my-custom/index.md': '---\nscope-type: custom\nname: my-custom\ndescription: Custom scope.\napply-to: All\nvalid-from: 2026-01-01\n---\n\n# my-custom Scope Overview\n\nCustom.\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/my-custom/adrs/index.md': teamAdrIndex([
      '- [001-custom](principles/001-custom.md) - Custom'
    ]),
    '.xdrs/my-custom/adrs/principles/001-custom.md': teamXdrDocument('Custom decision.'),
    ...coreWithScopeTypes(['custom']),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).not.toContain('has no corresponding');
  expect(result.errors.join('\n')).not.toContain('Scope index frontmatter');
});

test('accepts custom scope-type when policy exists in a non-core scope', () => {
  // domain-scope-type.md is in a platform-type scope (not a core scope), but lint should still find it
  const workspaceRoot = createWorkspace('custom-scope-type-in-non-core-scope', {
    '.xdrs/index.md': rootIndex(['[nnb-mt-domain](nnb-mt-domain/index.md)', '[my-platform](my-platform/index.md)']),
    '.xdrs/nnb-mt-domain/index.md': '---\nscope-type: domain\nname: nnb-mt-domain\ndescription: Domain scope.\napply-to: All\nvalid-from: 2026-01-01\n---\n\n# nnb-mt-domain Scope Overview\n\nDomain scope.\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/nnb-mt-domain/adrs/index.md': teamAdrIndex([]),
    // scope-type 'domain' defined in a non-core platform scope (not _core)
    '.xdrs/my-platform/index.md': '---\nscope-type: platform\nname: my-platform\ndescription: Platform scope.\napply-to: All\nvalid-from: 2026-01-01\n---\n\n# my-platform Scope Overview\n\nPlatform scope.\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/my-platform/adrs/index.md': [
      '# my-platform ADR Index', '', 'Platform ADRs.', '', '## principles', '',
      '- [001-domain-scope-type](principles/001-domain-scope-type.md) - domain type', ''
    ].join('\n'),
    '.xdrs/my-platform/adrs/principles/001-domain-scope-type.md': [
      '---', 'name: my-platform-adr-policy-001-domain-scope-type',
      'description: Defines the domain scope type.', 'apply-to: All', 'valid-from: 2026-01-01', '---', '',
      '# my-platform-adr-policy-001: domain scope type', '', '## Context and Problem Statement', '',
      'Defines the domain scope type.', '', '## Decision Outcome', '', 'Use scope-type: domain.', ''
    ].join('\n'),
    // _core only defines 'core' and 'platform' — no 'domain' here
    ...coreWithScopeTypes(['platform']),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).not.toContain('has no corresponding');
  expect(result.errors.join('\n')).not.toContain('Scope index frontmatter');
});

test('reports custom scope-type when no policy exists', () => {
  const workspaceRoot = createWorkspace('custom-scope-type-missing-policy', {
    '.xdrs/index.md': rootIndex(['[my-scope](my-scope/index.md)']),
    '.xdrs/my-scope/index.md': '---\nscope-type: unknown-type\nname: my-scope\ndescription: Unknown type scope.\napply-to: All\nvalid-from: 2026-01-01\n---\n\n# my-scope Scope Overview\n\nUnknown.\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/my-scope/adrs/index.md': teamAdrIndex([]),
    ...coreWithScopeTypes([]),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('has no corresponding unknown-type-scope-type policy');
});

test('validates parent scope-type exists in inheritance chain', () => {
  const workspaceRoot = createWorkspace('scope-type-inheritance-valid', {
    '.xdrs/index.md': rootIndex(['[my-custom](my-custom/index.md)', '[_core](_core/index.md)']),
    '.xdrs/my-custom/index.md': '---\nscope-type: custom\nname: my-custom\ndescription: Custom scope.\napply-to: All\nvalid-from: 2026-01-01\n---\n\n# my-custom Scope Overview\n\nCustom.\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/my-custom/adrs/index.md': teamAdrIndex([]),
    '.xdrs/_core/index.md': '---\nscope-type: core\nname: _core\ndescription: Core scope.\napply-to: All\nvalid-from: 2026-01-01\n---\n\n# _core\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/_core/adrs/index.md': [
      '# _core ADR Index', '', 'Core ADRs.', '', '## principles', '',
      '- [001-core-scope-type](principles/001-core-scope-type.md) - core type',
      '- [002-standard-scope-type](principles/002-standard-scope-type.md) - standard type',
      '- [003-custom-scope-type](principles/003-custom-scope-type.md) - custom type',
      ''
    ].join('\n'),
    '.xdrs/_core/adrs/principles/001-core-scope-type.md': '---\nname: _core-adr-policy-001-core-scope-type\ndescription: core stub\napply-to: All\nvalid-from: 2026-01-01\n---\n\n## Context and Problem Statement\n\nStub.\n\n## Decision Outcome\n\nStub.\n',
    '.xdrs/_core/adrs/principles/002-standard-scope-type.md': '---\nname: _core-adr-policy-002-standard-scope-type\ndescription: standard stub\napply-to: All\nvalid-from: 2026-01-01\n---\n\n## Context and Problem Statement\n\nStub.\n\n## Decision Outcome\n\nStub.\n',
    '.xdrs/_core/adrs/principles/003-custom-scope-type.md': '---\nname: _core-adr-policy-003-custom-scope-type\ndescription: custom type with parent\napply-to: All\nvalid-from: 2026-01-01\n---\n\n## Context and Problem Statement\n\nCustom type.\n\n## Decision Outcome\n\nCustom.\n\n#### 01-parent-scope-type\n\nInstances inherit all rules from the `standard` scope type.\n',
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).not.toContain('declares parent');
  expect(result.errors.join('\n')).not.toContain('has no corresponding');
});

test('reports error when parent scope-type in chain does not exist', () => {
  const workspaceRoot = createWorkspace('scope-type-inheritance-missing-parent', {
    '.xdrs/index.md': rootIndex(['[my-custom](my-custom/index.md)', '[_core](_core/index.md)']),
    '.xdrs/my-custom/index.md': '---\nscope-type: custom\nname: my-custom\ndescription: Custom scope.\napply-to: All\nvalid-from: 2026-01-01\n---\n\n# my-custom Scope Overview\n\nCustom.\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/my-custom/adrs/index.md': teamAdrIndex([]),
    '.xdrs/_core/index.md': '---\nscope-type: core\nname: _core\ndescription: Core scope.\napply-to: All\nvalid-from: 2026-01-01\n---\n\n# _core\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/_core/adrs/index.md': [
      '# _core ADR Index', '', 'Core ADRs.', '', '## principles', '',
      '- [001-core-scope-type](principles/001-core-scope-type.md) - core type',
      '- [002-custom-scope-type](principles/002-custom-scope-type.md) - custom type',
      ''
    ].join('\n'),
    '.xdrs/_core/adrs/principles/001-core-scope-type.md': '---\nname: _core-adr-policy-001-core-scope-type\ndescription: core stub\napply-to: All\nvalid-from: 2026-01-01\n---\n\n## Context and Problem Statement\n\nStub.\n\n## Decision Outcome\n\nStub.\n',
    '.xdrs/_core/adrs/principles/002-custom-scope-type.md': '---\nname: _core-adr-policy-002-custom-scope-type\ndescription: custom type with missing parent\napply-to: All\nvalid-from: 2026-01-01\n---\n\n## Context and Problem Statement\n\nCustom.\n\n## Decision Outcome\n\nCustom.\n\n#### 01-parent-scope-type\n\nInstances inherit from the `nonexistent-parent` scope type.\n',
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('declares parent "nonexistent-parent" but no nonexistent-parent-scope-type policy exists');
});

test('reports cycle in scope-type inheritance chain', () => {
  const workspaceRoot = createWorkspace('scope-type-inheritance-cycle', {
    '.xdrs/index.md': rootIndex(['[my-custom](my-custom/index.md)', '[_core](_core/index.md)']),
    '.xdrs/my-custom/index.md': '---\nscope-type: child\nname: my-custom\ndescription: Custom scope.\napply-to: All\nvalid-from: 2026-01-01\n---\n\n# my-custom Scope Overview\n\nCustom.\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/my-custom/adrs/index.md': teamAdrIndex([]),
    '.xdrs/_core/index.md': '---\nscope-type: core\nname: _core\ndescription: Core scope.\napply-to: All\nvalid-from: 2026-01-01\n---\n\n# _core\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/_core/adrs/index.md': [
      '# _core ADR Index', '', 'Core ADRs.', '', '## principles', '',
      '- [001-core-scope-type](principles/001-core-scope-type.md) - core type',
      '- [002-parent-scope-type](principles/002-parent-scope-type.md) - parent type',
      '- [003-child-scope-type](principles/003-child-scope-type.md) - child type',
      ''
    ].join('\n'),
    '.xdrs/_core/adrs/principles/001-core-scope-type.md': '---\nname: _core-adr-policy-001-core-scope-type\ndescription: core stub\napply-to: All\nvalid-from: 2026-01-01\n---\n\n## Context and Problem Statement\n\nStub.\n\n## Decision Outcome\n\nStub.\n',
    '.xdrs/_core/adrs/principles/002-parent-scope-type.md': '---\nname: _core-adr-policy-002-parent-scope-type\ndescription: parent type that cycles back to child\napply-to: All\nvalid-from: 2026-01-01\n---\n\n## Context and Problem Statement\n\nParent.\n\n## Decision Outcome\n\nParent.\n\n#### 01-parent-scope-type\n\nInstances inherit from the `child` scope type.\n',
    '.xdrs/_core/adrs/principles/003-child-scope-type.md': '---\nname: _core-adr-policy-003-child-scope-type\ndescription: child type that points to parent\napply-to: All\nvalid-from: 2026-01-01\n---\n\n## Context and Problem Statement\n\nChild.\n\n## Decision Outcome\n\nChild.\n\n#### 01-parent-scope-type\n\nInstances inherit from the `parent` scope type.\n',
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('creates a cycle in the scope-type inheritance chain');
  expect(result.errors.join('\n')).toContain('my-custom/index.md');
});

test('reports scope-type with reserved underscore prefix', () => {
  const workspaceRoot = createWorkspace('scope-type-underscore-prefix', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: _custom\nname: myteam\ndescription: Team scope for tests.\napply-to: Test team only\nvalid-from: 2026-01-01\n---\n\n# myteam Scope Overview\n\nTeam scope for tests.\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex([
      '- [001-team](principles/001-team.md) - Team decision'
    ]),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
    ...coreWithScopeTypes([]),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('uses a reserved "_" prefix');
  expect(result.errors.join('\n')).toContain('myteam/index.md');
});

test('does not report underscore prefix error for valid _local scope type', () => {
  const workspaceRoot = createWorkspace('scope-type-local-no-prefix-error', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/index.md': localScopeIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': xdrDocument('Test body.'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).not.toContain('uses a reserved "_" prefix');
});

test('reports follows that references the scope itself', () => {
  const workspaceRoot = createWorkspace('follows-self-reference', {
    '.xdrs/index.md': rootIndex(['[myarea-core](myarea-core/index.md)']),
    '.xdrs/myarea-core/index.md': '---\nscope-type: core\nname: myarea-core\ndescription: Meta-governance for myarea.\napply-to: All myarea scopes\nvalid-from: 2026-01-01\nfollows: myarea-core\n---\n\n# myarea-core Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myarea-core/adrs/index.md': teamAdrIndex([
      '- [001-team](principles/001-team.md) - Team decision'
    ]),
    '.xdrs/myarea-core/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('follows must not reference the scope itself');
  expect(result.errors.join('\n')).toContain('myarea-core/index.md');
});

test('reports follows that references _core', () => {
  const workspaceRoot = createWorkspace('follows-core-reference', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: myteam\ndescription: Team.\napply-to: Test team\nvalid-from: 2026-01-01\nfollows: _core\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex([
      '- [001-team](principles/001-team.md) - Team decision'
    ]),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('follows must not reference "_core" as it is always applied implicitly');
  expect(result.errors.join('\n')).toContain('myteam/index.md');
});

test('reports follows list that includes _core', () => {
  const workspaceRoot = createWorkspace('follows-list-includes-core', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)', '[myarea-core](myarea-core/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: myteam\ndescription: Team.\napply-to: Test team\nvalid-from: 2026-01-01\nfollows:\n  - myarea-core\n  - _core\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex([
      '- [001-team](principles/001-team.md) - Team decision'
    ]),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
    '.xdrs/myarea-core/index.md': '---\nscope-type: core\nname: myarea-core\ndescription: Meta-governance for myarea.\napply-to: All myarea scopes\nvalid-from: 2026-01-01\n---\n\n# myarea-core Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myarea-core/adrs/index.md': teamAdrIndex([
      '- [001-team](principles/001-team.md) - Team decision'
    ]),
    '.xdrs/myarea-core/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('follows must not reference "_core" as it is always applied implicitly');
});

test('reports duplicate scope-local standards policies in same scope', () => {
  const workspaceRoot = createWorkspace('duplicate-scope-local-standards', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/myteam/index.md': teamScopeIndex(),
    '.xdrs/myteam/adrs/index.md': teamAdrIndex([
      '- [001-team](principles/001-team.md) - Team decision',
      '- [002-myteam-core](principles/002-myteam-core.md) - Local standards',
      '- [003-myteam-core-dup](principles/003-myteam-core-dup.md) - Duplicate local standards',
    ]),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
    '.xdrs/myteam/adrs/principles/002-myteam-core.md': [
      '---',
      'name: myteam-adr-policy-002-myteam-core',
      'description: Local standards for myteam.',
      'apply-to: myteam scope',
      'valid-from: 2026-01-01',
      '---',
      '',
      '# myteam-adr-policy-002: myteam local standards',
      '',
      '## Context and Problem Statement',
      '',
      'Defines local authoring standards.',
      '',
      '## Decision Outcome',
      '',
      'Standard outcome.',
      ''
    ].join('\n'),
    '.xdrs/myteam/adrs/principles/003-myteam-core-dup.md': [
      '---',
      'name: myteam-adr-policy-003-myteam-core',
      'description: Duplicate local standards for myteam.',
      'apply-to: myteam scope',
      'valid-from: 2026-01-01',
      '---',
      '',
      '# myteam-adr-policy-003: myteam local standards duplicate',
      '',
      '## Context and Problem Statement',
      '',
      'Duplicate defines local authoring standards.',
      '',
      '## Decision Outcome',
      '',
      'Duplicate outcome.',
      ''
    ].join('\n'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('has more than one scope-local standards policy');
  expect(result.errors.join('\n')).toContain('myteam-core');
});

test('accepts single scope-local standards policy in a scope', () => {
  const workspaceRoot = createWorkspace('single-scope-local-standards', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/myteam/index.md': teamScopeIndex(),
    '.xdrs/myteam/adrs/index.md': teamAdrIndex([
      '- [001-team](principles/001-team.md) - Team decision',
      '- [002-myteam-core](principles/002-myteam-core.md) - Local standards',
    ]),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
    '.xdrs/myteam/adrs/principles/002-myteam-core.md': [
      '---',
      'name: myteam-adr-policy-002-myteam-core',
      'description: Local standards for myteam.',
      'apply-to: myteam scope',
      'valid-from: 2026-01-01',
      '---',
      '',
      '# myteam-adr-policy-002: myteam local standards',
      '',
      '## Context and Problem Statement',
      '',
      'Defines local authoring standards.',
      '',
      '## Decision Outcome',
      '',
      'Standard outcome.',
      ''
    ].join('\n'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).not.toContain('has more than one scope-local standards policy');
});

test('reports missing name field in scope index frontmatter', () => {
  const workspaceRoot = createWorkspace('scope-index-missing-name', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: standard\ndescription: Team.\napply-to: Test team\nvalid-from: 2026-01-01\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('Scope index frontmatter must include a non-empty name field');
});

test('reports name mismatch in scope index frontmatter', () => {
  const workspaceRoot = createWorkspace('scope-index-name-mismatch', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: wrong-name\ndescription: Team.\napply-to: Test team\nvalid-from: 2026-01-01\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('Scope index frontmatter name must match scope directory name "myteam"');
});

test('reports missing description field in scope index frontmatter', () => {
  const workspaceRoot = createWorkspace('scope-index-missing-description', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: myteam\napply-to: Test team\nvalid-from: 2026-01-01\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('Scope index frontmatter must include a non-empty description field');
});

test('reports missing apply-to field in scope index frontmatter', () => {
  const workspaceRoot = createWorkspace('scope-index-missing-apply-to', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: myteam\ndescription: Team.\nvalid-from: 2026-01-01\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('Scope index frontmatter must include an apply-to field');
});

test('reports missing valid-from field in scope index frontmatter', () => {
  const workspaceRoot = createWorkspace('scope-index-missing-valid-from', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: myteam\ndescription: Team.\napply-to: Test team\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('Scope index frontmatter must include a valid-from field');
});

test('reports invalid valid-from date in scope index frontmatter', () => {
  const workspaceRoot = createWorkspace('scope-index-invalid-valid-from', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: myteam\ndescription: Team.\napply-to: Test team\nvalid-from: not-a-date\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('Scope index frontmatter valid-from must be a valid ISO date YYYY-MM-DD');
});

test('reports unknown field in scope index frontmatter', () => {
  const workspaceRoot = createWorkspace('scope-index-unknown-field', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: myteam\ndescription: Team.\napply-to: Test team\nvalid-from: 2026-01-01\nunknown-field: value\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('Scope index frontmatter has unknown field "unknown-field"');
});

test('accepts all valid scope index frontmatter fields', () => {
  const workspaceRoot = createWorkspace('valid-all-scope-fields', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: myteam\ndescription: Team.\napply-to: Test team\nvalid-from: 2026-01-01\nlicense: MIT\nmetadata:\n  owner: team\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).not.toContain('Scope index frontmatter');
});

test('accepts follows as a list of core scope names in scope index frontmatter', () => {
  const workspaceRoot = createWorkspace('valid-scope-follows-list', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)', '[myarea-core](myarea-core/index.md)', '[shared-standards-core](shared-standards-core/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: myteam\ndescription: Team.\napply-to: Test team\nvalid-from: 2026-01-01\nfollows:\n  - myarea-core\n  - shared-standards-core\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
    '.xdrs/myarea-core/index.md': '---\nscope-type: core\nname: myarea-core\ndescription: Meta-governance for myarea.\napply-to: All myarea scopes\nvalid-from: 2026-01-01\n---\n\n# myarea-core Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myarea-core/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myarea-core/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
    '.xdrs/shared-standards-core/index.md': '---\nscope-type: core\nname: shared-standards-core\ndescription: Shared standards for all areas.\napply-to: All scopes\nvalid-from: 2026-01-01\n---\n\n# shared-standards-core Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/shared-standards-core/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/shared-standards-core/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).not.toContain('Scope index frontmatter follows');
});

test('accepts follows as a single core scope name string in scope index frontmatter', () => {
  const workspaceRoot = createWorkspace('valid-scope-follows-string', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)', '[myarea-core](myarea-core/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: myteam\ndescription: Team.\napply-to: Test team\nvalid-from: 2026-01-01\nfollows: myarea-core\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
    '.xdrs/myarea-core/index.md': '---\nscope-type: core\nname: myarea-core\ndescription: Meta-governance for myarea.\napply-to: All myarea scopes\nvalid-from: 2026-01-01\n---\n\n# myarea-core Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myarea-core/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myarea-core/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).not.toContain('Scope index frontmatter follows');
});

test('accepts follows as a comma-separated list of core scope names in scope index frontmatter', () => {
  const workspaceRoot = createWorkspace('valid-scope-follows-comma', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)', '[myarea-core](myarea-core/index.md)', '[shared-standards-core](shared-standards-core/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: myteam\ndescription: Team.\napply-to: Test team\nvalid-from: 2026-01-01\nfollows: myarea-core, shared-standards-core\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
    '.xdrs/myarea-core/index.md': '---\nscope-type: core\nname: myarea-core\ndescription: Meta-governance for myarea.\napply-to: All myarea scopes\nvalid-from: 2026-01-01\n---\n\n# myarea-core Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myarea-core/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myarea-core/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
    '.xdrs/shared-standards-core/index.md': '---\nscope-type: core\nname: shared-standards-core\ndescription: Shared standards for all areas.\napply-to: All scopes\nvalid-from: 2026-01-01\n---\n\n# shared-standards-core Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/shared-standards-core/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/shared-standards-core/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).not.toContain('Scope index frontmatter follows');
});

test('reports invalid follows value in scope index frontmatter', () => {
  const workspaceRoot = createWorkspace('invalid-scope-follows', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: myteam\ndescription: Team.\napply-to: Test team\nvalid-from: 2026-01-01\nfollows: 123\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('Scope index frontmatter follows must be a core scope name or list of core scope names');
});

test('reports follows scope that does not exist in workspace', () => {
  const workspaceRoot = createWorkspace('follows-missing-scope', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: myteam\ndescription: Team.\napply-to: Test team\nvalid-from: 2026-01-01\nfollows: nonexistent-core\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('follows references scope "nonexistent-core" which does not exist in the workspace');
});

test('accepts follows scope that exists in workspace', () => {
  const workspaceRoot = createWorkspace('follows-existing-scope', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)', '[myarea-core](myarea-core/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: myteam\ndescription: Team.\napply-to: Test team\nvalid-from: 2026-01-01\nfollows: myarea-core\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
    '.xdrs/myarea-core/index.md': '---\nscope-type: core\nname: myarea-core\ndescription: Meta-governance for myarea.\napply-to: All myarea scopes\nvalid-from: 2026-01-01\n---\n\n# myarea-core Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myarea-core/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myarea-core/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).not.toContain('follows references scope');
});

test('reports follows scope that is not core-type', () => {
  const workspaceRoot = createWorkspace('follows-non-core-scope', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)', '[myarea-domain](myarea-domain/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: myteam\ndescription: Team.\napply-to: Test team\nvalid-from: 2026-01-01\nfollows: myarea-domain\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
    '.xdrs/myarea-domain/index.md': '---\nscope-type: standard\nname: myarea-domain\ndescription: Domain scope, not a core scope.\napply-to: All domain teams\nvalid-from: 2026-01-01\n---\n\n# myarea-domain Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myarea-domain/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myarea-domain/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('follows references scope "myarea-domain" which is not a core-type scope');
});

test('reports scope index apply-to exceeding 30 words', () => {
  const workspaceRoot = createWorkspace('scope-apply-to-too-long', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: myteam\ndescription: Team.\napply-to: All backend frontend mobile data and infrastructure teams in the organization that build deploy operate or maintain services on the shared platform including external contractors working on integration projects and testing\nvalid-from: 2026-01-01\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('Scope index frontmatter apply-to must be 30 words or fewer');
});

test('reports scope index description exceeding 40 words', () => {
  const workspaceRoot = createWorkspace('scope-description-too-long', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: myteam\ndescription: This scope description is intentionally too long in order to verify that the linter correctly reports an error when the description field of a scope index frontmatter contains more than forty words in total which is supposed to exceed the enforced word count limit for descriptions\napply-to: Test team\nvalid-from: 2026-01-01\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('Scope index frontmatter description must be 40 words or fewer');
});

test('accepts related-scopes as a list of scope names in scope index frontmatter', () => {
  const workspaceRoot = createWorkspace('valid-scope-related-scopes-list', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)', '[sibling-team](sibling-team/index.md)', '[parent-domain](parent-domain/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: myteam\ndescription: Team.\napply-to: Test team\nvalid-from: 2026-01-01\nrelated-scopes:\n  - sibling-team\n  - parent-domain\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
    '.xdrs/sibling-team/index.md': '---\nscope-type: standard\nname: sibling-team\ndescription: Sibling team.\napply-to: Sibling team\nvalid-from: 2026-01-01\n---\n\n# sibling-team Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/sibling-team/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/sibling-team/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
    '.xdrs/parent-domain/index.md': '---\nscope-type: standard\nname: parent-domain\ndescription: Parent domain.\napply-to: Parent domain\nvalid-from: 2026-01-01\n---\n\n# parent-domain Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/parent-domain/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/parent-domain/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).not.toContain('Scope index frontmatter related-scopes');
});

test('accepts related-scopes as a single scope name string in scope index frontmatter', () => {
  const workspaceRoot = createWorkspace('valid-scope-related-scopes-string', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)', '[sibling-team](sibling-team/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: myteam\ndescription: Team.\napply-to: Test team\nvalid-from: 2026-01-01\nrelated-scopes: sibling-team\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
    '.xdrs/sibling-team/index.md': '---\nscope-type: standard\nname: sibling-team\ndescription: Sibling team.\napply-to: Sibling team\nvalid-from: 2026-01-01\n---\n\n# sibling-team Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/sibling-team/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/sibling-team/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).not.toContain('Scope index frontmatter related-scopes');
});

test('reports invalid related-scopes value in scope index frontmatter', () => {
  const workspaceRoot = createWorkspace('invalid-scope-related-scopes', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: myteam\ndescription: Team.\napply-to: Test team\nvalid-from: 2026-01-01\nrelated-scopes: 123\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('Scope index frontmatter related-scopes must be a scope name or list of scope names');
});

test('reports related-scopes scope that does not exist in workspace', () => {
  const workspaceRoot = createWorkspace('related-scopes-missing-scope', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: myteam\ndescription: Team.\napply-to: Test team\nvalid-from: 2026-01-01\nrelated-scopes: nonexistent-scope\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('related-scopes references scope "nonexistent-scope" which does not exist in the workspace');
});

test('accepts related-scopes scope that exists in workspace', () => {
  const workspaceRoot = createWorkspace('related-scopes-existing-scope', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)', '[sibling-team](sibling-team/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: myteam\ndescription: Team.\napply-to: Test team\nvalid-from: 2026-01-01\nrelated-scopes: sibling-team\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
    '.xdrs/sibling-team/index.md': '---\nscope-type: standard\nname: sibling-team\ndescription: Sibling team.\napply-to: Sibling team\nvalid-from: 2026-01-01\n---\n\n# sibling-team Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/sibling-team/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/sibling-team/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).not.toContain('related-scopes references scope "sibling-team"');
});

test('reports duplicate entries in follows list', () => {
  const workspaceRoot = createWorkspace('follows-duplicate-entries', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)', '[myarea-core](myarea-core/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: myteam\ndescription: Team.\napply-to: Test team\nvalid-from: 2026-01-01\nfollows:\n  - myarea-core\n  - myarea-core\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
    '.xdrs/myarea-core/index.md': '---\nscope-type: core\nname: myarea-core\ndescription: Meta-governance for myarea.\napply-to: All myarea scopes\nvalid-from: 2026-01-01\n---\n\n# myarea-core Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myarea-core/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myarea-core/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('follows has duplicate entry "myarea-core"');
});

test('reports duplicate entries in follows comma-separated list', () => {
  const workspaceRoot = createWorkspace('follows-comma-duplicate-entries', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)', '[myarea-core](myarea-core/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: myteam\ndescription: Team.\napply-to: Test team\nvalid-from: 2026-01-01\nfollows: myarea-core, myarea-core\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
    '.xdrs/myarea-core/index.md': '---\nscope-type: core\nname: myarea-core\ndescription: Meta-governance for myarea.\napply-to: All myarea scopes\nvalid-from: 2026-01-01\n---\n\n# myarea-core Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myarea-core/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myarea-core/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('follows has duplicate entry "myarea-core"');
});

test('reports related-scopes that references the scope itself', () => {
  const workspaceRoot = createWorkspace('related-scopes-self-reference', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: myteam\ndescription: Team.\napply-to: Test team\nvalid-from: 2026-01-01\nrelated-scopes: myteam\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('related-scopes must not reference the scope itself');
});

test('reports duplicate entries in related-scopes list', () => {
  const workspaceRoot = createWorkspace('related-scopes-duplicate-entries', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)', '[sibling-team](sibling-team/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: myteam\ndescription: Team.\napply-to: Test team\nvalid-from: 2026-01-01\nrelated-scopes:\n  - sibling-team\n  - sibling-team\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
    '.xdrs/sibling-team/index.md': '---\nscope-type: standard\nname: sibling-team\ndescription: Sibling team.\napply-to: Sibling team\nvalid-from: 2026-01-01\n---\n\n# sibling-team Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/sibling-team/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/sibling-team/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('related-scopes has duplicate entry "sibling-team"');
});

test('reports related-scopes entry that is already declared in follows', () => {
  const workspaceRoot = createWorkspace('related-scopes-follows-overlap', {
    '.xdrs/index.md': rootIndex(['[myteam](myteam/index.md)', '[myarea-core](myarea-core/index.md)']),
    '.xdrs/myteam/index.md': '---\nscope-type: standard\nname: myteam\ndescription: Team.\napply-to: Test team\nvalid-from: 2026-01-01\nfollows: myarea-core\nrelated-scopes: myarea-core\n---\n\n# myteam Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myteam/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myteam/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
    '.xdrs/myarea-core/index.md': '---\nscope-type: core\nname: myarea-core\ndescription: Meta-governance for myarea.\napply-to: All myarea scopes\nvalid-from: 2026-01-01\n---\n\n# myarea-core Scope Overview\n\n[ADRs](adrs/index.md)\n',
    '.xdrs/myarea-core/adrs/index.md': teamAdrIndex(['- [001-team](principles/001-team.md) - Team decision']),
    '.xdrs/myarea-core/adrs/principles/001-team.md': teamXdrDocument('Team decision.'),
  });

  const result = lintWorkspace(workspaceRoot, { ignoreExternal: false });

  expect(result.errors.join('\n')).toContain('related-scopes must not repeat scope "myarea-core" already declared in follows');
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
    '.xdrs/_local/index.md': localScopeIndex(),
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

test('allows nested directories in .assets', () => {
  const workspaceRoot = createWorkspace('asset-subdir-allowed', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/index.md': localScopeIndex(),
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
      'See ![img](.assets/grouped/used.png).',
      '',
      '## Decision Outcome',
      '',
      'Test decision outcome.',
      ''
    ].join('\n'),
    '.xdrs/_local/adrs/principles/.assets/grouped/used.png': Buffer.alloc(0),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).not.toContain('.assets directory must be flat');
});

function localScopeIndex() {
  return [
    '---',
    'scope-type: _local',
    'name: _local',
    'description: Local scope for tests.',
    'apply-to: Test workspace only',
    'valid-from: 2026-01-01',
    '---',
    '',
    '# _local Scope Overview',
    '',
    'Local scope for tests.',
    '',
    '[ADRs](adrs/index.md)',
    ''
  ].join('\n');
}

/**
 * Returns an object of file paths → content for a minimal `_core` scope containing
 * stub scope-type definition policies for each listed type name.
 * Always includes 'core' so _core can validate itself.
 */
function coreWithScopeTypes(types) {
  const allTypes = Array.from(new Set(['core', ...types]));
  const files = {};
  const policyEntries = allTypes.map((t, i) => {
    const num = String(i + 1).padStart(3, '0');
    // _local uses 'local' in filename (no underscore allowed in NUMBERED_FILE_RE)
    const fileName = t === '_local' ? `${num}-local-scope-type.md` : `${num}-${t}-scope-type.md`;
    files[`.xdrs/_core/adrs/principles/${fileName}`] = [
      '---',
      `name: _core-adr-policy-${num}-${t}-scope-type`,
      `description: Defines the ${t} scope type.`,
      'apply-to: All XDRS scopes',
      'valid-from: 2026-01-01',
      '---',
      '',
      `# _core-adr-policy-${num}: ${t} scope type`,
      '',
      '## Context and Problem Statement',
      '',
      `Defines the ${t} scope type.`,
      '',
      '## Decision Outcome',
      '',
      `Use scope-type: ${t} when appropriate.`,
      ''
    ].join('\n');
    return `- [${num}-${t}-scope-type](principles/${fileName}) - ${t} scope type`;
  });
  files['.xdrs/_core/adrs/index.md'] = [
    '# _core ADR Index',
    '',
    'Core ADRs for tests.',
    '',
    '## principles',
    '',
    ...policyEntries,
    ''
  ].join('\n');
  files['.xdrs/_core/index.md'] = [
    '---',
    'scope-type: core',
    'name: _core',
    'description: Core framework scope for tests.',
    'apply-to: All XDRS scopes',
    'valid-from: 2026-01-01',
    '---',
    '',
    '# _core Scope Overview',
    '',
    'Framework scope for tests.',
    '',
    '[ADRs](adrs/index.md)',
    ''
  ].join('\n');
  return files;
}

function teamScopeIndex() {
  return [
    '---',
    'scope-type: standard',
    'name: myteam',
    'description: Team scope for tests.',
    'apply-to: Test team only',
    'valid-from: 2026-01-01',
    '---',
    '',
    '# myteam Scope Overview',
    '',
    'Team scope for tests.',
    '',
    '[ADRs](adrs/index.md)',
    ''
  ].join('\n');
}

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

  // Detect all scope-type values used in the files being created.
  // If any non-_local scope types are present and _core is not already included,
  // auto-inject a minimal _core scope with the required scope-type policy stubs.
  const scopeTypeValues = new Set();
  for (const content of Object.values(files)) {
    if (typeof content !== 'string') continue;
    const matches = content.matchAll(/^scope-type:\s*(.+)$/gm);
    for (const m of matches) {
      const t = m[1].trim();
      if (t !== '_local') scopeTypeValues.add(t);
    }
  }
  const hasCoreScope = Object.keys(files).some((p) => p.includes('/_core/'));
  if (scopeTypeValues.size > 0 && !hasCoreScope) {
    const coreFiles = coreWithScopeTypes([...scopeTypeValues]);
    Object.assign(files, coreFiles);
  }

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
    'name: 001-check-links',
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
    'my-decisions/_local/index.md': localScopeIndex(),
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
    '.xdrs/_local/index.md': localScopeIndex(),
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
    '.xdrs/_local/index.md': localScopeIndex(),
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

  expect(result.errors.join('\n')).toContain('Slide frontmatter must include marp: true as the first key');
});

test('reports slide file with marp: true not as the first frontmatter key', () => {
  const workspaceRoot = createWorkspace('slide-marp-not-first', {
    '.xdrs/index.md': rootIndex(),
    '.xdrs/_local/adrs/index.md': localAdrIndex([
      '- [001-main](principles/001-main.md) - Main decision'
    ]),
    '.xdrs/_local/adrs/principles/001-main.md': xdrDocument('Body.\n\n[Slides](.assets/001-main-slides.md)'),
    '.xdrs/_local/adrs/principles/.assets/001-main-slides.md': [
      '---',
      'theme: default',
      'marp: true',
      '---',
      '',
      '# Slides',
      '',
      '[Parent](../001-main.md)',
      ''
    ].join('\n'),
  });

  const result = lintWorkspace(workspaceRoot);

  expect(result.errors.join('\n')).toContain('Slide frontmatter must include marp: true as the first key');
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
    '.xdrs/_local/index.md': localScopeIndex(),
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