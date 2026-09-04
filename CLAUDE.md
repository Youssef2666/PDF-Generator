@AGENTS.md

## Skills, subagents, commands and hooks

<!-- TODO(M7): populate as each is added. docs/agents.md is the full reference;
     this section is only an index so a session knows what exists. -->

**Skills** — none yet.
- TODO(M4): `.claude/skills/office-rtl/` — RTL rules for docx/xlsx/pptx output.
- TODO(M6): `.claude/skills/pdf-attendance/` — the PDF extraction workflow.

**Subagents** — none yet.
- TODO(M7): `.claude/agents/report-auditor.md` — read-only draft auditor.
- TODO(M7): `.claude/agents/rtl-reviewer.md` — reviews RTL correctness.

**Commands** — none yet.
- TODO(M7): `/adr`, `/fixture`.

**Hooks** — one registered.
- `SessionStart` → `.claude/hooks/session-context.sh`. Reports whether a draft
  exists and whether the dev server is up.
- TODO(M1): `PostToolUse` (http) draft validation; `PreToolUse` (command)
  protect-uploads.
- TODO(M7): `Stop` → report-auditor.
