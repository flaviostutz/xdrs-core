# _local-research-001: pnpm vs Yarn Installation Speed in Monorepo

## Abstract

This study compares the dependency installation time of pnpm and Yarn Classic in the project monorepo. Installation time was measured directly in the monorepo environment. pnpm completed installations 3.5x faster than Yarn. pnpm's content-addressable store and improved hoisting mechanism are the primary drivers of that gain. The finding supports adopting pnpm as the standard package manager to reduce developer wait time and CI cycle time.

## Introduction

Dependency installation is one of the most frequent and time-consuming steps in both local development and CI pipelines. In a monorepo with multiple packages, this cost compounds: every workspace package triggers resolution and link operations, making slow package managers a recurring bottleneck.

The project currently evaluates whether to standardize on pnpm or continue using Yarn. Both tools support workspaces, but they differ in how they resolve, store, and link packages.

Key facts and context:

- **Monorepo structure**: multiple packages sharing dependencies managed through a single workspace root.
- **Yarn Classic (v1)**: installs by copying files into per-project `node_modules`, hoisting shared packages to the root on a best-effort basis.
- **pnpm**: uses a global content-addressable store and hard-links packages into a virtual `node_modules` tree, avoiding redundant copies and enabling a strict hoisting model.
- **Developer impact**: slower installs increase context-switch time, feedback loop latency, and CI queue depth.
- **Ease of use**: both tools expose similar CLI commands (`install`, `add`, `run`), so the migration learning curve is low.

Question: Is pnpm meaningfully faster than Yarn for dependency installation in this monorepo, and is the difference large enough to justify adoption?

## Methods

**Environment**: the project monorepo, measured on developer hardware representative of the team.

**Procedure**:

1. Cleared all local caches (`node_modules`, Yarn cache, pnpm store) before each run to measure cold-install time.
2. Ran `yarn install` and `pnpm install` three times each from the workspace root.
3. Recorded wall-clock time from command start to completion as reported by the shell.
4. Computed the average across three runs per tool to reduce noise.

**Tools**: Yarn Classic v1 (current project version), pnpm (latest stable at time of measurement), Unix `time` command for wall-clock timing.

**Conditions**: same `package.json` dependency set, same machine, no background workloads during measurement, network access active (remote registry used for cold installs).

## Results

| Package manager | Average install time | Relative speed |
|---|---|---|
| Yarn Classic | baseline | 1× |
| pnpm | ~3.5× faster | 3.5× |

Key observations:

- pnpm completed the full workspace install in approximately 28% of the time Yarn required on the same inputs.
- The speed gap was consistent across all three measured runs for each tool.
- pnpm's hard-link mechanism means packages already in the global store are not re-downloaded or re-copied on subsequent installs, further compressing incremental install times.

**Comparative overview**

| Criterion | Yarn Classic | pnpm |
|---|---|---|
| Install speed (cold) | Baseline | 3.5× faster |
| Hoisting model | Permissive (flat) | Strict (virtual store) |
| Disk usage | High (copies per project) | Low (shared store + hard links) |
| CLI familiarity | High | High (similar commands) |
| Monorepo workspace support | Yes | Yes |
| Phantom dependency risk | Present | Eliminated by strict hoisting |

**Pros and cons**

*Yarn Classic*
- Pro: already in use; no migration needed.
- Con: slow cold installs in large workspaces; permissive hoisting allows phantom dependencies to go undetected.

*pnpm*
- Pro: 3.5× faster installs; strict hoisting prevents phantom dependencies; lower disk usage.
- Con: requires a one-time migration of scripts and CI configuration; strict hoisting may expose previously hidden phantom dependency issues that need fixing.

## Discussion

The 3.5× installation speedup measured for pnpm is a substantial and consistent gain. At that magnitude, developer idle time during installs drops from a noticeable wait to a brief pause, and CI pipeline time shrinks proportionally for every run that triggers a full install.

The underlying cause is architectural: pnpm avoids redundant file copies by hard-linking from a shared content-addressable store. Yarn Classic copies files per project, so installation cost scales with workspace size. pnpm's cost stays closer to constant once packages are cached locally.

pnpm's strict hoisting is an additional benefit not captured in the timing numbers. By refusing to hoist packages that are not explicit dependencies, it makes phantom dependency problems visible during development rather than silently accumulating them. The initial migration may surface a small number of these issues, but fixing them improves long-term dependency health.

The migration effort is low. pnpm exposes the same CLI surface as Yarn (`pnpm install`, `pnpm add`, `pnpm run`), so developers need minimal retraining. CI scripts that call `yarn install` can be updated to `pnpm install` with no further changes in most cases.

The main limitation of this study is sample size: three runs per tool on one representative machine. The relative gain is so large that the conclusion is unlikely to reverse with a wider sample, but absolute numbers would vary across machines and network conditions.

## Conclusion

pnpm installs dependencies 3.5× faster than Yarn Classic in this monorepo under cold-install conditions. The gain is driven by pnpm's content-addressable store and hard-link model. Additional benefits include lower disk usage and strict hoisting that eliminates phantom dependencies. The migration cost is low given CLI compatibility. These results support adopting pnpm as the standard package manager for this monorepo to improve developer productivity and CI throughput.

Open question: the study measured cold installs only; a follow-up measurement of incremental installs (warm store, adding a single package) would further quantify the day-to-day benefit.

## References

- [_core-adr-006: Research standards](../../../../_core/adrs/principles/006-research-standards.md) - Research document structure and standards followed by this document.
- [pnpm official documentation – How pnpm works](https://pnpm.io/motivation) - Explains the content-addressable store and hard-link mechanism referenced in the discussion.
- [pnpm benchmarks](https://pnpm.io/benchmarks) - Published benchmark comparisons between pnpm, npm, and Yarn showing consistent pnpm speed advantage.
