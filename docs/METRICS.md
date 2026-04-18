# Metrics for Oazen

This document defines the measurable signals used to evaluate Oazen's core value:

1. retrieve only project-relevant memories
2. reduce context token usage
3. reduce project resumption cost
4. avoid cross-project contamination

---

## 1. Evaluation Goals

Oazen should be measured on three layers:

- **Recall quality**: whether the right memories are selected
- **Context efficiency**: how much context is saved before the LLM call
- **Workflow impact**: whether the developer resumes work faster and with less rework

The most important principle is:

> Oazen is not trying to recall more memory. It is trying to recall the right memory with the smallest possible context cost.

---

## 2. Core Metrics

### 2.1 Project Recall Precision

Measures how much of the recalled memory actually belongs to the current project.

**Formula**

`Project Recall Precision = Relevant project memories recalled / Total memories recalled`

**What it tells us**

- High precision means Oazen is not polluting context with unrelated memories.
- This is the clearest indicator that project scoping works.

**Target direction**

- Higher is better

---

### 2.2 Project Recall Coverage

Measures how many of the needed memories were successfully retrieved.

**Formula**

`Project Recall Coverage = Key memories recalled / Key memories needed`

**What it tells us**

- High coverage means Oazen is not missing important context.
- A system with high precision but low coverage is too conservative.

**Target direction**

- Higher is better

---

### 2.3 Cross-Project Contamination Rate

Measures how often memories from other projects are incorrectly recalled.

**Formula**

`Cross-project contamination rate = Non-target project memories recalled / Total memories recalled`

**What it tells us**

- This directly measures whether Oazen respects project boundaries.
- This should be one of the main public-facing metrics.

**Target direction**

- Lower is better

---

### 2.4 Context Token Saved

Measures how many tokens are avoided in the final LLM prompt because Oazen filtered and compressed memory.

**Formula**

`Context token saved = Baseline context tokens - Oazen context tokens`

**What it tells us**

- Shows the direct cost benefit of Oazen.
- Useful for comparing against raw memory dump or naive retrieval.

**Target direction**

- Higher is better

---

### 2.5 Average Context Size per Task

Measures the final amount of memory actually inserted into the prompt for each task.

**Formula**

`Average context size per task = Sum of recalled context tokens / Number of tasks`

**What it tells us**

- Shows whether Oazen remains stable as project history grows.
- This should stay relatively small even when memory volume increases.

**Target direction**

- Lower is better

---

### 2.6 Recall-to-Context Ratio

Measures how much memory is retrieved versus how much is actually passed to the model.

**Formula**

`Recall-to-context ratio = Retrieved candidates / Final context items used`

**What it tells us**

- Shows whether Oazen is acting as a filter, not as a memory dump.
- A healthy system retrieves more than it injects.

**Target direction**

- Depends on design, but should remain clearly selective

---

### 2.7 Time to Resume

Measures how long it takes a developer to regain useful project context after switching back to a project.

**Formula**

`Time to resume = Time from project open to first useful action`

Examples of a useful action:

- correct code edit
- correct file navigation
- correct architectural decision
- meaningful continuation of previous work

**What it tells us**

- This is a strong real-world product metric.
- It captures the main user benefit of project-aware memory.

**Target direction**

- Lower is better

---

### 2.8 Rework Reduction

Measures how often the model or developer needs to redo work because of missing or wrong memory.

**Formula**

`Rework reduction = Baseline rework events - Oazen rework events`

Examples of rework events:

- repeated explanation of the same constraint
- code written against an outdated assumption
- edits caused by lost context
- corrections due to wrong project memory

**What it tells us**

- Shows whether Oazen improves actual coding flow, not just retrieval.

**Target direction**

- Higher reduction is better

---

## 3. Recommended Benchmark Set

For early product validation, use the following four as the primary metrics:

1. **Project Recall Precision**
2. **Cross-Project Contamination Rate**
3. **Context Token Saved**
4. **Time to Resume**

These four are enough to demonstrate:

- memory is scoped correctly
- irrelevant context is excluded
- prompt size stays under control
- project switching becomes faster

---

## 4. Suggested Experiment Design

### Setup

Compare two workflows on the same set of tasks:

- **Baseline**: Codex without Oazen
- **Variant**: Codex with Oazen sidecar enabled

### Tasks

Use a task set that includes:

- repeated edits within the same project
- returning to a project after a gap
- multi-step implementation tasks
- tasks that rely on prior conventions
- tasks that might be confused with another project

### What to log

For each task, record:

- project id
- query/task summary
- retrieved memories
- final context size
- token count before and after filtering
- whether any cross-project memory was included
- time to first useful action
- whether rework happened later

---

## 5. Reporting Format

A simple public comparison table is enough for the MVP:

| Metric | Baseline | Oazen | Result |
|---|---:|---:|---|
| Project Recall Precision |  |  |  |
| Cross-Project Contamination Rate |  |  |  |
| Context Token Saved |  |  |  |
| Average Context Size per Task |  |  |  |
| Time to Resume |  |  |  |

---

## 6. Product Message

A concise way to describe Oazen is:

> Oazen improves coding agents by recalling only the memories that belong to the current project, reducing token waste, lowering cross-project contamination, and making it faster to resume work.

---

## 7. MVP Guidance

For the first version, prioritize metrics that are:

- easy to measure automatically
- easy to explain to users
- directly tied to project-scoped memory

Best first metrics:

- Project Recall Precision
- Cross-Project Contamination Rate
- Context Token Saved
- Time to Resume

These are enough to make Oazen's value visible.
