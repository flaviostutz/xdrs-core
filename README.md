# xdrs-core

XDRS is a framework to structure, compile and distribute Architectural (ADR), Business (BDR), and Engineering (EDR) decision records contents so that AI agents and humans can reliably find and use them with hierarchical scopes and controlled rollout in the format of distributable versioned packages. Decision Records are decomposed into Research (why), Policies (what), Skills (how), Plan (when) and Articles (views) with a well structured index structure and the definition of hierarchical scopes.

After preparation those elements can be downloaded anywhere and used to compose xdrs corpus, which can be used as a context source for AI agents, web site publishing, RAG applications etc.

> **Note:** This repository contains a minimum set of standards and a very basic set of ADRs that describe the proposed structure. It is intended to be used as a foundation that other projects can reference, extend, or install as a dependency in order to bootstrap and create their own XDRS packages.

## Objective

Policies capture Architectural (ADR), Business (BDR), and Engineering (EDR) decisions. As organizations grow, hundreds of decisions accumulate across teams, levels, and domains. Without a consistent structure, AI agents cannot efficiently locate the right decisions for a given context, and humans cannot maintain or evolve them sustainably.

This project defines a standard for organizing XDRS that satisfies the following requirements.

## XDRS elements

A traditional Decision Record normally combines several concerns in the same document:
- A **reason** (why the decision was made, options considered, evidence gathered)
- A **policy** (rules, core decision, what must be followed)
- A **plan** (consequences, implementation approach, how to roll out the decision)
- A **how-to** (step-by-step procedure for executing under the decision)
- A **view** (overview of the topic connecting related decisions together)

The XDRS framework separates these concerns into different document types, each with a clear role:

- **Policies** — Documents that captures a policy, core decision, rule, guardrails or any other boundary, captured from a Architectural (ADR), Business (BDR), or Engineering (EDR) documents. They are the source of truth. This is the core document type in the framework.
- **Research** — Exploratory documents that capture the problem being investigated, constraints or requirements, findings, and option tradeoffs that back a decision during its lifecycle. One research document may inform multiple downstream decisions, but it is not a replacement for the Policy.
- **Skills** — Step-by-step procedural guides that can be followed by humans, AI agents, or both. Skills are task-based artifacts with a concrete outcome and should include enough detail to verify the task was completed correctly. A skill may start as a fully manual procedure and evolve toward partial or full AI automation over time.
- **Articles** — Synthetic explanatory texts that combine information from multiple Policies, Research documents, and Skills around a specific topic or audience. They never replace Policies as source of truth.
- **Plans** — Ephemeral execution documents that describe a problem, proposed solution, and the approach and activities needed to solve it. Plans have a clear start and end and must be deleted after full implementation. Lasting outputs are captured as Policies, Skills, Articles, or other artifacts.

The compilation process of a raw Decision Record is to distribute it into those different documents and create links between them. You can also use the framework standalone, generating these elements individually directly during the writing process without starting from a raw Decision Record.

## Getting started

1. Create a new project workspace

2. On the workspace root folder, run `npx xdrs-core`

   The basic xdrs tooling should be installed in your workspace along with:
     - AGENTS.md pointing to the Policies structure
     - XDRS related skills and prompts for Copilot

3. Run a prompt such as:

   > Create a policy about our decision on using Python for AI related projects. For high volume projects (expected >1000 t/s), an exception can be made on using Golang.

   > Compile ADR 043-python-package-manager into the XDRS structure

## Examples

