'use strict';

const fs = require('fs');
const path = require('path');

const { testPrompt } = require('../../lib/testPrompt');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FAKE_COPILOT_PATH = path.join(REPO_ROOT, 'lib', 'tests', 'copilot');
const EXPECTED_RESEARCH_PATH = path.join(
	REPO_ROOT,
	'.xdrs',
	'_local',
	'adrs',
	'principles',
	'researches',
	'001-package-distribution-options.md'
);
const PROMPT = 'Create a research document comparing package distribution options for our XDR scopes. Use scope _local, type adrs, subject principles. The research should support a later ADR. Evaluate npm package delivery, git submodules, and manual copy-paste. Use document review and a comparison table as acceptable methods. The next step after this research is deciding whether to standardize npm distribution.';
const ASSERTION = 'Verify that a research file was created under .xdrs/_local/adrs/principles/researches/, that it contains the IMRAD sections Abstract, Introduction, Methods, Results, Discussion, Conclusion, and References, includes a Question: line in the introduction, references 006-research-standards.md, and that the final output mentions the created research path.';

jest.setTimeout(60000);

test('005-write-research creates an IMRAD research document in copy mode', () => {
	expect(fs.existsSync(EXPECTED_RESEARCH_PATH)).toBe(false);

	const err = testPrompt(
		{
			workspaceRoot: REPO_ROOT,
			workspaceMode: 'copy',
			promptCmd: createFakeCopilotCommand()
		},
		PROMPT,
		ASSERTION
	);

	expect(err).toBe('');
	expect(fs.existsSync(EXPECTED_RESEARCH_PATH)).toBe(false);
});

function createFakeCopilotCommand() {
	return [
		process.execPath,
		FAKE_COPILOT_PATH,
		'--add-dir={WORKSPACE_ROOT}',
		'--allow-all',
		'-p',
		'{PROMPT}'
	];
}