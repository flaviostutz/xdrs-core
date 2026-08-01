---
name: _core-adr-policy-010-scope-governance
description: Defines how scope types and scope-local standards are declared and applied. Covers how to author a custom scope-type policy, how to define scope-local content standards, and how all governance mechanisms (scope-type, follows, scope-local) interact with their precedence chain. Use when defining a new scope type, setting local standards for a scope, or understanding how governance is applied when adding content to a scope.
apply-to: All XDRS scopes, core scopes defining scope types, and tools/agents processing scope content
valid-from: 2026-07-01
---

# _core-adr-policy-010: Scope governance

## Context and Problem Statement

XDRS provides three mechanisms that govern what content belongs in a scope and how it should be structured:

1. **Scope-type standards**: a policy in a `core`-type scope that defines the rules for all scopes of that type.
2. **`follows:` declarations**: a scope explicitly declares that it follows the standards of a named `core`-type scope.
3. **Scope-local standards**: a policy inside a scope that defines content rules specific to that one scope.

Without a clear definition of how these mechanisms are authored and how they interact, tools, agents, and authors cannot reliably determine which standards apply when adding or reviewing content in a scope.

## Decision Outcome

**Define scope types as policies, local meta-policies as `core`-named policies in `principles/`, and a clear precedence chain for governance application.**

All scope types — both the five built-in types and any custom types — are defined using the same convention: a `{scope-type}-scope-type` policy in a `core`-type scope. Scope-local standards (called _local meta-policies_) are optional policies whose filename title starts with `core` and which are placed in the `principles` subject of the scope. Multiple local meta-policy files are allowed, each distinguished by an optional qualifier. Tools and agents apply all applicable standards in a defined order.

> **Choosing between a local meta-policy and a `-core` sibling scope**: use a local meta-policy (Section B) when the standards apply only to one scope and do not need to be shared. Use a separate `-core` sibling scope (see `_core-adr-policy-011`) when the meta governance needs to be shared with or distributed to other teams, or when it governs a family of scopes sharing the same prefix.

### Details

#### Section A — Scope-type definition standards

##### 01-def-must-live-in-core-scope

A scope-type definition policy MUST be placed in a `core`-type scope (i.e., a scope whose `index.md` declares `scope-type: core`).

##### 02-def-naming

The policy `name` field MUST end with `{scope-type}-scope-type` (e.g., `security-scope-type`, `business-area-scope-type`). The policy file MUST follow the standard numbered filename convention `NNN-{scope-type}-scope-type.md` and MUST be placed in the `principles` subject of any decision type folder within the `core`-type scope (e.g., `_core/adrs/principles/011-core-scope-type.md`).

Note: this naming applies to the **policy name** only, not to any scope directory name. It is distinct from the `-core` scope-name suffix convention defined in `_core-adr-policy-011`.

##### 02b-def-companion-files

A scope-type definition MAY be split across multiple policy files. The primary file MUST follow rule 02 above. Each additional companion file MUST be named `NNN-{scope-type}-scope-type-{qualifier}.md` (e.g., `012-business-area-scope-type-writing-style.md`), where `{qualifier}` is a short lowercase kebab-case descriptor. All companion files MUST be placed in the **same** `[type]/principles/` directory as the primary file within the same scope. A companion file MUST NOT exist without a corresponding primary file in the same scope and type folder. Tools and agents MUST apply all companion files for a scope-type as additional mandatory conventions alongside the primary.

##### 03-def-required-content

A scope-type definition policy MUST define:

- The scope type name (the value that instances declare in their `scope-type:` field).
- When to use this scope type and what kinds of scopes SHOULD declare it.

##### 04-def-preferred-content

A scope-type definition policy SHOULD define:

- Naming conventions for scope instances of this type.
- What content SHOULD be placed in scopes of this type.
- What content SHOULD NOT be placed in scopes of this type.
- Special instructions on how to organise or write content in scopes of this type.

##### 05-def-instance-declaration

A scope that is an instance of a custom scope type MUST declare `scope-type: {scope-type}` in its `index.md` frontmatter (e.g., `scope-type: business-area`).

##### 06-def-no-underscore-prefix

Custom scope-type names MUST NOT start with `_`. The `_` prefix is reserved for built-in scope types defined in `_core` (currently only `_local`).

##### 07-def-parent-scope-type

A scope-type definition policy MAY declare a parent scope type by including a rule titled `NN-parent-scope-type` in its `### Details` section. The body of that rule MUST reference the parent scope-type name in backticks (e.g., "Instances of this scope type inherit all rules from the `standard` scope type."). This rule MUST appear only in the **primary** file (rule 02), not in a companion file (rule 02b). Tools and agents MUST resolve the full parent chain transitively. Child scope-type standards override parent standards on any conflict.

##### 08-def-valid-iff-policy-exists

A `scope-type` value in a scope `index.md` is valid if and only if a policy file whose name ends with `{scope-type}-scope-type` exists in the `principles` subject of any `core`-type scope in the workspace. Tools (such as `xdrs-core lint`) MUST enforce this.

