---
name: ecomm-core-adr-policy-002-business-area-scope-type
description: Defines the business-area scope type for ecomm team scopes. Use when declaring a scope that represents an ecomm business area or team with its own architectural decisions.
apply-to: Authors declaring ecomm team or business-area scopes
valid-from: 2026-07-06
---

# ecomm-core-adr-policy-002: business-area scope type

## Context and Problem Statement

The ecomm platform has multiple team-owned business areas: checkout, catalog, fulfilment, pricing, and others. Each area maintains its own architectural decisions, but all must follow ecomm domain authoring standards and be clearly identifiable as ecomm team scopes.

Using the built-in `standard` scope type does not convey ecomm-domain membership or the `follows: ecomm-core` requirement. A dedicated type makes the constraint explicit and machine-checkable.

How should a scope that represents an ecomm business area or team be declared?

## Decision Outcome

**Declare `scope-type: business-area` for any scope that represents an ecomm business area or team.**

All `business-area` scopes inherit the rules of the `standard` scope type and MUST additionally declare `follows: ecomm-core` to link to the meta-governance for this domain.

### Details

#### 01-scope-type-name

The scope type defined by this policy is `business-area`. A scope MUST declare it by setting `scope-type: business-area` in its `index.md` YAML frontmatter.

#### 02-when-to-use

Use `scope-type: business-area` when the scope represents an ecomm team, product area, or bounded business domain within the ecomm platform (e.g., `checkout`, `catalog`, `fulfilment`). This type MUST NOT be used outside the ecomm domain.

#### 03-parent-scope-type

Instances of this scope type MUST follow all rules from the `standard` scope type.

#### 04-follows-required

Every scope of type `business-area` MUST declare `follows: ecomm-core` in its `index.md` frontmatter to link to the meta-governance that defines the authoring standards for this domain.

#### 05-naming-convention

Scope names MUST follow the general scope naming rules in `_core-adr-policy-001`. Any valid ecomm team or area name is acceptable (e.g., `checkout`, `catalog`, `fulfilment`).

## References

- [_core-adr-policy-014](../../../_core/adrs/principles/014-standard-scope-type.md) — standard scope type (parent type)
- [_core-adr-policy-010](../../../_core/adrs/principles/010-scope-governance.md) — Scope governance and custom scope-type definition rules
- [ecomm-core-adr-policy-001](001-ecomm-authoring-standards.md) — Ecomm authoring standards that govern this domain
