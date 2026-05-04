---
name: anthropic-model-migration
description: Migrate between Anthropic Claude model versions with awareness of capability differences, pricing, and deprecation timelines
tech_stack: [anthropic-sdk]
language: [python, typescript]
capability: [llm-client]
version: "Anthropic API unversioned"
collected_at: 2025-01-01
---

# Anthropic Model Migration Guide

> Sources:
> - https://platform.claude.com/docs/en/about-claude/model-deprecations
> - https://platform.claude.com/docs/en/about-claude/models/overview
> - https://www.anthropic.com/claude/opus
> - https://www.anthropic.com/claude/sonnet

## Purpose
Guide for choosing the right Claude model and migrating between versions when models are deprecated. Covers capability differences, pricing, extended thinking behavior, and the practical code changes needed to switch model IDs.

## When to Use
- A model you depend on has been announced for deprecation and you need a replacement
- Evaluating cost vs. capability tradeoffs (e.g., migrating from Opus to Sonnet)
- Understanding behavioral differences between model generations before switching
- Planning extended thinking configuration for hybrid reasoning models (Sonnet 4.6, Opus 4.7)
- Choosing between Opus (frontier intelligence) and Sonnet (cost-efficient performance at scale)

## Basic Usage

Migration is a **model ID string change** — the API signature is identical across all models:

```python
# Drop-in replacement: only the model string changes
response = client.messages.create(
    model="claude-opus-4-7",       # was "claude-opus-4-5-20251101"
    max_tokens=1024,
    messages=[{"role": "user", "content": "..."}]
)
```

For hybrid reasoning models, add extended thinking:

```python
# Sonnet 4.6 / Opus 4.7 with extended thinking
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=4096,
    thinking={"type": "enabled", "budget_tokens": 2000},
    messages=[{"role": "user", "content": "Debug this race condition..."}]
)
```

## Key APIs (Summary)

### Model lineage and IDs

| Family | Model | Release | Model ID | Context |
|--------|-------|---------|----------|---------|
| **Opus** | Opus 4 | May 2025 | `claude-opus-4-20250514` | 200K |
| | Opus 4.1 | Aug 2025 | drop-in replacement | 200K |
| | Opus 4.5 | Nov 2025 | `claude-opus-4-5-20251101` | 200K |
| | Opus 4.6 | Feb 2026 | `claude-opus-4-6-20260205` | 200K |
| | Opus 4.7 | Apr 2026 | `claude-opus-4-7` | **1M** |
| **Sonnet** | Sonnet 3.7 | Feb 2025 | first hybrid reasoning | 200K |
| | Sonnet 4 | May 2025 | `claude-sonnet-4-20250514` | 200K |
| | Sonnet 4.5 | Sep 2025 | agents/coding/computer-use | 200K |
| | Sonnet 4.6 | Feb 2026 | `claude-sonnet-4-6` | **1M** |

### Pricing

| Model | Input / M tok | Output / M tok | Prompt Caching | Batch |
|-------|--------------|----------------|----------------|-------|
| Opus 4.7 | $5 | $25 | up to 90% off | 50% off |
| Sonnet 4.6 | $3 | $15 | up to 90% off | 50% off |

### Extended thinking: Opus vs Sonnet

| Feature | Opus 4.7 | Sonnet 4.6 |
|---------|----------|------------|
| Reasoning | **Adaptive** (automatic) | **Explicit budget** (`thinking.budget_tokens`) |
| Best for | Sustained multi-step, self-correcting | High-volume, cost-sensitive reasoning |

## Caveats
- **Never use `"latest"` aliases in production** — always pin exact model ID strings
- **Drop-in replacement ≠ identical behavior** — Opus 4→4.1 is API-compatible but edge cases differ
- **Opus 4.7 adaptive thinking** is automatic; Sonnet 4.6 requires explicit `thinking.budget_tokens` configuration
- **Sonnet 4.6 matches Opus 4.5/4.6 on many coding tasks** at ~40% lower cost — benchmark your workload before defaulting to Opus
- **1M context window** is API-only beta (not available in claude.ai chat)
- **US-only inference** available at 1.1× pricing multiplier on input and output tokens
- **Haiku 4.5** has different speed/cost/capability tradeoffs vs Haiku 3.5 — not a drop-in behavioral match

## Composition Hints
- Use **Token Counting** (`anthropic-token-counting`) to compare token consumption between old and new model IDs before migrating
- Combine with **Prompt Caching** (`anthropic-prompt-caching`): cache read pricing is 0.1× base — the cost difference between Opus and Sonnet shrinks further with caching
- Pair with **Messages API** (`anthropic-messages-api`): `max_tokens` requirements may differ across models for the same task
- Test migration candidates with **Batch API** (`anthropic-batch-api`) at 50% off to evaluate quality before switching production traffic