When a scope declares a `scope-type` but the corresponding `{scope-type}-scope-type.md` policy is absent from the workspace, the scope MUST be treated as READ-ONLY by all tools and agents: no content in it MUST be added, changed, or removed, and no review of its content MUST be performed. The scope lacks the type governance that defines how its content must be authored and evaluated; proceeding without it risks producing or approving non-compliant content. Tools and agents MUST surface the read-only status to the user and MUST NOT propose or apply any changes until the scope-type governance is installed.

---

#### Section B — Local meta-policies

##### 09-local-naming

The word `core` as a hyphen-delimited segment in a policy filename title is reserved for local meta-policies. A local meta-policy is identified by its filename title starting with `core`: either `NNN-core.md` (primary, no qualifier) or `NNN-core-{qualifier}.md` (companion, where `{qualifier}` is a short lowercase kebab-case descriptor). A policy filename title MUST NOT use `core` as a word segment unless it is a valid local meta-policy (see rule 10). Scope-type definition files (`NNN-{scope-type}-scope-type.md`) are exempt from this restriction even when their title begins with `core`.

##### 10-local-placement

Local meta-policy files MUST be placed in the `principles` subject of any type folder within the scope they govern (e.g., `my-team/adrs/principles/001-core.md`). They apply implicitly to that scope — no declaration in `index.md` is required. Local meta-policies MUST NOT be placed in any other subject folder; a file whose title starts with `core` in a non-`principles` subject is a lint error.

##### 10b-local-primary-required

A companion local meta-policy (`NNN-core-{qualifier}.md`) MUST NOT exist in a type folder unless a primary local meta-policy (`NNN-core.md`) also exists in the **same** type folder. Tools MUST enforce this constraint.

##### 10c-local-unique-qualifier

Each qualifier (including the blank qualifier of the primary) MUST be unique across all type folders within the same scope. For example, a scope MUST NOT have both `adrs/principles/001-core.md` and `bdrs/principles/001-core.md` — the blank qualifier would appear twice.

##### 11-local-optional

Creating a local meta-policy is optional. It SHOULD be created when a scope has specific structural, authoring, or content constraints that differ from `_core` defaults or the scope's declared scope-type standards.

##### 12-local-content

A local meta-policy SHOULD define the same kinds of instructions as a scope-type definition policy (rules 03–04 above): naming conventions for content in the scope, allowed content, forbidden content, and organisation rules. These instructions apply only to policy documents authored in this one scope; they do not govern non-policy artifacts (skills, articles, plans, research).

##### 13-local-mandatory-when-present

When one or more local meta-policies exist in a scope, tools and agents MUST load and apply ALL of them as mandatory conventions when authoring or reviewing **policy documents** in that scope. If any found local meta-policy file is unreadable, tools MUST halt and report an error before proceeding.

---

#### Section C — Governance application and precedence

##### 14-application-follows

A scope's `follows:` frontmatter field lists `core`-type scope names whose policies apply as mandatory conventions to this scope, in addition to `_core`. The last-listed scope takes precedence on conflicts when the same topic is addressed by multiple `follows:` scopes.

##### 15-application-scope-type

When adding or reviewing content in a scope, tools and agents MUST:

1. Read the scope's `scope-type` from its `index.md`.
2. Search the `[type]/principles/` directories of all `core`-type scopes in the workspace for a file whose name ends with `{scope-type}-scope-type.md`.
3. If found, also load all companion files (`{scope-type}-scope-type-{qualifier}.md`) from the **same directory** (same scope and type folder) and apply their rules as additional mandatory conventions alongside the primary.
4. Apply all rules from the primary and its companions as mandatory conventions.
5. If the primary scope-type policy contains a rule titled `NN-parent-scope-type`, extract the parent type name (backtick-quoted identifier in the rule body) and repeat steps 2–5 for the parent. Continue until no more parents are declared. Detect and stop on cycles.

##### 16-application-local

When adding or reviewing **policy documents** in a scope, tools and agents MUST:

1. Search the scope's own `[type]/principles/` directories for all files whose filename title starts with `core` (i.e., `NNN-core.md` or `NNN-core-{qualifier}.md`), excluding scope-type definition files whose title ends with `-scope-type`.
2. If any are found, read and apply ALL of them as mandatory conventions. If a found file is unreadable, halt with an error before proceeding.
3. If none are found, continue without error — absence of local meta-policies is valid.

##### 17-precedence

When multiple standards address the same topic, the following precedence applies (later in the list overrides earlier on conflict):

1. Parent scope-type standards (resolved transitively from the declared scope-type's parent chain)
2. Declared scope-type standards
3. `follows:` scope standards (last-listed `follows:` scope wins among themselves)
4. Local meta-policy standards (all `NNN-core*.md` files in the scope's `principles/`)

All of the above are subordinate to `_core` structural rules, which MUST NOT be overridden.

##### 18-ordering-custom-types

Custom-type scopes SHOULD be placed in the `standard` position in the root `index.md` ordering (i.e., after `platform` scopes and before `_local`).

## References

- [_core-adr-policy-011 - core scope type](011-core-scope-type.md) — defines the `core` scope type and when to use a `-core` sibling scope vs. a scope-local policy
- [_core-adr-policy-001 - XDRS standards](001-xdrs-standards.md) — scope structure, `follows:` field definition, scope index frontmatter fields
