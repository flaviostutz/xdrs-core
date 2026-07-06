# Typed Scopes Example

This example demonstrates all five built-in XDRS scope types — `core`, `reference`, `platform`, `standard` (via a custom `business-area` subtype), and `_local` — using a fictional **ecomm** (e-commerce) company as the scenario.

## Scope types shown

| Scope | Type | Purpose |
|---|---|---|
| `_core` | `core` | Built-in XDRS framework standards (extracted from xdrs-core) |
| `ecomm-core` | `core` | Meta-governance for ecomm: authoring standards + custom scope type definitions |
| `ecomm-ref-payments` | `reference` | PCI-DSS and payment regulation reference to adopt or adapt |
| `ecomm-plat-cloud` | `platform` | Live cloud infrastructure available for team use |
| `checkout` | `business-area` | Checkout team decisions; `business-area` is a custom type defined in `ecomm-core` |
| `_local` | `_local` | Workspace-local overrides; never distributed |

## Ordering

Scopes listed later in `.xdrs/index.md` override earlier ones on the same topic.
The correct ordering is: `core → reference → platform → standard/_local_custom → _local`.

## Custom scope types

`ecomm-core` defines the `business-area` scope type in
`.xdrs/ecomm-core/adrs/principles/002-business-area-scope-type.md`.
The `checkout` scope uses `scope-type: business-area` and links to `ecomm-core` via `follows: ecomm-core`.

## Usage

```bash
make lint    # install dependencies + extract _core + run lint
make clean   # remove extracted/generated files
```

Lint requires `_core` to be extracted first; `make lint` handles this automatically.
