---
scope-type: _local
name: _local
description: Workspace-local development overrides for this typed-scope example. Not distributed or shared outside this repository.
apply-to: This workspace only
valid-from: 2026-07-06
---

# _local Scope Overview

## Overview

The `_local` scope holds decisions that apply only to this repository. They MUST NOT be distributed or referenced by other workspaces. Content here overrides any scope listed before `_local` in the root index.

Typical uses include local tooling overrides, temporary decisions during a migration, and workspace-specific environment configuration.

## Type Indexes

- [ADRs Index](adrs/index.md) - Local development overrides for this example workspace
