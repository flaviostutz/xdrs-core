---
scope-type: core
name: ecomm-core
description: Meta-governance for the ecomm domain. Defines authoring standards, review conventions, and the custom business-area scope type for all ecomm scopes.
apply-to: Authors and maintainers of ecomm domain scopes
valid-from: 2026-07-06
---

# ecomm-core Scope Overview

## Overview

The `ecomm-core` scope governs how content is authored across all ecomm domain scopes. It is a `core`-type scope, meaning it holds meta-governance only — not actual rules for other teams to follow.

Scopes in the ecomm family that follow this governance MUST declare `follows: ecomm-core` in their `index.md` frontmatter.

## Content

This scope defines:

- **Authoring standards** for ecomm domain policies: how to title decisions, what subject to use, and how to structure the Decision Outcome.
- **`business-area` scope type**: a custom type for ecomm team scopes, extending `standard`. Any ecomm team scope MUST use `scope-type: business-area` and declare `follows: ecomm-core`.

## Type Indexes

- [ADRs Index](adrs/index.md) - Authoring standards and scope-type definitions for the ecomm domain
