# mydevkit ADRs Index

This index covers the reusable architectural guidance shipped by the `mydevkit` extension package.
It is intended to be layered on top of `_core` through the package `.filedistrc`.

## Related Scope Indexes

- [_core ADRs](../../_core/adrs/index.md)

## Principles

- [mydevkit-adr-001](principles/001-publish-mydevkit-as-an-extension-package.md) - **Publish mydevkit as an extension package** (`.filedistrc`-based packaging, scope composition, and consumer flow)

## Skills

- [release-package](principles/skills/release-package/SKILL.md) - Pack, verify, and publish the extension package
- [imagine-scenarios](principles/skills/imagine-scenarios/SKILL.md) - Generate speculative what-if scenarios for a topic
- [plan-research](principles/skills/plan-research/SKILL.md) - Draft a research plan from imagined scenarios
- [research-topic](principles/skills/research-topic/SKILL.md) - Research a topic end to end into a filled findings table

## Articles

- [mydevkit-article-001](principles/articles/001-mydevkit-package-overview.md) - How this example package composes `xdrs-core` with a custom scope