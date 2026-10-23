# FSRS Personal Optimization Implementation Plan

**Goal:** Add local, account-scoped, validated FSRS-6 parameter optimization.

**Architecture:** ts-fsrs model replay, bounded coordinate search in a cancellable worker, per-scope persisted parameters, transactional review logs and a profile panel.

**Tech Stack:** Existing React/TypeScript/Vite/Dexie/Vitest/ts-fsrs; no new runtime dependencies.

- [x] Add data-quality and optimization tests in src/lib/fsrsOptimization.test.ts; run targeted Vitest to establish missing behavior.
- [x] Implement pure dataset validation and held-out evaluation/search in src/lib/fsrsOptimization.ts using FSRSAlgorithm.next_state and forgetting_curve. Clamp with library bounds, validate all 21 weights.
- [x] Add parameter persistence, owner context and scope-aware scheduler selection. Test owner changes, invalid parameters and reset.
- [x] Add owner/sequence metadata to main review logs, a notebook review table and transactional logging in both notebook rating paths. Use existing owner-tagged reading logs.
- [x] Load complete histories by owner/scope, excluding uncertain legacy records unless explicitly claimed; replay histories for evaluation and apply parameters progressively at subsequent ratings without bulk D/S or due changes.
- [x] Add cancellable Worker transport and settings panel in Profile; expose scope, usable history, validation comparison, apply, cancel, and restore default.
- [x] Verify targeted tests then full pnpm test, pnpm lint, pnpm build and browser interactions. Update README, FSRS feature documentation and parent AGENTS.md factual entries. Record verified local status in shared memory with prewrite/claim/closeout.
