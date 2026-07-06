---
scope-type: business-area
name: checkout
description: Architectural decisions for the ecomm checkout business area. Covers payment flows, gateway selection, order processing, and fraud controls.
apply-to: Checkout team and services within the ecomm checkout domain
valid-from: 2026-07-06
follows: ecomm-core
---

# checkout Scope Overview

## Overview

The `checkout` scope holds architectural decisions owned by the Checkout team. It uses the custom `business-area` scope type defined by `ecomm-core`, which means all policies here MUST follow the ecomm authoring standards in `ecomm-core-adr-policy-001`.

This scope documents the decisions that govern how the checkout flow processes orders, selects payment gateways, and handles fraud detection.

## Content

This scope covers:

- Payment gateway selection and integration constraints.
- Checkout flow architecture and state management.
- Fraud detection and order validation rules.

## Type Indexes

- [ADRs Index](adrs/index.md) - Checkout architecture decisions
