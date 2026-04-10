'use strict';

const path = require('path');
const { copilotCmd, testPrompt } = require('xdrs-core');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..', '..');

jest.setTimeout(300000);

test('002-write-xdr creates a local EDR decision record', async () => {
	const err = await testPrompt(
		{
			workspaceRoot: REPO_ROOT,
			workspaceMode: 'copy',
			...copilotCmd(REPO_ROOT),
		},
		'Create a very small XDR deciding to use pnpm for Node.js monorepos',
		'Verify that an XDR markdown file was created under .xdrs/_local/edrs/devops/, that it contains "## Context and Problem Statement" and "## Decision Outcome", that it read file 002-write-xdr/SKILL.md and has the decision of using pnpm for Node.js monorepos.',
		null,
		true
	);

	expect(err).toBe('');
});