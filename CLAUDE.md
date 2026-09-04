@AGENTS.md

## Skills, subagents, commands and hooks

Full reference, with each one's boundary and why it uses the handler type it
does: **docs/agents.md**. This is only an index.

**Skills**
- `.claude/skills/office-rtl/` — Word, Excel and PowerPoint RTL rules, each
  with the symptom it fixes. Written to stand alone; knows nothing about this
  project.
- `.claude/skills/pdf-attendance/` — the extraction workflow: writing a
  profile for a new client layout, the failure modes, and the rules governing
  the model fallback.

**Subagents**
- `.claude/agents/report-auditor.md` — read-only audit of the draft's
  invariants. Also the target of the `Stop` hook.
- `.claude/agents/rtl-reviewer.md` — reviews renderer changes against the RTL
  catalogue. Starts by running `pnpm verify:rtl`.

**Commands**
- `/adr <decision>` — write an ADR, with the rejected options.
- `/fixture` — regenerate the fixtures and run what depends on them.

**Hooks** — four, using three handler types on purpose.
- `PostToolUse` (http) → `/api/hooks/validate-draft`. Validates the draft
  after any Edit or Write. **Inert when the dev server is down.**
- `PreToolUse` (command) → `protect-uploads.mjs`. Refuses writes into
  `data/uploads/`; must hold with no server running, hence a command hook.
- `Stop` (agent) → the report auditor.
- `SessionStart` (command) → `session-context.sh`. Reports whether a draft
  exists and whether localhost:3000 responds.
