---
name: ecomm-core-adr-policy-001-ecomm-authoring-standards
description: Defines how to write and structure Policy documents in ecomm domain scopes. Covers titling, subject selection, and Decision Outcome structure for the ecomm family.
apply-to: Authors writing policies in any ecomm domain scope
valid-from: 2026-07-06
---

# ecomm-core-adr-policy-001: Ecomm authoring standards

## Context and Problem Statement

The ecomm domain has multiple scopes (`checkout`, `catalog`, `fulfilment`, etc.) authored by different teams. Without shared standards, policies written by different teams become inconsistent in structure, depth, and clarity, making them harder to review and consume by AI agents.

How should authors across ecomm domain scopes write and structure policy documents to ensure consistency?

## Decision Outcome

**Apply the following authoring standards for all policies written in ecomm domain scopes.**

These standards supplement `_core-adr-policy-002` (Policy standards). They do not replace it — `_core` rules always apply.

### Details

#### 01-title-must-state-the-question

The title of a policy MUST state the decision question, not the answer. A reader MUST be able to understand the scope of the decision from the title alone without reading the body.

Good: "Payment gateway selection for checkout flows"
Avoid: "Use Stripe", "We chose Stripe for payments"

#### 02-subject-selection

Authors MUST choose the most specific subject that fits the decision:

- Use `principles` for foundational rules that apply across the entire scope.
- Use `application` for decisions about specific systems, services, integrations, or inter-service connectivity.

Do not use `principles` as a catch-all when a more specific subject applies.

#### 03-decision-outcome-structure

The `## Decision Outcome` section MUST start with a one-sentence bold statement of the decision. Supporting detail, rules, and context MUST follow in a `### Details` subsection using structured numbered rule blocks when the policy defines multiple independently referenceable rules.

#### 04-mandatory-language

Authors MUST use BCP 14 keywords (MUST / MUST NOT / SHOULD / SHOULD NOT / MAY) for all normative statements. Lowercase forms (`must`, `should`) MUST NOT be used for normative requirements.

## References

- [_core-adr-policy-002](../../../_core/adrs/principles/002-policy-standards.md) — Policy document writing standard (template, metadata, lifecycle)
