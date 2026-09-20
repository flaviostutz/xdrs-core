---
name: imagine-scenarios
description: >
  Generates a short list of speculative what-if scenarios for a given topic. Use when a plan or
  research needs imaginative scenario variations to widen the range of possibilities considered.
metadata:
  author: flaviostutz
  version: "1.0.0"
  updated: 2026-09-19
---

## Overview

Brainstorms a handful of speculative "what if" scenarios for a topic, to widen the range of
possibilities considered before planning or deeper research.

## Inputs

### Required

- A topic to imagine scenarios for.

### Optional

- None.

## Instructions

### Phase 1: Generate scenarios

1. Read the topic provided by the caller.
2. Produce 3-5 short scenarios, each varying one key assumption or condition of the topic.
3. Return the scenarios as a bullet list, one line each, prefixed with "What if".

## Examples

- Topic: "adoption of a new internal API" → Scenarios: "What if adoption is instant across all
  teams?", "What if only one team ever adopts it?", "What if the API changes mid-rollout?"

## Outputs

### Contents

- 3-5 what-if scenario bullets.

### Changes

- None.

## Halt Conditions

- None.

## Anti-Patterns

- **Mistake:** Producing a single scenario instead of a spread of 3-5 varied ones.
  **Why it happens:** The first plausible scenario feels sufficient.
  **Instead:** Always vary a different assumption per scenario so the caller sees a real spread.

- **Mistake:** Writing generic scenarios that do not actually reference the given topic.
  **Why it happens:** Reusing boilerplate scenario phrasing is faster than tailoring each one.
  **Instead:** Ground every scenario in a detail specific to the topic provided.

- **Mistake:** Returning analysis or recommendations instead of plain speculative scenarios.
  **Why it happens:** It is tempting to also judge which scenario is "best".
  **Instead:** Only imagine scenarios here; leave evaluation to the caller (e.g. `plan-research`).

## References

- [plan-research skill](../plan-research/SKILL.md)
