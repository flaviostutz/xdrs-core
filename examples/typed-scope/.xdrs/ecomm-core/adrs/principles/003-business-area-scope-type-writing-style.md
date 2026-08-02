---
name: ecomm-core-adr-policy-003-business-area-scope-type-writing-style
description: Writing style companion for the business-area scope type. Defines documentation tone, language, and structural conventions for policies authored in business-area scopes.
apply-to: Authors writing policies in ecomm business-area scopes
valid-from: 2026-07-27
---

# ecomm-core-adr-policy-003: business-area scope type — writing style

## Context and Problem Statement

The `business-area` scope type (defined in `ecomm-core-adr-policy-002`) governs when to declare a scope as a business area. However, it does not specify how policies within those scopes should be written. Without shared writing conventions, documentation quality and readability varies across ecomm business areas.

How should policies in `business-area` scopes be written, structured, and expressed?

## Decision Outcome

**Follow the ecomm-specific writing style for all policies authored in business-area scopes.**

All `business-area` scope policies MUST follow the writing conventions in this companion document in addition to the primary scope-type rules in `ecomm-core-adr-policy-002`.

### Details

#### 01-language-tone

Policy text MUST use concise, direct language. Sentences SHOULD be 20 words or fewer. Avoid passive voice in normative statements.

#### 02-decision-outcome-format

The `## Decision Outcome` section MUST open with a single bold sentence stating the chosen option (e.g., `**Use checkout-native payment flow for all card transactions.**`).

#### 03-context-scope

The `## Context and Problem Statement` section MUST identify the specific ecomm business domain affected (e.g., checkout, catalog, fulfilment) and state the question being answered in one sentence.

#### 04-references-required

Every policy in a `business-area` scope MUST include a `## References` section linking to the governing `ecomm-core` policies that apply.

## References

- [ecomm-core-adr-policy-002](002-business-area-scope-type.md) — primary business-area scope type definition
- [_core-adr-policy-010](../../../_core/adrs/principles/010-scope-governance.md) — companion file conventions (rule 03)
