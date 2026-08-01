---
name: 008-write-xdrs-doc
description: >
  Use when writing documents such as decisions, policies, skills, procedures, research, plans, articles, or presentations.
  Activate this skill when the user asks to create or write any XDRS element.
metadata:
  author: flaviostutz
  version: "1.0"
---

## Overview

Routes the request to the appropriate XDRS authoring skill based on the type of document the user wants to create. Reads the target skill at runtime and follows its instructions in full.

## Instructions

### Phase 1: Infer Document Type

1. Infer the target document type from the user's request and context using the mapping below. Do not ask the user unless the type is genuinely ambiguous after reading the request.
   - **Policy** (ADR/BDR/EDR) — user wants to record a decision, rule, standard, guideline, or architectural/business/engineering policy
   - **Skill** — user wants to create an agent skill, SKILL.md, or reusable workflow instruction
   - **Research** — user wants to produce a study, investigation, evidence-based analysis, or IMRAD-style document
   - **Plan** — user wants to create an execution plan, project plan, roadmap, or milestone document
   - **Article** — user wants to create a guide, overview, or synthetic document that combines multiple XDRS elements
   - **Presentation** — user wants to create slides or a Marp deck for an existing XDRS document

2. If the type cannot be confidently inferred, ask the user one focused question: *"What type of XDRS document do you want to create — Policy, Skill, Research, Plan, Article, or Presentation?"* Wait for the answer before proceeding.

### Phase 1.5: Prerequisites Gate — MUST complete before writing

For the target scope where the document will be created, read its `index.md` frontmatter and perform ALL of the following checks. If ANY check fails, output a FAIL result immediately and do not proceed:

- **Follows scopes:** If the scope declares `follows:` entries (e.g., `follows: myarea-core, shared-standards`), verify that each listed scope directory exists in the workspace AND contains an accessible `index.md` (e.g., `.xdrs/[scope-name]/index.md`). If any listed scope is missing or unreadable, output: `FAIL — Cannot proceed: scope \`[scope-name]\` is listed in \`follows\` but its policies are not present in the workspace. Install it before authoring documents in this scope, as the governance constraints cannot be verified.`
- **Local meta-policies:** Scan the target scope's `[type]/principles/` directories for all files whose filename title starts with `core` (i.e., `NNN-core.md` or `NNN-core-{qualifier}.md`), excluding scope-type definition files. If any are found but cannot be read, output: `FAIL — Cannot proceed: local meta-policy \`[filename]\` exists in scope \`[scope-name]\` but could not be read. Without it, the document cannot be authored in full compliance with the scope's governance.` Zero matches is valid. When routing to the policy skill, apply all found local meta-policies as mandatory conventions.
- **Scope-type:** Read the scope's `scope-type` from its `index.md`. If `scope-type` is declared, search the `[type]/principles/` directories of all `core`-type scopes in the workspace for a file whose name ends with `{scope-type}-scope-type.md`. If the scope declares a `scope-type` but no matching file is found, output: `FAIL — Cannot proceed: scope \`[scope-name]\` declares \`scope-type: [scope-type]\` but no \`[scope-type]-scope-type.md\` policy exists in any \`core\`-type scope in the workspace. The scope is READ-ONLY; install the scope-type governance before authoring documents in this scope.`
- **Rationale:** Authoring a document without all mandatory governance layers loaded risks producing content that silently violates scope policies. Every governance layer MUST be present before writing begins.

### Phase 2: Load and Follow Target Skill

Read the full content of the skill file for the inferred type, then follow all its phases and instructions exactly as if that skill had been activated directly.

| Document type | Skill file to read and follow |
|---|---|
| Policy (ADR / BDR / EDR) | `.xdrs/_core/adrs/principles/skills/002-write-policy/SKILL.md` |
| Skill | `.xdrs/_core/adrs/principles/skills/003-write-skill/SKILL.md` |
| Article | `.xdrs/_core/adrs/principles/skills/004-write-article/SKILL.md` |
| Research | `.xdrs/_core/adrs/principles/skills/005-write-research/SKILL.md` |
| Plan | `.xdrs/_core/adrs/principles/skills/006-write-plan/SKILL.md` |
| Presentation | `.xdrs/_core/adrs/principles/skills/007-write-presentation/SKILL.md` |

### Constraints

- MUST read the full target SKILL.md before proceeding — do not rely on summaries or prior knowledge of the target skill.
- MUST follow all phases of the target skill from Phase 1 onward; do not skip any phase.
- MUST NOT create documents of a type not listed in the routing table above.
- When routing to the Policy skill, MUST also read `_core-adr-policy-016` (`.xdrs/_core/adrs/principles/016-policy-subjects.md`) before choosing a subject — it contains the allowed subject list, descriptions, and disambiguation tiebreaker rules.
- When routing to the Policy skill, MUST also read `_core-adr-policy-017` (`.xdrs/_core/adrs/principles/017-policy-numbering-ranges.md`) before choosing a policy number — it defines the subject-based block ranges that determine valid numbers for each subject.
