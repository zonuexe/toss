# Domain docs

This repo uses a single-context layout:

- `CONTEXT.md` at the repo root holds domain terms.
- `docs/adr/` holds architecture decisions.

## Before exploring

Read `CONTEXT.md` and any ADRs relevant to the task.

If these files do not exist, continue silently.
The `domain-modeling` skill creates them when terms or decisions are resolved.

## Use domain terms

Use the terms defined in `CONTEXT.md` in issues, code, tests, and proposals.
If a needed term is missing, note the gap for `domain-modeling`.

## Conflicting decisions

If a proposal conflicts with an ADR, name the ADR and explain why
the decision should be reconsidered.