- [examples/basic-usage](examples/basic-usage) shows the minimal consumer flow for installing the packaged `xdrs-core` tarball, extracting files, checking drift, and linting the resulting tree.
- [examples/mydevkit](examples/mydevkit) shows a reusable extension package that uses `.filedistrc` as its package config source, composes `xdrs-core`, and ships its own named scope.
- For a fuller real-world package built on the same distribution model, see [flaviostutz/agentme](https://github.com/flaviostutz/agentme).


## Features

### Multi-scope support

Different teams at different organizational levels make decisions that apply to different audiences. XDRS are organized by scope (e.g. `_core`, `business-x`, `business-y-mobileapp`) so that each team owns its own decision space. Scopes can extend or override policies from broader scopes, with explicit precedence rules: scopes listed later in an index override those listed earlier.

### Subject grouping

Within each scope and type, decisions are grouped by subject (e.g. `application`, `data`, `platform` for ADRs; `product`, `finance` for BDRs). This keeps related decisions together, improves human navigation, and allows AI agents to narrow their search to the relevant subject folder before reading individual records.

### Extensibility

Over time, decisions from various teams and domains accumulate in a shared workspace. The folder structure `.xdrs/[scope]/[type]/[subject]/` is designed to accommodate new scopes, types, and subjects without reorganizing existing content. A root index at `.xdrs/index.md` points to all canonical scope indexes, and each canonical index is updated incrementally as new XDRS scopes are added.

### Distributability

XDRS packages are versioned and distributed via the npm registry. This allows teams to adopt specific decision sets at a specific version, rather than accepting all decisions at once. It avoids "all or nothing" situations when linting or checking adherence to decisions in the context of tech debt management. Teams can pin, upgrade, or override only the scopes that are relevant to them.

### AI-agent friendliness

The folder layout, file naming, and document format are designed so that AI agents can efficiently work with hundreds of decisions:

- Each Policy is a small, focused Markdown file (target under 1300 words), covering a set of rules or statements.
- The canonical index per scope and type lists all XDRS elements with short descriptions, enabling agents to identify relevant records without reading every file.
- The root index at `.xdrs/index.md` provides a single entry point for discovery.
- Policy metadata gives agents a first-pass filter: check `valid-from` for the convergence date, then check `apply-to`, and finally the decision text itself to confirm the decision should be used in the current context. All documents present in the collection are considered active.
- Decisions cross-reference each other by Policy ID rather than duplicating content, keeping individual files concise.
- Subject folders reduce the search space when a query maps to a known domain.

### Multi-agent framework support

Policies and skills must be usable by any type of AI agent, not only coding agents (e.g. GitHub Copilot, Cursor, Cline). General-purpose agent frameworks such as LangGraph, CrewAI, AutoGen, and similar orchestration runtimes must be able to consume Policies without relying on IDE-specific tooling or conventions.

This is especially important for BDRs: because business rules govern decisions that span both technical and non-technical workflows, agents built with any framework must be able to discover, fetch, and apply BDRs programmatically using only standard file-system or HTTP access to Markdown files.

## Structure

```
.xdrs/
  index.md                          # root index pointing to all scope indexes
  [scope]/
    [type]/                         # adrs | bdrs | edrs
      index.md                      # canonical index for this scope+type
      [subject]/
        [number]-[short-title].md   # individual policy document
        .assets/                     # optional local resources for subject-level Policy files
        researches/                 # optional decision-backing research documents
          [number]-[short-title].md
          .assets/
        skills/                     # optional skill packages for humans and AI agents
          [number]-[skill-name]/
            SKILL.md
            .assets/
        articles/                   # optional synthetic views over Policies, Research, and Skills
          [number]-[short-title].md
          .assets/
        plans/                      # optional ephemeral execution plans
          [number]-[short-title].md
          .assets/
```

Document types:

- **ADR** - Architectural Decision Record: architectural and technical decisions
- **BDR** - Business Decision Record: business process and strategy decisions
- **EDR** - Engineering Decision Record: engineering workflow and tooling decisions
- **Research** - Exploratory support material used while evaluating or updating a decision. Research captures constraints, findings, options, and proposal tradeoffs, but it is not the source of truth.
- **Skills** - Step-by-step procedural guides that can be followed by humans, AI agents, or both. Must comply with Policies, but add the execution detail they lack. Skills are not mandatory by themselves unless referenced by a Policy or another policy artifact. A skill may start as a fully manual human procedure and evolve incrementally toward partial or full AI automation without being restructured. Co-located with the Policies they implement inside `skills/` sub-directories.
- **Articles** - Synthetic views that explain concepts or combine information from multiple Policies, Research documents, and Skills into a coherent text for a specific topic or audience. Articles are not the source of truth; Policies take precedence when there is a conflict. Useful as navigational indexes that link related artifacts around a specific aspect.
- **Plans** - Ephemeral execution documents that describe a problem, proposed solution, and the approach and activities needed to solve it. Plans have a clear start and end and must be deleted after full implementation. Lasting outputs are captured as Policies, Skills, Articles, or other artifacts. Co-located with Policies inside `plans/` sub-directories.

See [.xdrs/index.md](.xdrs/index.md) for the full list of active policies.

For a deeper overview of XDRS — objective, structure, guidelines, extension, and usage — see the [XDRS Overview article](.xdrs/_core/adrs/principles/articles/001-xdrs-overview.md).
For packaging guidance on publishing your own reusable scope with Policies, Research documents, skills, and articles, see the [Create your own xdrs-core extension package article](.xdrs/_local/adrs/principles/articles/001-create-your-own-xdrs-extension-package.md), then compare [examples/basic-usage](examples/basic-usage) and [examples/mydevkit](examples/mydevkit).

## Flow: Decision -> Distribution -> Usage

Policies, Research documents, and skills follow a three-stage lifecycle that keeps decision-making decentralized while allowing controlled adoption across projects.

### Decision

Each scope manages its own set of XDRS artifacts independently. Scope owners discuss and evolve decisions through whatever process fits their team, such as RFCs, pull requests, or architecture review boards. Research documents, Policies, and skills are authored, reviewed, and merged within the scope's folder in the repository.

### Distribution

Once a set of decisions is ready to share, scope owners pack the relevant `.xdrs/[scope]/` folder into a versioned npm package using a tool such as [filedist](https://github.com/flaviostutz/filedist) and publish it to an npm registry, either public or a company-internal one. Versioning gives consumers explicit control over which revision of a scope's decisions they adopt, avoiding situations where a single breaking policy change is forced on all consumers at once.

The same applies to Research documents, skills, articles, and any sibling `.assets/` folders: because they live alongside Policies inside the scope folder, they are included in the same package and published together.

### Usage

A project that wants to follow a scope's decisions adds the corresponding npm package as a regular dependency. Using a tool such as [filedist](https://github.com/flaviostutz/filedist), the package contents are unpacked into the project's `.xdrs/` folder at install or update time. Updating the dependency version pulls in the latest Policies, Research documents, and skills for that scope, keeping the project aligned with the scope owners' current decisions.

Multiple scope packages can be combined in the same workspace by listing them as separate dependencies. Scope precedence (defined in `.xdrs/index.md`) determines which decisions take effect when scopes overlap.

```
[Scope repo] --> npm publish --> [npm registry] --> npm install --> [Project workspace]
  .xdrs/[scope]/                  versioned pkg                    .xdrs/[scope]/
    adrs/ bdrs/ edrs/                                                adrs/ bdrs/ edrs/
    [subject]/                                                        [subject]/
      *.md                                                              *.md
      researches/                                                       researches/
      skills/                                                           skills/
      articles/                                                         articles/
```

## CLI

The published package exposes the `xdrs-core` CLI.

- Bootstrap or extract managed XDRS files with the existing `filedist`-backed commands such as `npx -y xdrs-core extract` and `npx -y xdrs-core check`.
- Lint a Policy tree with `npx -y xdrs-core lint .`. By default, scopes whose files are listed in the workspace root `.filedist.lock` file are treated as external and skipped; use `--all` to include them.

The `lint` command reads `./.xdrs/**` from the given workspace path and checks common consistency rules, including:

- allowed scope, type, and subject folder structure
- Policy numbering uniqueness per `scope/type`
- skill numbering uniqueness per `scope/type/subject/skills`
- article numbering uniqueness per `scope/type/subject/articles`
- research numbering uniqueness per `scope/type/subject/researches`
- plan numbering uniqueness per `scope/type/subject/plans`
- plan `Expected end date:` field presence and ISO date format
- canonical index presence and link consistency
- root index coverage for all discovered canonical indexes
- Policy metadata section placement and `valid-from` / `apply-to` field format
- local markdown links between Policy documents, skills, articles, researches, and plans (excluding fenced code blocks)
- local image and `.assets/` links resolving inside the sibling `.assets/` folder for each document

Examples:

```bash
npx -y xdrs-core lint .
npx -y xdrs-core lint ./some-project
pnpm exec xdrs-core lint .
```

## Library Testing

The package also exposes a reusable behavior-test library for Jest or any other JavaScript test runner.

Main exports:

- `testPrompt(config, inputPrompt, judgePrompt)` runs the task prompt, evaluates the result in a fresh judge session, and returns an empty string on success or a markdown bullet list on failure.
- `runPromptTest(config, inputPrompt, judgePrompt)` returns the structured result object when you need access to captured output and the agent-reported changed file list.
- `copilotCmd(workspaceRoot)` returns a ready-to-use `promptCmd` template for the Copilot CLI in headless mode (`--autopilot`, full tool/url permissions, and `--no-ask-user`). The library uses that same command template for both the task and judge phases. If `workspaceRoot` is omitted it defaults to the current git repository root.
- `config.workspaceRoot`, when set, is the authoritative workspace under test. If omitted, the library uses the current git repository root.

Execution model:

- phase 1 runs the task prompt and captures final output text plus the files the agent says it changed
- phase 2 runs an independent judge prompt in a fresh invocation of `promptCmd` against the original task prompt, task output, the agent-reported changed file list, and the current workspace state
- the judge trusts that reported file list as the authoritative change report and reads file contents from the workspace directly when needed
- when `workspaceMode: 'copy'` is used, the temporary workspace honors nested `.gitignore` rules and skips git metadata files during the copy

`promptCmd` accepts either a string array or a JSON array string and must include a `{PROMPT}` placeholder.

Example with Jest:

```js
const { copilotCmd, testPrompt } = require('xdrs-core');

test('creates hello.md', () => {
  const err = testPrompt(
    {
      workspaceRoot: process.cwd(),
      promptCmd: copilotCmd(process.cwd()),
      workspaceMode: 'copy'
    },
    "Create a nice markdown file at hello.md saying 'hello!'",
    'The resulting file should be created at hello.md and have hello as part of its contents, without too much extra info (should be <100 chars)'
  );

  expect(err).toBe('');
});
```

