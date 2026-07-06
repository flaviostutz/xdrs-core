# XDRS Index

This index demonstrates all five built-in XDRS scope types plus a custom `business-area` type. It covers an e-commerce platform with meta-governance, payment compliance references, cloud platform documentation, and a team-level business area.

## Scope Indexes

XDRS scopes listed last override the ones listed first

Default ordering by scope type: `core → reference → platform → standard → _local`

### _core

Base XDRS framework standards. Defines document types, subjects, scope structure, and scope-type policies for all built-in types.

[View scope _core](_core/index.md)

---

### ecomm-core

Meta-governance for the ecomm domain. Defines authoring standards and the custom `business-area` scope type used by ecomm team scopes.

[View scope ecomm-core](ecomm-core/index.md)

---

### ecomm-ref-payments

PCI-DSS and payment compliance reference standards for the ecomm platform. Adopt or map against; not live operational content.

[View scope ecomm-ref-payments](ecomm-ref-payments/index.md)

---

### ecomm-plat-cloud

Live cloud infrastructure for the ecomm platform. Documents available regions, service tiers, and deployment constraints.

[View scope ecomm-plat-cloud](ecomm-plat-cloud/index.md)

---

### checkout

Checkout business area decisions, governed by `ecomm-core` authoring standards. Uses the custom `business-area` scope type.

[View scope checkout](checkout/index.md)

---

### _local (reserved)

Workspace-local decisions that MUST NOT be distributed or shared outside this repository.

Read _local scope index at `_local/index.md` when it exists.
