# Jax App — Working Rules

Location-verified, pseudonymous social network for Jacksonville, FL (iOS/Android + web admin portal).

- **Requirements:** [docs/SPEC.md](docs/SPEC.md). Never edit it to record decisions.
- **UI design:** [docs/UI_DESIGN.md](docs/UI_DESIGN.md): Jaguars colors + white (D33). Mobile uses the dark palette `DARK` and admin/web use `COLORS`, both from `@jax/shared`; never hard-code hex values or use gold text on white. Mobile text comes from `@/text`.
- **Tracker:** [PROJECT_PLAN.md](PROJECT_PLAN.md) is the single source of progress, decisions (Decision Log), and open questions.

## Workflow

1. Before starting work, read `PROJECT_PLAN.md` → "Current status" and pick the next unchecked item in the current phase.
2. Work one item (or a small group) at a time. Don't jump phases without the user's OK.
3. Mark an item `[x]` only when it works **and** its tests pass. Items marked 🔒 need a negative (bypass) test.
4. After finishing work, update: item checkboxes, "Current status", the Progress Log, and any acceptance rows (L/A/DV/D/MS) that now have tests.
5. Any deviation from the spec → add a Decision Log entry first.
6. New ambiguity → add it to Open Questions rather than guessing silently.

## Non-negotiable rules

- Server is authoritative for location, role, account status, vote totals, and ownership. Never trust the client.
- Every write endpoint: auth guard → strict zod schema → rate limit → location check (if applicable) → ownership check.
- Public responses go through public serializers only. Never return email, birth year, password hash, enforcement notes, or precise coordinates.
- No secrets in git. `.env.example` holds placeholders only.
- No public deployment and no paid services without explicit user approval.
- Don't build out-of-scope features (see the tracker's "Out of Scope" section).
