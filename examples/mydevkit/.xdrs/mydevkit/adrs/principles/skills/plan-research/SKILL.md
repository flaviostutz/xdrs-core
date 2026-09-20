---
name: plan-research
description: >
  Drafts a short research plan for a topic, first imagining scenarios to widen the angles
  considered. Use when a topic needs a lightweight list of research questions before a full
  research document is written.
metadata:
  author: flaviostutz
  version: "1.0.0"
  updated: 2026-09-19
---

## Overview

Turns a topic into a short research plan: a handful of imagined scenarios followed by the
research questions those scenarios raise.

### Inputs

#### Required

- A topic to plan research for.

#### Optional

- None.

### Outputs

#### Contents

- A numbered list of research questions.

#### Changes

- None.

### Halt Conditions

- None.

## Instructions

### Phase 1: Imagine scenarios

1. Read the topic provided by the caller.
2. Read and follow `../imagine-scenarios/SKILL.md` in full to generate 3-5 "what if" scenarios
   for the topic.

### Phase 2: Draft the plan

1. For each scenario from Phase 1, write one research question it raises.
2. Return the plan as a numbered list of questions, each noting which scenario it came from.

## Examples

- Topic: "adoption of a new internal API" → Plan: "1. What breaks if adoption is instant across
  all teams? 2. What support burden does single-team adoption create? 3. How do we version the
  API safely if it changes mid-rollout?"

## Anti-Patterns

- **Mistake:** Skipping Phase 1 and writing research questions directly from the topic.
  **Why it happens:** Imagining scenarios first feels like an unnecessary extra step.
  **Instead:** Always run `imagine-scenarios` first; the questions must trace back to a scenario.

- **Mistake:** Producing more questions than scenarios, mixing in unrelated ideas.
  **Why it happens:** Extra ideas come to mind while writing the plan.
  **Instead:** Keep a strict one-question-per-scenario mapping so the plan stays traceable.

- **Mistake:** Writing a full research document instead of a short question list.
  **Why it happens:** The line between "plan" and "research" can blur once questions look good.
  **Instead:** Stop at the question list; drafting the full research is a separate, later step.

## References

- [imagine-scenarios skill](../imagine-scenarios/SKILL.md)
- [research-topic skill](../research-topic/SKILL.md)
