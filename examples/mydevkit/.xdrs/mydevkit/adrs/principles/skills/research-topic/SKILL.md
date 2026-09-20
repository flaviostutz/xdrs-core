---
name: research-topic
description: >
  Researches a topic end to end: plans research by imagining scenarios, then fills in a short
  findings table. Use when a topic needs a compact, self-contained research pass without a full
  IMRAD research document.
metadata:
  author: flaviostutz
  version: "1.0.0"
  updated: 2026-09-19
---

## Overview

Runs a lightweight end-to-end research pass on a topic: drafts a research plan, records findings
in a small table, and applies a final checklist before returning the result.

### Inputs

#### Required

- A topic to research.

#### Optional

- None.

### Outputs

#### Contents

- A research plan, findings table, and summary.

#### Changes

- None.

### Halt Conditions

- None.

### Runtime Requirements

- `make` and `zip` on PATH for bundling.

## Instructions

### Phase 1: Plan the research

1. Read the topic provided by the caller.
2. Read and follow `../plan-research/SKILL.md` in full to produce a numbered research plan for
   the topic (which itself imagines scenarios via `imagine-scenarios`).

### Phase 2: Populate the findings table

1. Use `.assets/table.json` as the structural template for the findings table (its `columns`).
2. For each question from Phase 1, add one row with a finding and a confidence level.

### Phase 3: Final checklist

1. Follow the checklist in `references/more-instructions.md` before returning the result.

## Examples

- Topic: "adoption of a new internal API" → Output: a research plan (Phase 1), a filled findings
  table with one row per question (Phase 2), and a short top-3-insights summary (Phase 3).

## Anti-Patterns

- **Mistake:** Filling in the findings table before running Phase 1's research plan.
  **Why it happens:** Skipping straight to "findings" feels faster than planning first.
  **Instead:** Always derive the table rows from the Phase 1 plan's questions, in order.

- **Mistake:** Ignoring `.assets/table.json` and inventing an ad hoc table shape.
  **Why it happens:** Writing a table from scratch feels simpler than reading a template file.
  **Instead:** Always base the findings table's columns on `.assets/table.json`.

- **Mistake:** Returning the findings table without running the Phase 3 checklist.
  **Why it happens:** The table already looks complete, so the checklist feels redundant.
  **Instead:** Always run the full checklist in `references/more-instructions.md` before returning.

## References

- [plan-research skill](../plan-research/SKILL.md)
- [imagine-scenarios skill](../imagine-scenarios/SKILL.md)
- [findings table template](.assets/table.json)
- [more-instructions reference](references/more-instructions.md)
