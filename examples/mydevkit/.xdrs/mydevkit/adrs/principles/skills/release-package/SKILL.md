---
name: release-package
description: >
  Packs and verifies the mydevkit extension package that composes xdrs-core through a standalone
  .filedistrc file.
metadata:
  author: flaviostutz
  version: "1.0.0"
  updated: 2026-09-19
---

## Overview

Use this skill when updating the example package and needing to confirm that the packed tarball can
be installed by a consumer workspace.

## Inputs

### Required

- Current state of the mydevkit package source.

### Optional

- None.

## Runtime Requirements

- `pnpm` available.
- Network/registry access for the publish step only.

## Instructions

### Phase 1: Pack the package

1. Run `pnpm install` in the package root.
2. Run `pnpm pack --pack-destination=./dist`.

### Phase 2: Verify the consumer flow

1. Install the packed tarball in the `consumer/` fixture together with the local `xdrs-core` tarball.
2. Run `pnpm exec mydevkit install --output ./output` from the consumer workspace.
3. Run `pnpm exec mydevkit check --output ./output`.
4. Run `pnpm exec xdrs-core lint ./output`.

### Phase 3: Publish

1. Bump the package version according to the consumer impact.
2. Publish after the local consumer verification passes.

## Outputs

### Contents

- A verified, publish-ready tarball.

### Changes

- A published package version, if approved.

## Halt Conditions

- Blocks publish if the consumer fixture fails checks.

## User Interaction

- Confirmation before publishing a new version.

## Anti-Patterns

- **Mistake:** Publishing a new version without first running the consumer verification flow (Phase 2).
  **Why it happens:** Packing succeeds locally, so publishing feels safe.
  **Instead:** Always run the full consumer install/check/lint flow before bumping and publishing.

- **Mistake:** Bumping the version by an arbitrary amount instead of one that reflects actual consumer impact.
  **Why it happens:** Version bumps feel like a formality at release time.
  **Instead:** Choose the version bump (major/minor/patch) based on the real impact to consumers of this package.

- **Mistake:** Skipping `pnpm exec xdrs-core lint ./output` because the consumer install already succeeded.
  **Why it happens:** A successful install feels sufficient to prove correctness.
  **Instead:** Lint the installed output explicitly; install success does not guarantee the distributed content is still policy-compliant.

## References

- [mydevkit-adr-001](../../001-publish-mydevkit-as-an-extension-package.md)